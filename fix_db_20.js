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

    // Activate the workflow first, maybe it's just inactive and that's why it returns 404
    await axios.post(`${apiUrl}/workflows/ZgiDJcBT61v43NvN/activate`, {}, { headers });
    console.log('Successfully activated workflow ZgiDJcBT61v43NvN.');

  } catch (e) {
    console.error('Failed to activate:', e.response?.data || e.message);
  }
}
run();
