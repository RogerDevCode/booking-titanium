const axios = require('axios');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '').trim();
    break;
  }
}

const apiUrl = 'http://localhost:5678/api/v1';
const headers = { 'X-N8N-API-KEY': apiKey };

async function run() {
  try {
    const list = await axios.get(`${apiUrl}/workflows`, { headers });
    list.data.data.forEach(w => {
      const webhookNodes = w.nodes.filter(n => n.type === 'n8n-nodes-base.webhook');
      const webhookPaths = webhookNodes.map(n => n.parameters.path || 'default');
      console.log(`ID: ${w.id}, Active: ${w.active}, Name: ${w.name}, Webhooks: ${webhookPaths.join(', ')}`);
    });
  } catch(e) { console.log(e.message); }
}
run();
