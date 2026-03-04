#!/usr/bin/env node
/**
 * =============================================================================
 * Apply Node Version Fixes to All Local Workflows
 * =============================================================================
 * Purpose: Update node typeVersions in all local workflow files for n8n v2.10.2
 * Usage: npx tsx scripts-ts/apply_all_fixes.ts
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

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const log = {
    info: (msg: string) => console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${msg}`),
    success: (msg: string) => console.log(`${COLORS.green}[SUCCESS]${COLORS.reset} ${msg}`),
    warning: (msg: string) => console.log(`${COLORS.yellow}[WARNING]${COLORS.reset} ${msg}`),
    error: (msg: string) => console.log(`${COLORS.red}[ERROR]${COLORS.reset} ${msg}`),
};

interface NodeUpdate {
    nodeName: string;
    nodeType: string;
    oldVersion: number;
    newVersion: number;
}

function fixWorkflow(filePath: string): { success: boolean; updates: NodeUpdate[]; error?: string } {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const workflow = JSON.parse(content);
        
        const updates: NodeUpdate[] = [];

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
            }
        }

        if (updates.length > 0) {
            // Write updated workflow (overwrite original)
            fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
        }

        return { success: true, updates };
    } catch (error: any) {
        return { success: false, updates: [], error: error.message };
    }
}

function main() {
    console.log('\n' + '='.repeat(70));
    console.log('APPLY NODE VERSION FIXES - n8n v2.10.2 Compatibility');
    console.log('='.repeat(70) + '\n');

    if (!fs.existsSync(WORKFLOWS_DIR)) {
        log.error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(WORKFLOWS_DIR)
        .filter(f => f.endsWith('.json') && !f.includes('_FIXED') && !f.includes('_MINIMAL') && !f.includes('_WITH_IF'));

    log.success(`Found ${files.length} workflow files to process\n`);

    const results: Array<{ name: string; file: string; updates: NodeUpdate[] }> = [];
    let totalUpdates = 0;

    for (const file of files) {
        const filePath = path.join(WORKFLOWS_DIR, file);
        const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        log.info(`Processing: ${workflow.name}`);
        
        const result = fixWorkflow(filePath);

        if (!result.success) {
            log.error(`Failed: ${result.error}`);
            continue;
        }

        if (result.updates.length > 0) {
            log.success(`Updated ${result.updates.length} node(s)`);
            for (const update of result.updates) {
                console.log(`    ${update.nodeName}: ${update.nodeType} v${update.oldVersion} → v${update.newVersion}`);
            }
        } else {
            console.log(`    No updates needed`);
        }

        results.push({ name: workflow.name, file, updates: result.updates });
        totalUpdates += result.updates.length;
        console.log('');
    }

    // Clean up old _FIXED files
    log.info('Cleaning up temporary _FIXED files...');
    const fixedFiles = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.includes('_FIXED.json') || f.includes('_MINIMAL.json') || f.includes('_WITH_IF.json'));
    for (const fixedFile of fixedFiles) {
        fs.unlinkSync(path.join(WORKFLOWS_DIR, fixedFile));
    }
    log.success(`Removed ${fixedFiles.length} temporary files\n`);

    // Summary
    console.log('='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70));
    console.log(`Total workflows processed: ${results.length}`);
    console.log(`Total node version updates: ${totalUpdates}`);
    console.log('\nAll local workflow files have been updated for n8n v2.10.2 compatibility!\n');
}

main();
