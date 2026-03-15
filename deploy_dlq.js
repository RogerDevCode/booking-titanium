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
const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };

async function deploy() {
  const files = [
    'DLQ_01_Add_Entry.json',
    'DLQ_02_Get_Status.json',
    'DLQ_Retry.json'
  ];
  
  for (const file of files) {
    const wf = JSON.parse(fs.readFileSync(`./workflows/seed_clean/${file}`, 'utf8'));
    delete wf.id;
    delete wf.active;
    
    try {
      const res = await axios.post(`${apiUrl}/workflows`, wf, { headers });
      console.log(`Deployed ${file} with ID: ${res.data.id}`);
      await axios.post(`${apiUrl}/workflows/${res.data.id}/activate`, {}, { headers });
      console.log(`Activated ${file}`);
    } catch (e) {
      console.error(`Failed ${file}:`, e.response?.data || e.message);
    }
  }
}
deploy();
