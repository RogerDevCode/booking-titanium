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
const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };

async function deploy() {
  try {
    const listRes = await axios.get(`${apiUrl}/workflows`, { headers });
    const existing = listRes.data.data.find(w => w.name === 'WF2_Booking_Orchestrator');
    
    if (existing) {
        console.log("Found workflow, deleting it first to avoid schema mismatch:", existing.id);
        await axios.delete(`${apiUrl}/workflows/${existing.id}`, { headers });
    }
    
    // Now push fresh using crud agent
  } catch (e) {
    console.error(`Failed:`, e.response?.data || e.message);
  }
}
deploy();
