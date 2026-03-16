#!/usr/bin/env tsx
/**
 * Booking Queue Worker - External worker to process booking_intents
 * 
 * This is a workaround for n8n Cron Trigger not executing in queue mode.
 * Run this script every 30 seconds via cron job or systemd timer.
 * 
 * Usage: npx tsx scripts-ts/booking_queue_worker.ts
 */

import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Configuration
const N8N_BASE_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY || process.env.N8N_ACCESS_TOKEN || '';
const DB_URL = process.env.DATABASE_URL || '';
const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE || '5', 10);
const MAX_CONCURRENT = parseInt(process.env.WORKER_MAX_CONCURRENT || '3', 10);

// Database pool
const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Rate limiter
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
  console.log(`✅ Intent ${intentId} marked as COMPLETED`);
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
  console.log(`❌ Intent ${intentId} marked as FAILED: ${errorMessage}`);
}

async function processIntent(intent: BookingIntent): Promise<void> {
  const startTime = Date.now();
  console.log(`\n🔄 Processing intent ${intent.id}...`);
  console.log(`   Provider: ${intent.provider_id}, Service: ${intent.service_id}`);
  console.log(`   Start: ${intent.start_time}`);
  console.log(`   Customer: ${intent.customer_id || intent.chat_id}`);

  try {
    // Mark as processing
    await markProcessing(intent.id);

    // Call WF2 Booking Orchestrator via public URL (or internal if running in Docker)
    const orchestratorUrl = process.env.ORCHESTRATOR_URL || 
      'https://n8n.stax.ink/webhook/booking-orchestrator';
    
    const response = await axios.post(
      orchestratorUrl,
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
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.error_message || error.message || 'Unknown error';
    const errorCode = error.response?.data?.error_code || 'WORKFLOW_ERROR';
    
    await markFailed(intent.id, errorCode, errorMessage);
    console.log(`   ⏱️  Processing time: ${Date.now() - startTime}ms`);
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('🤖 BOOKING QUEUE WORKER');
  console.log(`   Batch Size: ${BATCH_SIZE}`);
  console.log(`   Max Concurrent: ${MAX_CONCURRENT}`);
  console.log(`   N8N URL: ${N8N_BASE_URL}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  try {
    // Get pending intents
    const intents = await getPendingIntents(BATCH_SIZE);

    if (intents.length === 0) {
      console.log('✅ No pending intents to process');
      return;
    }

    console.log(`📋 Found ${intents.length} pending intent(s)`);

    // Process intents with rate limiting
    const promises = intents.map(intent =>
      rateLimiter.run(() => processIntent(intent))
    );

    await Promise.all(promises);

    console.log('\n✅ Batch processing complete');
  } catch (error: any) {
    console.error('❌ Worker error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run worker
main().catch(console.error);
