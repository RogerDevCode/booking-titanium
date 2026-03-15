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
  const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));
  try {
    const listRes = await axios.get(`${apiUrl}/workflows`, { headers });
    const existing = listRes.data.data.find(w => w.name === wf.name);
    
    if (existing) {
      const putRes = await axios.put(`${apiUrl}/workflows/${existing.id}`, wf, { headers });
      console.log('Updated OK', putRes.data.id);
      await axios.post(`${apiUrl}/workflows/${existing.id}/activate`, {}, { headers });
      console.log('Activated OK');
    } else {
      const postRes = await axios.post(`${apiUrl}/workflows`, wf, { headers });
      console.log('Created OK', postRes.data.id);
      await axios.post(`${apiUrl}/workflows/${postRes.data.id}/activate`, {}, { headers });
      console.log('Activated OK');
    }
  } catch (e) {
    console.log('API Error:', e.response?.data || e.message);
  }
}
run();
