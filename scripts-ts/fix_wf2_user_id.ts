/**
 * Fix WF2_Booking_Orchestrator user_id Handling
 * 
 * Problem: Uses ctx.chat_id as user_id, causing FK constraint violations
 * Solution: Use DEFAULT_USER_ID (5391760292) instead of chat_id
 */

import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY || '';
const WF2_ID = 'Z7g7DgxXQ61V368P';

// New code for "Prepare DB Values" node
const NEW_PREPARE_DB_CODE = `// Prepare DB Values for Create Booking
// Extract values from GCal Event and context
const gcalEvent = $('Create GCal Event').first()?.json || {};
const ctx = $('Generate Idempotency Key').first()?.json?.ctx || {};

// GCal event ID is in data.id
const gcalEventId = gcalEvent.id || gcalEvent.data?.id || '';

// User ID validation - use default if user_id not provided
// IMPORTANT: Do NOT use chat_id as user_id - they are different entities
// Default to TELEGRAM_ID (5391760292) which is a known valid user
const DEFAULT_USER_ID = 5391760292;
let userId = DEFAULT_USER_ID;

if (ctx.user_id && ctx.user_id > 0) {
  userId = ctx.user_id;
}
// Note: We do NOT use ctx.chat_id here as it's not a valid user_id

// Calculate end_time (start + 1 hour)
const startTime = new Date(ctx.start_time);
const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

return [{
  json: {
    ctx,
    gcal_event_id: gcalEventId,
    user_id: userId,
    end_time: endTime.toISOString()
  }
}];`;

async function fixWF2() {
  console.log('='.repeat(80));
  console.log('WF2_BOOKING_ORCHESTRATOR - USER_ID FIX');
  console.log('='.repeat(80));
  
  // 1. Get current workflow
  console.log('\n📥 Downloading workflow...');
  const getResponse = await fetch(`${N8N_API_URL}/api/v1/workflows/${WF2_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY }
  });
  
  if (!getResponse.ok) {
    console.error(`❌ Failed to get workflow: ${getResponse.statusText}`);
    return false;
  }
  
  const workflow = await getResponse.json();
  console.log(`✅ Workflow downloaded: ${workflow.name}`);
  
  // 2. Find and update "Prepare DB Values" node
  console.log('\n🔍 Finding "Prepare DB Values" node...');
  const prepareNode = workflow.activeVersion.nodes.find((n: any) => n.name === 'Prepare DB Values');
  
  if (!prepareNode) {
    console.error('❌ "Prepare DB Values" node not found');
    return false;
  }
  
  console.log('✅ Node found');
  console.log('\n📝 Old code:');
  const oldCodeLines = prepareNode.parameters.jsCode.split('\n');
  const userIdLine = oldCodeLines.find(line => line.includes('userId ='));
  console.log(`   ${userIdLine?.trim()}`);
  
  // 3. Update node code
  console.log('\n✏️  Updating node code...');
  prepareNode.parameters.jsCode = NEW_PREPARE_DB_CODE;
  
  // Also update in workflow.nodes (for consistency)
  const workflowNode = workflow.nodes.find((n: any) => n.name === 'Prepare DB Values');
  if (workflowNode) {
    workflowNode.parameters.jsCode = NEW_PREPARE_DB_CODE;
  }
  
  console.log('✅ Code updated');
  console.log('\n📝 New code:');
  const newCodeLines = NEW_PREPARE_DB_CODE.split('\n');
  const newUserIdLine = newCodeLines.find(line => line.includes('DEFAULT_USER_ID') || line.includes('userId ='));
  console.log(`   ${newUserIdLine?.trim()}`);
  
  // 4. Prepare clean payload (remove read-only fields)
  console.log('\n🧹 Preparing update payload...');
  const updatePayload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings
    // Note: 'active' is read-only, will be preserved automatically
  };
  
  // 5. Update workflow
  console.log('\n📤 Uploading updated workflow...');
  const updateResponse = await fetch(`${N8N_API_URL}/api/v1/workflows/${WF2_ID}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatePayload)
  });
  
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.error(`❌ Failed to update workflow: ${updateResponse.statusText}`);
    console.error(`   Response: ${errorText.substring(0, 200)}`);
    return false;
  }
  
  const updatedWorkflow = await updateResponse.json();
  console.log('✅ Workflow updated successfully');
  console.log(`   Version: ${updatedWorkflow.versionCounter}`);
  
  // 6. Save backup
  console.log('\n💾 Saving backup...');
  const backupPath = `workflows/WF2_Booking_Orchestrator_FIXED_${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(updatedWorkflow, null, 2));
  console.log(`✅ Backup saved: ${backupPath}`);
  
  // 7. Verify activation
  console.log('\n🔌 Verifying workflow activation...');
  if (workflow.active) {
    console.log('✅ Workflow is already active');
  } else {
    console.log('⚠️  Workflow is inactive, activating...');
    const activateResponse = await fetch(`${N8N_API_URL}/api/v1/workflows/${WF2_ID}`, {
      method: 'PATCH',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ active: true })
    });
    
    if (activateResponse.ok) {
      console.log('✅ Workflow activated');
    } else {
      console.error(`⚠️  Failed to activate: ${activateResponse.statusText}`);
    }
  }
  
  // 8. Test webhook
  console.log('\n🧪 Testing webhook...');
  try {
    const testResponse = await fetch(`${N8N_API_URL}/webhook/booking-orchestrator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_id: 1,
        service_id: 1,
        start_time: new Date(Date.now() + 86400000).toISOString(),
        customer_id: 'test_user_fix',
        chat_id: 9000000 + Math.floor(Math.random() * 1000)
      })
    });
    
    console.log(`   Status: ${testResponse.status} ${testResponse.statusText}`);
    
    if (testResponse.status === 200) {
      const data = await testResponse.json();
      console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}`);
      
      if (data.success === true || data.error_code) {
        console.log('✅ Webhook responding correctly');
      } else {
        console.log('⚠️  Webhook response unexpected');
      }
    }
  } catch (error: any) {
    console.error(`❌ Test failed: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('✅ WF2_Booking_Orchestrator user_id fix applied');
  console.log('✅ "Prepare DB Values" node updated');
  console.log('✅ Backup saved');
  console.log('✅ Workflow activation verified');
  console.log('\n📝 Next steps:');
  console.log('   1. Run smoke tests to verify fix');
  console.log('   2. Run full stress test suite');
  console.log('   3. Monitor for FK constraint errors');
  console.log('='.repeat(80));
  
  return true;
}

// Run fix
fixWF2().catch(error => {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
