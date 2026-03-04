import { N8NCrudAgent } from './n8n_crud_agent';
import * as fs from 'fs';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

async function main() {
    const agent = new N8NCrudAgent('https://n8n.stax.ink');
    const execId = process.argv[2] || '161';
    console.log(`Fetching execution details for ${execId}...`);
    const data = await agent.getExecutionById(execId);
    if (data) {
        fs.writeFileSync(`exec_${execId}_details.json`, JSON.stringify(data, null, 2));
        console.log(`Saved details to exec_${execId}_details.json`);
    } else {
        console.error('Failed to fetch execution details.');
    }
    // Cancel watchdog on success
    watchdog.cancel();
}

main().catch((error) => {
    watchdog.cancel();
    console.error(error);
});
