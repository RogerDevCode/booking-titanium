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

    const res = await axios.get('http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN', { headers });
    let remoteWf = res.data;

    // VERY CAREFUL PATCHING
    const idemp = remoteWf.nodes.find(n => n.name === 'Process Idempotency');
    const myIdemp = myWf.nodes.find(n => n.name === 'Process Idempotency');
    if (idemp && myIdemp) idemp.parameters.jsCode = myIdemp.parameters.jsCode;
    
    const isDup = remoteWf.nodes.find(n => n.name === 'Is Duplicate?');
    const myIsDup = myWf.nodes.find(n => n.name === 'Is Duplicate?');
    if (isDup && myIsDup) isDup.parameters.conditions = myIsDup.parameters.conditions;

    const dupSco = remoteWf.nodes.find(n => n.name === 'Return Duplicate SCO');
    const myDupSco = myWf.nodes.find(n => n.name === 'Return Duplicate SCO');
    if (dupSco && myDupSco) dupSco.parameters.jsCode = myDupSco.parameters.jsCode;
    
    // Explicitly add missing connections
    remoteWf.connections = myWf.connections;
    
    const allowedKeys = ['name', 'nodes', 'connections', 'settings', 'staticData', 'meta', 'pinData', 'versionId'];
    const finalWf = {};
    allowedKeys.forEach(k => {
      if (remoteWf[k] !== undefined) finalWf[k] = remoteWf[k];
    });

    await axios.put(`http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN`, finalWf, { headers });
    console.log('Successfully patched.');
    
  } catch (e) {
    console.error('Failed to patch WF:', e.response?.data || e.message);
  }
}
run();
