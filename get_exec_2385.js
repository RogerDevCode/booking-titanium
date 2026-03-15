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
    const list = await axios.get(`${apiUrl}/executions?limit=5&workflowId=331l1dm2pmFsSWBF`, { headers });
    const id = list.data.data[0].id;
    console.log('Fetching ID:', id);
    const res = await axios.get(`${apiUrl}/executions/${id}?includeData=true`, { headers });
    fs.writeFileSync('orch_exec.json', JSON.stringify(res.data, null, 2));
    console.log('Saved to orch_exec.json');
  } catch(e) { console.log(e.message); }
}
run();
