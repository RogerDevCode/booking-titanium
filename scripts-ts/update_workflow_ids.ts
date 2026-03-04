#!/usr/bin/env tsx
/**
 * Update Workflow IDs - Replace old workflow IDs with new ones from workflow_activation_order.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Terminal colors
const C = {
  RESET: "\x1b[0m",
  GREEN: "\x1b[92m",
  YELLOW: "\x1b[93m",
  CYAN: "\x1b[96m",
};

const log = {
  ok: (msg: string) => console.log(`${C.GREEN}✅ ${msg}${C.RESET}`),
  info: (msg: string) => console.log(`${C.CYAN}ℹ  ${msg}${C.RESET}`),
  warn: (msg: string) => console.warn(`${C.YELLOW}⚠️  ${msg}${C.RESET}`),
};

// Read workflow_activation_order.json to get current ID mappings
const orderPath = path.join(__dirname, 'workflow_activation_order.json');
const order = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));

// Build old → new ID mapping from the workflow files themselves
// We need to find what IDs are currently in the files vs what they should be
const idMapping: Record<string, string> = {};

// Old IDs from the original workflow_activation_order.json (before update)
const oldIds: Record<string, string> = {
  "NN_00_Global_Error_Handler": "FfuhDk24MTkCwKae",
  "NN_02_Message_Parser": "OcWDnCr1Zf0dbhFb",
  "NN_03_AI_Agent": "0jlQvtCGJo0iTshb",
  "NN_04_Telegram_Sender": "lO3o2Kgtkf9D29nB",
  "NN_01_Booking_Gateway_V4_Final": "ARUzPe62MswiqpqC",
  "NN_01_Test_Simple": "baPGSGdNJv173oJG",
  "DB_Get_Availability": "IskXYU5mXqTXEMib",
  "DB_Create_Booking": "JKNNmZl1CmWEEJlY",
  "GCAL_Create_Event": "nt7z6wN3F7rbBjbZ",
  "GMAIL_Send_Confirmation": "dQ2o3xVfHDKywSkJ",
  "DB_Cancel_Booking": "BpE7sEpSeHS2WfAG",
  "GCAL_Delete_Event": "WMoxFBOvNQ3ctilc",
  "DB_Reschedule_Booking": "xLJv8zo4tjhxdWLb",
  "NN_05_Reminder_Cron": "bOlBs8XxGuySDRJn",
  "DB_Find_Next_Available": "9WcJr7WYB28ZDi8F",
  "BB_90_Reminder_Scheduler": "hGxHu9gLhhYdAGeW",
};

// Build mapping: old ID → new ID
for (const item of order) {
  const oldId = oldIds[item.name];
  if (oldId && oldId !== item.id) {
    idMapping[oldId] = item.id;
    log.info(`Mapping: ${oldId} → ${item.id} (${item.name})`);
  }
}

const workflowsDir = path.join(__dirname, '../workflows');
const workflowFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));

let totalReplacements = 0;

for (const file of workflowFiles) {
  const filePath = path.join(workflowsDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let updated = false;
  
  for (const [oldId, newId] of Object.entries(idMapping)) {
    // Pattern 1: Simple string format "workflowId": "OLD_ID"
    const regex1 = new RegExp(`"workflowId":\\s*"${oldId}"`, 'g');
    if (regex1.test(content)) {
      content = content.replace(regex1, `"workflowId": "${newId}"`);
      log.info(`  ${file}: ${oldId} → ${newId} (simple format)`);
      updated = true;
      totalReplacements++;
    }
    
    // Pattern 2: Object format "value": "OLD_ID" (inside workflowId object)
    const regex2 = new RegExp(`"value":\\s*"${oldId}"`, 'g');
    if (regex2.test(content)) {
      content = content.replace(regex2, `"value": "${newId}"`);
      log.info(`  ${file}: ${oldId} → ${newId} (object format)`);
      updated = true;
      totalReplacements++;
    }
  }
  
  if (updated) {
    fs.writeFileSync(filePath, content, 'utf-8');
    log.ok(`Updated: ${file}`);
  }
}

log.info(`\n======================================================================`);
log.ok(`Total replacements: ${totalReplacements}`);
log.info(`======================================================================`);
log.info(`Next step: Re-deploy workflows to apply updated references`);
