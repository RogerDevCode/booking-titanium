import * as fs from 'fs';
import * as path from 'path';

const SEED_DIR = '/home/manager/Sync/N8N Projects/booking-titanium/workflows/seed_clean/';

const ALLOWED_SETTINGS = ['executionOrder'];

function pruneWorkflow(wf: any) {
    // 2. Ensure no "id" exists at root
    delete wf.id;
    // 3. Ensure no "versionId" exists at root
    delete wf.versionId;
    // 4. Ensure no "active" exists at root
    delete wf.active;

    // 1. Strip ALL fields from "settings" except standard ones
    if (wf.settings) {
        const newSettings: any = {};
        for (const key of ALLOWED_SETTINGS) {
            if (wf.settings[key] !== undefined) {
                newSettings[key] = wf.settings[key];
            }
        }
        wf.settings = newSettings;
    }

    // 2. Ensure no "id" exists in any node
    if (Array.isArray(wf.nodes)) {
        for (const node of wf.nodes) {
            delete node.id;
        }
    }

    // 5. In connections, ensure no "id" exists
    if (wf.connections) {
        // Connections structure: { "Node Name": { "main": [ [ { "node": "Next Node", "type": "main", "index": 0 } ] ] } }
        // Sometimes connections might have IDs if exported from certain versions? 
        // Let's recursively check for "id" in connections just in case.
        pruneIdRecursive(wf.connections);
    }

    return wf;
}

function pruneIdRecursive(obj: any) {
    if (Array.isArray(obj)) {
        for (const item of obj) {
            pruneIdRecursive(item);
        }
    } else if (obj !== null && typeof obj === 'object') {
        delete obj.id;
        for (const key in obj) {
            pruneIdRecursive(obj[key]);
        }
    }
}

function main() {
    const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'));

    for (const file of files) {
        const filePath = path.join(SEED_DIR, file);
        console.log(`Pruning ${file}...`);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const pruned = pruneWorkflow(content);
        fs.writeFileSync(filePath, JSON.stringify(pruned, null, 2), 'utf-8');
    }
    console.log('Pruning complete.');
}

main();
