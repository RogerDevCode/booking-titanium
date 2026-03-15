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
    const res = await axios.get(`${apiUrl}/workflows/ZgiDJcBT61v43NvN`, { headers });
    let remoteWf = res.data;

    // Check DB Idempotency MUST output empty items if there's no result, 
    // otherwise the next node never triggers.
    // That's what alwaysOutputData: true does on Postgres node.
    // Since n8n API strips alwaysOutputData, we'll patch the subsequent JS node 
    // to read from the PREVIOUS node if items is empty.
    
    // Wait, if it doesn't output anything, the NEXT node doesn't execute AT ALL.
    // So the pipeline DIES silently.
    
    // Is there a way to make Postgres node always output data via parameters?
    // Let's check n8n docs. It's usually a node setting. 
    // Let's just add "alwaysOutputData": true to the node via API anyway to see if it takes it when inside a settings object.
    
    // Wait, the API rejects it. BUT, maybe the new n8n versions use 'alwaysOutputData' inside 'settings' parameter of the node?
    // No, let's just make the Postgres node use a query that ALWAYS returns a row.
    
    const checkDb = remoteWf.nodes.find(n => n.name === 'Check Idempotency DB');
    if (checkDb) {
      // Return a row even if not found.
      // SELECT id, status, gcal_event_id FROM bookings WHERE idempotency_key = $1::text LIMIT 1
      // Change to:
      // SELECT b.id, b.status, b.gcal_event_id FROM (SELECT 1) dummy LEFT JOIN bookings b ON b.idempotency_key = $1::text LIMIT 1;
      
      checkDb.parameters.query = "SELECT b.id, b.status, b.gcal_event_id FROM (SELECT 1) dummy LEFT JOIN bookings b ON b.idempotency_key = $1::text AND b.status != 'CANCELLED' LIMIT 1;";
    }

    delete remoteWf.id;
    delete remoteWf.createdAt;
    delete remoteWf.updatedAt;
    delete remoteWf.tags;
    
    await axios.put(`${apiUrl}/workflows/ZgiDJcBT61v43NvN`, remoteWf, { headers });
    console.log('Successfully patched Check DB Idempotency with LEFT JOIN trick.');

  } catch (e) {
    console.error('Failed to patch:', e.response?.data || e.message);
  }
}
run();
