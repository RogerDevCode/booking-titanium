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
const headers = { 'X-N8N-API-KEY': apiKey };

async function run() {
  const id = 'jjebYBy0HqoqYr92';
  try {
    await axios.post(`${apiUrl}/workflows/${id}/activate`, {}, { headers });
    console.log('Activated WF5');
  } catch(e) { console.log(e.response?.data || e.message); }
}
run();
