#!/usr/bin/env tsx
/**
 * Update RAG_01 Workflow on Server
 * ==================================
 * Direct update using n8n API
 */

import * as fs from 'fs';
import * as path from 'path';
import { N8NCrudAgent } from './n8n_crud_agent';

const WORKFLOW_ID = 'RAG_01_Document_Ingestion_ID';
const WORKFLOW_FILE = path.join(__dirname, '../workflows/RAG_01_Document_Ingestion.json');

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Update RAG_01_Document_Ingestion on Server                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Load workflow file
  if (!fs.existsSync(WORKFLOW_FILE)) {
    console.error(`❌ Workflow file not found: ${WORKFLOW_FILE}`);
    process.exit(1);
  }

  const workflowData = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'));
  console.log(`✅ Loaded workflow: ${workflowData.name}`);
  console.log(`   File: ${WORKFLOW_FILE}\n`);

  // Sanitize workflow data for update (remove server-managed fields)
  const updateData = {
    name: workflowData.name,
    nodes: workflowData.nodes.map((node: any) => {
      const sanitized = { ...node };
      // Remove server-managed fields
      delete sanitized.id;
      delete sanitized.createdAt;
      delete sanitized.updatedAt;
      delete sanitized.versionId;
      return sanitized;
    }),
    connections: workflowData.connections,
    settings: workflowData.settings || {},
  };

  // Initialize CRUD agent
  const agent = new N8NCrudAgent();

  // Get current workflow from server
  console.log('📡 Fetching current workflow from server...');
  const currentWorkflow: any = await agent.getWorkflowById(WORKFLOW_ID);
  
  if (currentWorkflow && 'error_code' in currentWorkflow) {
    console.error(`❌ Error fetching workflow: ${currentWorkflow.error_message}`);
    process.exit(1);
  }

  console.log(`✅ Found workflow on server: ${currentWorkflow.name}`);
  console.log(`   ID: ${currentWorkflow.id}`);
  console.log(`   Active: ${currentWorkflow.active}\n`);

  // Update workflow
  console.log('🔄 Updating workflow on server...');
  console.log(`   Payload size: ${JSON.stringify(updateData).length} bytes`);
  const updatedWorkflow: any = await agent.updateWorkflow(WORKFLOW_ID, updateData);

  if (updatedWorkflow && 'error_code' in updatedWorkflow && !updatedWorkflow.success) {
    console.error(`❌ Update failed: ${updatedWorkflow.error_message}`);
    console.error(`   Error code: ${updatedWorkflow.error_code}`);
    process.exit(1);
  }
  
  if (updatedWorkflow && typeof updatedWorkflow === 'object' && 'message' in updatedWorkflow) {
    console.error(`❌ Update failed: ${updatedWorkflow.message}`);
    process.exit(1);
  }

  console.log(`✅ Workflow updated successfully!\n`);

  // Activate workflow
  console.log('⚡ Activating workflow...');
  const activateResult = await agent.activateWorkflow(WORKFLOW_ID);
  
  if (activateResult.success) {
    console.log('✅ Workflow activated!\n');
  } else {
    console.log(`⚠️  Activation result: ${activateResult.error_message}\n`);
  }

  console.log('═'.repeat(64));
  console.log('✅ RAG_01_Document_Ingestion updated and activated on server!');
  console.log('═'.repeat(64));
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
