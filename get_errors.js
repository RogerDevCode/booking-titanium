const axios = require('axios');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '');
    break;
  }
}

const apiUrl = 'http://localhost:5678/api/v1';

async function run() {
  const headers = { 'X-N8N-API-KEY': apiKey };
  try {
    const res = await axios.get(`${apiUrl}/executions?limit=5`, { headers });
    res.data.data.forEach(ex => {
      console.log(`Execution ${ex.id} for workflow ${ex.workflowId} - Status: ${ex.status}`);
    });
  } catch(e) {
    console.log(e.message);
  }
}
run();