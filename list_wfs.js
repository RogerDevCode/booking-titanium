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
  try {
    const list = await axios.get(`${apiUrl}/workflows`, { headers });
    list.data.data.forEach(w => {
      console.log(`ID: ${w.id}, Name: ${w.name}`);
    });
  } catch(e) { console.log(e.message); }
}
run();
