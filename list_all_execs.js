const axios = require('axios');
const fs = require('fs');
require('dotenv').config();
let apiKey = fs.readFileSync('.env', 'utf8').split('\n').find(l => l.startsWith('N8N_API_KEY=')).split('=')[1].replace(/['"]/g, '');
const apiUrl = 'http://localhost:5678/api/v1';
const headers = { 'X-N8N-API-KEY': apiKey };

async function run() {
  try {
    const list = await axios.get(apiUrl + '/executions?limit=10', { headers });
    list.data.data.forEach(ex => {
        console.log('ID:', ex.id, 'WF:', ex.workflowId, 'Status:', ex.status);
    });
  } catch(e) { console.log(e.message); }
}
run();
