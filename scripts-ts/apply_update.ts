import { N8NCrudAgent } from './n8n_crud_agent';
import * as fs from 'fs';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

async function main() {
    const API_URL = 'https://n8n.stax.ink';
    const agent = new N8NCrudAgent(API_URL);
    const workflowId = 'yqHLjXUggLa8tE4Z';
    const filePath = 'workflows/NN_01_Booking_Gateway.json';

    console.log(`Updating workflow ${workflowId} from ${filePath}...`);
    const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const allowedKeys = ['name', 'nodes', 'connections', 'settings'];
    const updateData: any = {};
    allowedKeys.forEach(key => { if (workflowData[key] !== undefined) updateData[key] = workflowData[key]; });

    const result = await agent.updateWorkflow(workflowId, updateData);
    if (result) {
        console.log('✅ NN_01 Updated and Stabilized!');
        await agent.activateWorkflow(workflowId);
    }
    
    // Cancel watchdog on success
    watchdog.cancel();
}

main().catch((error) => {
    watchdog.cancel();
    console.error('Fatal error:', error);
    process.exit(1);
});
