import axios from 'axios';
import fs from 'fs';
require('dotenv').config();

async function run() {
  const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
  const res = await axios.get(`${N8N_URL}/api/v1/executions?limit=1&workflowId=0pqnF4CQSGJMp7br`, {
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
  });
  const execId = res.data.data[0].id;
  const exec = await axios.get(`${N8N_URL}/api/v1/executions/${execId}?includeData=true`, {
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY }
  });
  
  const insertData = exec.data.data.resultData.runData['Execute Insert'];
  console.log(JSON.stringify(insertData, null, 2));
}
run();
