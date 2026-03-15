const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '.env' });

// N8N_API_KEY could be overridden, let's force read it
const envContent = fs.readFileSync('.env', 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '');
    break;
  }
}

const apiUrl = 'http://localhost:5678/api/v1';

async function createWf() {
  const wf = JSON.parse(fs.readFileSync('./workflows/seed_clean/CB_01_Check_State.json', 'utf8'));
  
  // Clean potentially problematic fields for create
  delete wf.id;
  delete wf.createdAt;
  delete wf.updatedAt;
  delete wf.pinData;
  delete wf.versionId;
  delete wf.active;
  
  try {
    const response = await axios.post(`${apiUrl}/workflows`, wf, {
      headers: {
        'X-N8N-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    });
    console.log('Success:', response.data.id);
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

createWf();
