import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();
async function run() {
  const apiKey = process.env.N8N_API_KEY;
  const rs = await axios.get('https://n8n.stax.ink/api/v1/executions?limit=3', {
    headers: { 'X-N8N-API-KEY': apiKey }
  });
  
  for(const r of rs.data.data) {
    if(r.workflowId === '0pqnF4CQSGJMp7br') {
        const exec = await axios.get(`https://n8n.stax.ink/api/v1/executions/${r.id}?includeData=true`, {
          headers: { 'X-N8N-API-KEY': apiKey }
        });
        const runData = exec.data.data.resultData.runData;
        const fs = require('fs');
        fs.writeFileSync('temp/runData.json', JSON.stringify(runData, null, 2));
        break;
    }
  }
}
run();
