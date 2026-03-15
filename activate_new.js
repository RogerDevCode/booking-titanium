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
const headers = { 'X-N8N-API-KEY': apiKey };

async function run() {
  const ids = ['XRMU2cqA3fxU9e2I', '85HqM7BIAApvfKbm'];
  for (const id of ids) {
    try {
      await axios.post(`${apiUrl}/workflows/${id}/activate`, {}, { headers });
      console.log(`Activated ${id}`);
    } catch(e) { console.log(e.response?.data || e.message); }
  }
}
run();
