#!/usr/bin/env tsx
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.X_N8N_API_KEY || process.env.N8N_API_KEY;

async function getLastError() {
  try {
    // Get specific execution details
    const execution = await axios.get(
      `${N8N_API_URL}/api/v1/executions/2534`,
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Execution details:', JSON.stringify(execution.data, null, 2));
  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
  }
}

getLastError();
