const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const envContent = fs.readFileSync('.env', 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '');
    break;
  }
}

const apiUrl = 'http://localhost:5678/api/v1';
const headers = { 'X-N8N-API-KEY': apiKey };

async function run() {
  try {
    const list = await axios.get(`${apiUrl}/executions?limit=5`, { headers });
    list.data.data.forEach(ex => {
        console.log(`ID: ${ex.id}, Workflow: ${ex.workflowId}, Status: ${ex.status}, Error: ${JSON.stringify(ex.error)}`);
    });
  } catch(e) { console.log(e.message); }
}
run();
