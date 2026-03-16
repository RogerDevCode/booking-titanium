/**
 * @file rag_01.test.ts
 * @description Basic tests for RAG_01_Document_Ingestion workflow
 * 
 * ⚠️  NON-SATURATING EXECUTION:
 *    - Uses maxWorkers: 1 to prevent CPU overload
 *    - Sequential test execution with delays between tests
 *    - Jest configuration: workerIdleMemoryLimit: 512MB
 * 
 * 📊 Jest Configuration (jest.config.js):
 *    - maxWorkers: 1 - Prevents CPU saturation during test execution
 *    - testTimeout: 60000ms - Allows for document ingestion
 *    - workerIdleMemoryLimit: 512MB - Memory management
 * 
 * 🚀 Performance Notes:
 *    - No sobrecargar el CPU - tests run sequentially
 *    - Document processing is memory-intensive, sequential execution prevents OOM
 *    - Batching: Tests include delays for embedding generation
 * 
 * Tests document ingestion with RAG pattern (embedding + PostgreSQL + pgvector)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const N8N_URL = process.env.N8N_API_URL?.replace('/api/v1', '') || 'https://n8n.stax.ink';
const WEBHOOK_PATH = 'rag-ingest-document';

async function callWebhook(method: string = 'POST', body?: any): Promise<any> {
  const url = `${N8N_URL}/webhook/${WEBHOOK_PATH}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json();
  
  // Log raw response for debugging
  console.log(`Webhook response (${url}):`, JSON.stringify(data, null, 2));
  
  return data;
}

// ═══════════════════════════════════════════════
// RAG_01_Document_Ingestion — Basic Tests
// ═══════════════════════════════════════════════
describe('RAG_01_Document_Ingestion', () => {
  
  // Test 1: Valid document ingestion (schedule)
  it('ingests valid schedule document with Standard Contract output', async () => {
    const data = await callWebhook('POST', {
      provider_id: 1,
      title: 'Horarios de Atención',
      content: 'Nuestra clínica atiende de lunes a viernes de 8:00 AM a 8:00 PM, y sábados de 9:00 AM a 2:00 PM. Los domingos y festivos estamos cerrados.',
      source_type: 'schedule',
      status: 'published',
      language: 'es',
      metadata: { version: '1.0', author: 'admin' }
    });

    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.error_message).toBeNull();
    expect(data.data).toBeDefined();
    expect(data.data.document_id).toBeDefined();
    expect(data._meta.source).toBe('RAG_01_Document_Ingestion');
  }, 60000);

  // Test 2: Valid document ingestion (policy)
  it('ingests valid policy document', async () => {
    const data = await callWebhook('POST', {
      provider_id: 1,
      title: 'Política de Cancelación',
      content: 'Las reservas pueden cancelarse sin cargo hasta 24 horas antes de la cita. Cancelaciones con menos de 24 horas tendrán un cargo del 50% del valor.',
      source_type: 'policy',
      status: 'published',
      language: 'es'
    });

    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data._meta.source).toBe('RAG_01_Document_Ingestion');
  }, 60000);

  // Test 3: Invalid document (negative provider_id)
  it('rejects document with invalid provider_id', async () => {
    const data = await callWebhook('POST', {
      provider_id: -1,
      title: 'Test Invalido',
      content: 'Este documento no debería guardarse en la base de datos'
    });

    expect(data.success).toBe(false);
    expect(data.error_code).toBeDefined();
    expect(data.data).toBeNull();
  }, 60000);

  // Test 4: Invalid document (content too short)
  it('rejects document with content too short', async () => {
    const data = await callWebhook('POST', {
      provider_id: 1,
      title: 'Test Contenido Corto',
      content: 'Corto' // menos de 10 chars
    });

    expect(data.success).toBe(false);
    expect(data.error_code).toBeDefined();
  }, 60000);

  // Test 5: Invalid document (missing required fields)
  it('rejects document with missing required fields', async () => {
    const data = await callWebhook('POST', {
      title: 'Sin provider_id',
      content: 'Contenido de prueba sin provider_id'
    });

    expect(data.success === false || data.error).toBeDefined();
  }, 60000);

  // Test 6: Standard Contract validation
  it('returns complete Standard Contract structure', async () => {
    const data = await callWebhook('POST', {
      provider_id: 1,
      title: 'Test Standard Contract',
      content: 'Documento de prueba para validar estructura de contrato estándar.',
      source_type: 'policy',
      status: 'published',
      language: 'es'
    });

    // Validate Standard Contract fields (O02 pattern)
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('error_code');
    expect(data).toHaveProperty('error_message');
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('_meta');
    
    // Validate _meta structure
    expect(data._meta).toHaveProperty('source');
    expect(data._meta).toHaveProperty('timestamp');
    expect(data._meta.source).toBe('RAG_01_Document_Ingestion');
  }, 60000);
});
