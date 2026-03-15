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

async function deploy() {
  const name = "WF2_Booking_Orchestrator";
  const wfPath = './workflows/seed_clean/WF2_Booking_Orchestrator.json';
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

  try {
    // 1. Delete all existing with same name
    const listRes = await axios.get(`${apiUrl}/workflows`, { headers });
    for (const item of listRes.data.data) {
      if (item.name === name) {
        console.log(`Deleting existing WF: ${item.id}`);
        await axios.delete(`${apiUrl}/workflows/${item.id}`, { headers });
      }
    }

    // 2. Prepare clean payload
    const payload = {
      name: wf.name,
      nodes: wf.nodes.map(n => {
        const { id, alwaysOutputData, webhookId, ...cleanNode } = n;
        // Postgres needs alwaysOutputData: true if it's the idempotency check
        if (n.name === 'Check DB Idempotency') {
           cleanNode.alwaysOutputData = true;
        }
        return cleanNode;
      }),
      connections: wf.connections,
      settings: wf.settings || { executionOrder: 'v1' }
    };

    // 3. Create fresh
    const createRes = await axios.post(`${apiUrl}/workflows`, payload, { headers });
    const newId = createRes.data.id;
    console.log(`Created fresh WF with ID: ${newId}`);

    // 4. Activate
    await axios.post(`${apiUrl}/workflows/${newId}/activate`, {}, { headers });
    console.log('Activated OK');

  } catch (e) {
    console.error('Deployment Failed:', e.response?.data || e.message);
  }
}
deploy();
