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
const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };

async function run() {
  const id = 'jjebYBy0HqoqYr92';
  const wf = JSON.parse(fs.readFileSync('./workflows/seed_clean/WF5_GCal_Collision_Check.json', 'utf8'));
  delete wf.id;
  delete wf.active;
  try {
    await axios.put(`${apiUrl}/workflows/${id}`, wf, { headers });
    await axios.post(`${apiUrl}/workflows/${id}/activate`, {}, { headers });
    console.log('Updated and Activated WF5');
  } catch(e) { console.log(e.response?.data || e.message); }
}
run();
