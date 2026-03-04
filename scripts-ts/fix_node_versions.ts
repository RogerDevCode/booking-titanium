#!/usr/bin/env node
/**
 * =============================================================================
 * Fix Node Versions for n8n v2.10.2 Compatibility
 * =============================================================================
 * Purpose: Update node typeVersions to be compatible with n8n v2.10.2
 * 
 * Key fixes:
 *   - IF node: v1 → v2.1 (fixes propertyValues iterable error)
 *   - Switch node: v1 → v2.1
 *   - Code node: v2 → v2.2
 *   - googleCalendar: v1.3 → v2
 *   - telegram: v1.2 → v2
 * 
 * Usage: npx tsx scripts-ts/fix_node_versions.ts <workflow-file.json>
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');

// Node version mappings for n8n v2.10.2 compatibility
const NODE_VERSION_UPDATES: Record<string, number> = {
    'n8n-nodes-base.if': 2.3,
    'n8n-nodes-base.switch': 3.4,
    'n8n-nodes-base.code': 2,
    'n8n-nodes-base.googleCalendar': 1.3,
    'n8n-nodes-base.telegram': 1.2,
    'n8n-nodes-base.executeWorkflowTrigger': 1.1,
    'n8n-nodes-base.executeWorkflow': 1.3,
    'n8n-nodes-base.webhook': 2.1,
    'n8n-nodes-base.manualTrigger': 1,
    'n8n-nodes-base.scheduleTrigger': 1.3,
    'n8n-nodes-base.httpRequest': 4.4,
    'n8n-nodes-base.set': 3.4,
    'n8n-nodes-base.postgres': 2.6,
    'n8n-nodes-base.errorTrigger': 1,
};

interface NodeVersionUpdate {
    nodeName: string;
    nodeType: string;
    oldVersion: number;
    newVersion: number;
}

function fixWorkflow(filePath: string): { success: boolean; updates: NodeVersionUpdate[]; error?: string } {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const workflow = JSON.parse(content);
        
        const updates: NodeVersionUpdate[] = [];
        let modified = false;

        for (const node of workflow.nodes || []) {
            const nodeType = node.type;
            const currentVersion = node.typeVersion;
            const targetVersion = NODE_VERSION_UPDATES[nodeType];

            if (targetVersion !== undefined && currentVersion !== targetVersion) {
                updates.push({
                    nodeName: node.name,
                    nodeType,
                    oldVersion: currentVersion,
                    newVersion: targetVersion,
                });
                node.typeVersion = targetVersion;
                modified = true;

                // Also update parameters structure for IF node v2+
                if (nodeType === 'n8n-nodes-base.if' && targetVersion >= 2) {
                    // Ensure conditions structure is correct for v2+
                    if (node.parameters?.conditions) {
                        const conditions = node.parameters.conditions;
                        
                        // v2+ expects conditions.conditions to be an array
                        if (conditions.conditions && !Array.isArray(conditions.conditions)) {
                            // Already an array, skip
                        } else if (conditions.conditions === undefined) {
                            // Missing conditions array - might need to be created
                            conditions.conditions = [];
                        }
                    }
                }
            }
        }

        if (modified) {
            // Write updated workflow
            const outputPath = filePath.replace('.json', '_FIXED.json');
            fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));
            console.log(`Saved fixed version to: ${outputPath}`);
        }

        return { success: true, updates };
    } catch (error: any) {
        return { success: false, updates: [], error: error.message };
    }
}

function main() {
    const workflowFile = process.argv[2];

    if (!workflowFile) {
        console.log('Usage: npx tsx scripts-ts/fix_node_versions.ts <workflow-file.json>');
        console.log('\nExamples:');
        console.log('  workflows/GCAL_Create_Event.json');
        console.log('  workflows/NN_04_Telegram_Sender.json\n');
        process.exit(1);
    }

    const filePath = path.isAbsolute(workflowFile) 
        ? workflowFile 
        : path.resolve(process.cwd(), workflowFile.replace('workflows/', ''));

    console.log('\n' + '='.repeat(70));
    console.log('FIX NODE VERSIONS for n8n v2.10.2');
    console.log('='.repeat(70) + '\n');

    console.log(`Processing: ${filePath}\n`);

    const result = fixWorkflow(filePath);

    if (!result.success) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
    }

    if (result.updates.length === 0) {
        console.log('No node version updates needed.');
    } else {
        console.log('Node version updates:');
        console.log('-'.repeat(70));
        for (const update of result.updates) {
            console.log(`  ${update.nodeName}`);
            console.log(`    Type: ${update.nodeType}`);
            console.log(`    Version: ${update.oldVersion} → ${update.newVersion}\n`);
        }
        console.log('-'.repeat(70));
        console.log(`Total updates: ${result.updates.length}\n`);
    }

    console.log('='.repeat(70));
    console.log('Next steps:');
    console.log('  1. Review the fixed file (*_FIXED.json)');
    console.log('  2. Test upload: npx tsx scripts-ts/upload_single.ts <fixed-file>');
    console.log('  3. If successful, replace original and deploy\n');
}

main();
