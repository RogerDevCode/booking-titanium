import axios from 'axios';
import * as fs from 'fs';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';
import { N8NConfig } from './config';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

// Initialize config (loads .env automatically from project root)
const config = new N8NConfig();

const API_URL = config.api_url;
const API_KEY = config.api_key;

async function updateWorkflow(id: string, filePath: string) {
    if (!API_KEY) throw new Error('No API key in .env (N8N_API_KEY / N8N_ACCESS_TOKEN)');
    
    const client = axios.create({
      baseURL: `${API_URL}/api/v1`,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    });

    console.log(`Reading ${filePath}...`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Merge id
    data.id = id;

    console.log(`Updating workflow ${id}...`);
    try {
        const res = await client.put(`/api/v1/workflows/${id}`, data);
        console.log('Update OK');

        console.log(`Activating workflow ${id}...`);
        await client.post(`/api/v1/workflows/${id}/activate`);
        console.log('Activation OK');
        // Cancel watchdog on success
        watchdog.cancel();
    } catch(e: any) {
        watchdog.cancel();
        console.error('Error:', e.response?.data || e.message);
    }
}

const id = process.argv[2];
const file = process.argv[3];
if (id && file) {
    updateWorkflow(id, file);
} else {
    console.log('Usage: tsx update-wf.ts <id> <file.json>');
}
