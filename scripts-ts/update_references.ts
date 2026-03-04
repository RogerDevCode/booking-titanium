#!/usr/bin/env node
/**
 * =============================================================================
 * Update Workflow References
 * =============================================================================
 * Purpose: Update sub-workflow references to use new IDs
 * 
 * Old ID → New ID mapping from latest deployment:
 *   NN_02_Message_Parser:      Hp7ox7JqRwVA5wr8 → 2gCOHyzbodlVvicy
 *   NN_03_AI_Agent:            N2APxPodLDJCG818 → 91LQ489s2gmmaWZZ
 *   NN_04_Telegram_Sender:     4afRuMkIvgEh7gXt → fDUQSHkt9bDO5k6u
 *   DB_Create_Booking:         kuvqYSl3BMrXtews → ZZKMCQlopz2SN4cP
 *   DB_Cancel_Booking:         aKE6HxuHaklajZOU → ESeI6lIuK8hQ9qR3
 *   DB_Get_Availability:       lFMxhCabSVhaIVIN → 6xaG7bBWNe6Pb0jv
 *   DB_Find_Next_Available:    cWWCjvSLdw6gbp7J → VvxRpECeB1icuZjF
 * 
 * Usage: npx tsx scripts-ts/update_references.ts
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');

// Old ID → New ID mapping (updated with latest server IDs)
const ID_MAPPING: Record<string, string> = {
    'Hp7ox7JqRwVA5wr8': 'OcWDnCr1Zf0dbhFb',  // NN_02_Message_Parser
    'N2APxPodLDJCG818': '0jlQvtCGJo0iTshb',  // NN_03_AI_Agent
    'WXJzXvx1HbydJh52': 'lO3o2Kgtkf9D29nB',  // NN_04_Telegram_Sender (old) → new
    'fDUQSHkt9bDO5k6u': 'lO3o2Kgtkf9D29nB',  // NN_04_Telegram_Sender (alt) → new
    'kuvqYSl3BMrXtews': 'JKNNmZl1CmWEEJlY',  // DB_Create_Booking
    '8jfwICIDVXOjLyQC': 'JKNNmZl1CmWEEJlY',  // DB_Create_Booking (alt) → new
    'aKE6HxuHaklajZOU': 'BpE7sEpSeHS2WfAG',  // DB_Cancel_Booking
    'muipe9KQMQG0Y6g3': 'BpE7sEpSeHS2WfAG',  // DB_Cancel_Booking (alt) → new
    'lFMxhCabSVhaIVIN': 'IskXYU5mXqTXEMib',  // DB_Get_Availability
    'IS8yOTXwRFlaOKQr': 'IskXYU5mXqTXEMib',  // DB_Get_Availability (alt) → new
    'cWWCjvSLdw6gbp7J': '9WcJr7WYB28ZDi8F',  // DB_Find_Next_Available
    '52VjjLHLb8g3ptzi': '9WcJr7WYB28ZDi8F',  // DB_Find_Next_Available (alt) → new
    '2gCOHyzbodlVvicy': 'OcWDnCr1Zf0dbhFb',  // NN_02_Message_Parser (alt) → new
    'COTbmpWzywPmfdgH': 'OcWDnCr1Zf0dbhFb',  // NN_02_Message_Parser (alt2) → new
    '91LQ489s2gmmaWZZ': '0jlQvtCGJo0iTshb',  // NN_03_AI_Agent (alt) → new
    'yhjg6k95Ndtu8FuJ': '0jlQvtCGJo0iTshb',  // NN_03_AI_Agent (alt2) → new
    'VvxRpECeB1icuZjF': '9WcJr7WYB28ZDi8F',  // DB_Find_Next_Available (alt3) → new
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
};

function updateReferences(filePath: string): { success: boolean; replacements: number } {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let updated = content;
        let replacements = 0;

        for (const [oldId, newId] of Object.entries(ID_MAPPING)) {
            const regex = new RegExp(oldId, 'g');
            const matches = updated.match(regex);
            if (matches) {
                replacements += matches.length;
                updated = updated.replace(regex, newId);
            }
        }

        if (replacements > 0) {
            fs.writeFileSync(filePath, updated);
        }

        return { success: true, replacements };
    } catch (error: any) {
        return { success: false, replacements: 0 };
    }
}

function main() {
    console.log('\n' + '='.repeat(70));
    console.log('UPDATE WORKFLOW REFERENCES - Fix Sub-Workflow IDs');
    console.log('='.repeat(70) + '\n');

    log.info('ID Mapping:');
    for (const [oldId, newId] of Object.entries(ID_MAPPING)) {
        console.log(`  ${oldId} → ${newId}`);
    }
    console.log('');

    const files = fs.readdirSync(WORKFLOWS_DIR)
        .filter(f => f.endsWith('.json'));

    let totalReplacements = 0;

    for (const file of files) {
        const filePath = path.join(WORKFLOWS_DIR, file);
        const result = updateReferences(filePath);
        
        if (result.replacements > 0) {
            log.success(`${file}: ${result.replacements} reference(s) updated`);
            totalReplacements += result.replacements;
        }
    }

    console.log('\n' + '='.repeat(70));
    log.success(`Total replacements: ${totalReplacements}`);
    console.log('='.repeat(70) + '\n');

    log.info('Next step: Re-deploy workflows to apply updated references');
}

main();
