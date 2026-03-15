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
  try {
    const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_FINAL.json', 'utf8'));
    delete wf.id;
    delete wf.createdAt;
    delete wf.updatedAt;
    delete wf.tags;
    
    await axios.put(`${apiUrl}/workflows/ZgiDJcBT61v43NvN`, wf, { headers });
    console.log('Successfully applied FINAL patches.');
  } catch (e) {
    console.error('Failed to patch:', e.response?.data || e.message);
  }
}
run();
