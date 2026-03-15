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
  const file = 'WF5_GCal_Collision_Check.json';
  const wf = JSON.parse(fs.readFileSync(`./workflows/seed_clean/${file}`, 'utf8'));
  
  try {
    const listRes = await axios.get(`${apiUrl}/workflows`, { headers });
    const existing = listRes.data.data.find(w => w.name === wf.name);
    
    let id;
    if (existing) {
      await axios.put(`${apiUrl}/workflows/${existing.id}`, wf, { headers });
      id = existing.id;
      console.log(`Updated ${file} with ID: ${id}`);
    } else {
      const res = await axios.post(`${apiUrl}/workflows`, wf, { headers });
      id = res.data.id;
      console.log(`Deployed ${file} with ID: ${id}`);
    }
    
    await axios.post(`${apiUrl}/workflows/${id}/activate`, {}, { headers });
    console.log(`Activated ${file}`);
  } catch (e) {
    console.error(`Failed ${file}:`, e.response?.data || e.message);
  }
}
deploy();
