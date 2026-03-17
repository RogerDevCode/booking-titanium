#!/usr/bin/env tsx
/**
 * Booking Queue Worker - Standalone con Loop Infinito
 * 
 * Alternativa al Cron Trigger en queue mode (bug conocido n8n)
 * 
 * Características:
 * - Se ejecuta continuamente
 * - Procesa intents cada 30 segundos
 * - No depende de webhooks o triggers externos
 * - Graceful shutdown con señales SIGTERM/SIGINT
 * 
 * Uso:
 *   npx tsx scripts-ts/booking_queue_worker_standalone.ts
 * 
 * Docker:
 *   docker run booking-queue-worker
 */

import { Pool } from 'pg';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const DB_URL = process.env.DATABASE_URL || '';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 
  'http://n8n_titanium:5678/webhook/booking-orchestrator';
const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE || '5', 10);
const MAX_CONCURRENT = parseInt(process.env.WORKER_MAX_CONCURRENT || '3', 10);
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL || '30000', 10);

// ============================================================================
// DATABASE POOL
// ============================================================================

const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_CONCURRENT) {
      await new Promise<void>(resolve => {
        this.queue.push(resolve);
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const rateLimiter = new RateLimiter();

// ============================================================================
// INTERFACES
// ============================================================================

interface BookingIntent {
  id: string;
  provider_id: number;
  service_id: number;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  customer_id: string | null;
  chat_id: number | null;
  user_id: number | null;
  event_title: string | null;
  idempotency_key: string;
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

async function getPendingIntents(limit: number): Promise<BookingIntent[]> {
  const result = await pool.query(
    'SELECT * FROM fn_booking_get_pending($1)',
    [limit]
  );
  return result.rows;
}

async function markProcessing(intentId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT fn_booking_mark_processing($1::uuid)',
    [intentId]
  );
  return result.rows[0]?.fn_booking_mark_processing || false;
}

async function markCompleted(
  intentId: string,
  bookingId: number,
  gcalEventId: string
): Promise<void> {
  await pool.query(
    'SELECT fn_booking_mark_completed($1::uuid, $2::int, $3::text)',
    [intentId, bookingId, gcalEventId]
  );
  console.log(`✅ Intent ${intentId.substring(0, 8)}... marked as COMPLETED`);
}

async function markFailed(
  intentId: string,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  await pool.query(
    'SELECT fn_booking_mark_failed($1::uuid, $2::text, $3::text)',
    [intentId, errorCode, errorMessage]
  );
  console.log(`❌ Intent ${intentId.substring(0, 8)}... marked as FAILED: ${errorMessage}`);
}

// ============================================================================
// WORKFLOW PROCESSING
// ============================================================================

async function processIntent(intent: BookingIntent): Promise<void> {
  const startTime = Date.now();
  console.log(`\n🔄 Processing intent ${intent.id.substring(0, 8)}...`);
  console.log(`   Provider: ${intent.provider_id}, Service: ${intent.service_id}`);
  console.log(`   Start: ${intent.start_time}`);
  console.log(`   Customer: ${intent.customer_id || intent.chat_id}`);

  try {
    // Mark as processing
    await markProcessing(intent.id);

    // Call WF2 Booking Orchestrator
    const response = await axios.post(
      ORCHESTRATOR_URL,
      {
        provider_id: intent.provider_id,
        service_id: intent.service_id,
        start_time: intent.start_time,
        end_time: intent.end_time,
        duration_minutes: intent.duration_minutes,
        customer_id: intent.customer_id || '',
        chat_id: intent.chat_id || '',
        user_id: intent.user_id || '',
        event_title: intent.event_title || ''
      },
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const result = response.data;

    if (result.success && result.data?.booking_id) {
      await markCompleted(
        intent.id,
        result.data.booking_id,
        result.data.gcal_event_id || 'N/A'
      );
      console.log(`   ⏱️  Processing time: ${Date.now() - startTime}ms`);
    } else {
      await markFailed(
        intent.id,
        result.error_code || 'ORCHESTRATOR_ERROR',
        result.error_message || 'Unknown orchestrator error'
      );
      console.log(`   ⏱️  Processing time: ${Date.now() - startTime}ms`);
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.error_message || error.message || 'Unknown error';
    const errorCode = error.response?.data?.error_code || 'WORKFLOW_ERROR';
    
    await markFailed(intent.id, errorCode, errorMessage);
    console.log(`   ⏱️  Processing time: ${Date.now() - startTime}ms`);
  }
}

// ============================================================================
// MAIN LOOP
// ============================================================================

let isRunning = true;

async function mainLoop(): Promise<void> {
  console.log('='.repeat(80));
  console.log('🤖 BOOKING QUEUE WORKER - STANDALONE MODE');
  console.log(`   Poll Interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`   Batch Size: ${BATCH_SIZE}`);
  console.log(`   Max Concurrent: ${MAX_CONCURRENT}`);
  console.log(`   Orchestrator: ${ORCHESTRATOR_URL}`);
  console.log(`   Started: ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  console.log('');

  let iteration = 0;

  while (isRunning) {
    iteration++;
    const loopStart = Date.now();

    try {
      console.log(`\n📋 [Iteration ${iteration}] Fetching pending intents...`);

      // Get pending intents
      const intents = await getPendingIntents(BATCH_SIZE);

      if (intents.length === 0) {
        console.log('✅ No pending intents to process');
      } else {
        console.log(`📋 Found ${intents.length} pending intent(s)`);

        // Process intents with rate limiting
        const promises = intents.map(intent =>
          rateLimiter.run(() => processIntent(intent))
        );

        await Promise.all(promises);

        console.log('\n✅ Batch processing complete');
      }
    } catch (error: any) {
      console.error('❌ Worker error:', error.message);
      if (error.response) {
        console.error('   Response:', error.response.data);
      }
    }

    // Wait for next iteration
    const elapsed = Date.now() - loopStart;
    const waitTime = Math.max(0, POLL_INTERVAL_MS - elapsed);

    if (waitTime > 0 && isRunning) {
      console.log(`\n⏳ Waiting ${(waitTime / 1000).toFixed(1)}s until next iteration...`);
      await sleep(waitTime);
    }
  }

  console.log('\n👋 Worker shutdown complete');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
    isRunning = false;

    // Wait for current iteration to complete
    await sleep(5000);

    // Close database pool
    await pool.end();
    console.log('Database connections closed');

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ============================================================================
// ENTRY POINT
// ============================================================================

setupGracefulShutdown();
mainLoop().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
