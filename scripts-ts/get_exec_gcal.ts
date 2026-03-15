import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const api = axios.create({
  baseURL: 'https://n8n.stax.ink/api/v1',
  headers: { 'X-N8N-API-KEY': process.env.X_N8N_API_KEY }
});

async function run() {
  const r = await api.get('/executions?includeData=true&limit=20');
  const gcalExecs = r.data.data.filter(e => e.workflowId !== 'HxMojMqbRiNgquvd' && e.status === 'error');
  if (gcalExecs.length > 0) {
    fs.writeFileSync('/tmp/error_gcal.json', JSON.stringify(gcalExecs[0], null, 2));
    console.log("Saved execution to /tmp/error_gcal.json");
  } else {
    console.log("No error execution found");
  }
}
run().catch(console.error);
