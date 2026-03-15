const fs = require('fs');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

let apiKey = '';
const envContent = fs.readFileSync('.env', 'utf8');
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '');
    break;
  }
}

async function run() {
  try {
    const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
    const myWf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

    // Just pull it down again exactly as n8n wants it to be.
    const res = await axios.get('http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN', { headers });
    let remoteWf = res.data;

    // To prevent additional properties error, we only replace exactly what we need
    
    // We update JS code in the Process Idempotency node
    const localIdemp = myWf.nodes.find(n => n.name === 'Process Idempotency');
    const remoteIdemp = remoteWf.nodes.find(n => n.name === 'Process Idempotency');
    if (remoteIdemp && localIdemp) {
      remoteIdemp.parameters = localIdemp.parameters;
    }

    const localDupIf = myWf.nodes.find(n => n.name === 'Is Duplicate?');
    const remoteDupIf = remoteWf.nodes.find(n => n.name === 'Is Duplicate?');
    if (remoteDupIf && localDupIf) {
      remoteDupIf.parameters = localDupIf.parameters;
    }

    const localReturnDup = myWf.nodes.find(n => n.name === 'Return Duplicate SCO');
    const remoteReturnDup = remoteWf.nodes.find(n => n.name === 'Return Duplicate SCO');
    if (remoteReturnDup && localReturnDup) {
      remoteReturnDup.parameters = localReturnDup.parameters;
    }

    // Push it back using exact same structure
    await axios.put(`http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN`, remoteWf, { headers });
    console.log('Successfully patched Context fix using valid remote schema structure.');
    
    // We also need to activate the workflow if it's inactive
    await axios.post(`http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN/activate`, {}, { headers });
    console.log('Activated.');
  } catch (e) {
    console.error('Failed to patch WF:', e.response?.data || e.message);
  }
}
run();
