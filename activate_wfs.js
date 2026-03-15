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

async function run() {
  const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
  try {
    // Deactivate old
    await axios.post(`${apiUrl}/workflows/G15qrYLDth6n5WR7/deactivate`, {}, { headers });
    console.log('Deactivated CB_GCal_Circuit_Breaker');
    
    // Activate new
    await axios.post(`${apiUrl}/workflows/6RDslq06ZS78Zph1/activate`, {}, { headers });
    console.log('Activated CB_01_Check_State');
    
    await axios.post(`${apiUrl}/workflows/bT0r2EmUqGjc6Ioz/activate`, {}, { headers });
    console.log('Activated CB_02_Record_Result');
  } catch(e) {
    console.log(e.response ? e.response.data : e.message);
  }
}
run();
