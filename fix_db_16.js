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

    // Fix the exact properties, nothing more
    for (const remoteNode of remoteWf.nodes) {
       const localNode = myWf.nodes.find(n => n.name === remoteNode.name);
       if (localNode) {
          remoteNode.parameters = localNode.parameters;
          // Important: also copy the typeVersion to avoid schema mismatches if we upgraded the node
          if (localNode.typeVersion) remoteNode.typeVersion = localNode.typeVersion;
       }
    }
    
    // Also copy connections
    remoteWf.connections = myWf.connections;

    // Delete internal n8n IDs that are read-only and cause "additional properties"
    delete remoteWf.id;
    delete remoteWf.createdAt;
    delete remoteWf.updatedAt;
    delete remoteWf.tags;

    await axios.put(`http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN`, remoteWf, { headers });
    console.log('Successfully patched.');
    
    await axios.post(`http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN/activate`, {}, { headers });
    console.log('Activated.');
  } catch (e) {
    console.error('Failed to patch WF:', e.response?.data || e.message);
  }
}
run();
