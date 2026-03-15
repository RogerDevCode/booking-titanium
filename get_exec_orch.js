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
    const list = await axios.get(`${apiUrl}/executions?limit=3&workflowId=331l1dm2pmFsSWBF`, { headers });
    for (let i = 0; i < 3; i++) {
        const id = list.data.data[i].id;
        console.log(`Fetching ID: ${id}`);
        const res = await axios.get(`${apiUrl}/executions/${id}?includeData=true`, { headers });
        fs.writeFileSync(`orch_exec_${i}.json`, JSON.stringify(res.data, null, 2));
    }
  } catch(e) { console.log(e.message); }
}
run();
