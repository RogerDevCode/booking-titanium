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
  const res = await axios.get(`${apiUrl}/workflows`, { headers });
  const oldWfs = res.data.data.filter(w => 
    w.name.toLowerCase().includes('dlq_manager') || 
    w.name.toLowerCase().includes('dlq_retry')
  );
  
  for (const wf of oldWfs) {
    if (wf.id !== 'XRMU2cqA3fxU9e2I' && wf.id !== '85HqM7BIAApvfKbm' && wf.id !== 'Ns2XLxQCaVsVTpSC') {
      console.log(`Deactivating and deleting old WF: ${wf.id} (${wf.name})`);
      try {
        await axios.post(`${apiUrl}/workflows/${wf.id}/deactivate`, {}, { headers });
        await axios.delete(`${apiUrl}/workflows/${wf.id}`, { headers });
      } catch(e) { console.log(e.message); }
    }
  }
}
run();
