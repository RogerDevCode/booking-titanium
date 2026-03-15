#!/usr/bin/env tsx
/**
 * Test N8N Connection - Simple script to verify n8n API connectivity
 * 
 * Usage: npx tsx scripts-ts/test_n8n_connection.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios from 'axios';

// Load .env file (try multiple locations)
const possiblePaths = [
  path.join(__dirname, '.env'),           // scripts-ts/.env
  path.join(__dirname, '..', '.env'),     // project-root/.env
  path.resolve(process.cwd(), '.env'),    // cwd/.env
];

let loaded = false;
for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    // Force reload by not using cache
    const envConfig = dotenv.config({ path: envPath, override: true });
    if (envConfig.parsed) {
      // Also set in process.env explicitly
      for (const [key, value] of Object.entries(envConfig.parsed)) {
        process.env[key] = value;
      }
    }
    console.log(`✓ Loaded .env from: ${envPath}`);
    loaded = true;
    break;
  }
}

if (!loaded) {
  console.log('⚠ No .env file found, using environment variables only');
}

// Get configuration from environment variables
const N8N_URL = process.env.N8N_API_URL || process.env.N8N_HOST || 'https://n8n.stax.ink';
const X_N8N_API_KEY = process.env.X_N8N_API_KEY;
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_ACCESS_TOKEN = process.env.N8N_ACCESS_TOKEN;

console.log('\n📋 Environment Variables:');
console.log(`  N8N_URL:           ${N8N_URL}`);
console.log(`  X_N8N_API_KEY:     ${X_N8N_API_KEY ? 'SET (' + X_N8N_API_KEY.substring(0, 20) + '...)' : 'NOT SET'}`);
console.log(`  N8N_API_KEY:       ${N8N_API_KEY ? 'SET (' + N8N_API_KEY.substring(0, 20) + '...)' : 'NOT SET'}`);
console.log(`  N8N_ACCESS_TOKEN:  ${N8N_ACCESS_TOKEN ? 'SET (' + N8N_ACCESS_TOKEN.substring(0, 20) + '...)' : 'NOT SET'}`);

// Determine which API key to use (priority order)
const apiKey = X_N8N_API_KEY || N8N_API_KEY || N8N_ACCESS_TOKEN;

if (!apiKey) {
  console.error('\n❌ ERROR: No API key found!');
  console.error('Set one of these environment variables in .env:');
  console.error('  - X_N8N_API_KEY');
  console.error('  - N8N_API_KEY');
  console.error('  - N8N_ACCESS_TOKEN');
  process.exit(1);
}

// Detect if JWT token
const isJwtToken = apiKey.split('.').length === 3;

console.log(`\n🔑 Using API Key: ${isJwtToken ? 'JWT Token (Bearer)' : 'API Key (X-N8N-API-KEY)'}`);

// Test endpoints
const endpoints = [
  {
    name: '/api/v1/workflows (X-N8N-API-KEY)',
    url: `${N8N_URL}/api/v1/workflows`,
    headers: { 'X-N8N-API-KEY': apiKey }
  },
  {
    name: '/api/v1/workflows (Bearer)',
    url: `${N8N_URL}/api/v1/workflows`,
    headers: { 'Authorization': `Bearer ${apiKey}` }
  },
  {
    name: '/rest/workflows (Bearer)',
    url: `${N8N_URL}/rest/workflows`,
    headers: { 'Authorization': `Bearer ${apiKey}` }
  },
];

async function testEndpoint(name: string, url: string, headers: Record<string, string>): Promise<void> {
  try {
    const response = await axios.get(url, { headers, timeout: 10000 });
    console.log(`\n✅ SUCCESS: ${name}`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Workflows found: ${response.data?.data?.length || 'N/A'}`);
    if (response.data?.data?.length > 0) {
      console.log(`   First workflow: ${response.data.data[0].name}`);
    }
  } catch (error: any) {
    console.log(`\n❌ FAILED: ${name}`);
    console.log(`   Status: ${error.response?.status || 'N/A'}`);
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
  }
}

async function main() {
  console.log('\n🧪 Testing N8N API Endpoints...\n');
  console.log('═'.repeat(60));
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint.name, endpoint.url, endpoint.headers);
    console.log('─'.repeat(60));
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n🏁 Done!\n');
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
