#!/usr/bin/env tsx
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.X_N8N_API_KEY || process.env.N8N_API_KEY;

async function getLastExecution() {
  try {
    // Get latest execution
    const executions = await axios.get(
      `${N8N_API_URL}/api/v1/executions?workflowId=ZgiDJcBT61v43NvN&limit=1`,
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const exec = executions.data.data[0];
    if (!exec) {
      console.log('No executions found');
      return;
    }
    
    console.log(`=== Execution ${exec.id} - Status: ${exec.status} ===`);
    console.log(`Started: ${exec.startedAt}, Stopped: ${exec.stoppedAt}\n`);
    
    // Get full execution details
    const detail = await axios.get(
      `${N8N_API_URL}/api/v1/executions/${exec.id}`,
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const executionData = detail.data;
    
    if (executionData.data && executionData.data.resultData) {
      console.log('Last node executed:', executionData.data.resultData.lastNodeExecuted);
      console.log('Error:', JSON.stringify(executionData.data.resultData.error, null, 2));
      console.log('\nRun data nodes:', Object.keys(executionData.data.resultData.runData || {}));
    } else {
      console.log('No resultData - error occurred before workflow started executing');
      console.log('Full data:', JSON.stringify(executionData.data, null, 2));
    }
    
  } catch (error: any) {
    console.error('API Error:', error.response?.data || error.message);
  }
}

getLastExecution();
