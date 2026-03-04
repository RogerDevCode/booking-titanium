/**
 * Debug script to analyze ToolWorkflow node schema configuration
 * 
 * This script inspects NN_03_AI_Agent.json and verifies:
 * 1. workflowInputs.schema is properly defined
 * 2. workflowInputs.value contains $fromAI() expressions
 * 3. $fromAI() expressions have correct syntax with type hints
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const WORKFLOW_FILE = join(__dirname, '../workflows/NN_03_AI_Agent.json');

interface ToolWorkflowNode {
  name: string;
  parameters: {
    name: string;
    description: string;
    workflowInputs?: {
      mappingMode: string;
      value?: Record<string, string>;
      schema?: Array<{
        id: string;
        displayName: string;
        type: string;
        required?: boolean;
      }>;
    };
  };
}

function analyzeFromAIExpression(expr: string, fieldName: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check if it starts with ={{ and ends with }}
  if (!expr.startsWith('={{') || !expr.endsWith('}}')) {
    issues.push('Expression must start with ={{ and end with }}');
  }
  
  // Check for $fromAI pattern
  const fromAIMatch = expr.match(/\$fromAI\(([^)]*)\)/);
  if (!fromAIMatch) {
    issues.push('Missing $fromAI() call');
    return { valid: false, issues };
  }
  
  const args = fromAIMatch[1];
  
  // $fromAI should have at least fieldName
  if (!args.includes("'") && !args.includes('"')) {
    issues.push('$fromAI() must have at least fieldName as first argument');
  }
  
  // Check for type hint (3rd argument recommended)
  const argCount = args.split(',').length;
  if (argCount < 3) {
    issues.push('Consider adding type hint as 3rd argument: $fromAI(name, description, "string|number|boolean")');
  }
  
  return { valid: issues.length === 0, issues };
}

function main() {
  console.log('🔍 Debugging ToolWorkflow Schema Configuration\n');
  console.log(`Workflow file: ${WORKFLOW_FILE}\n`);
  
  const workflow = JSON.parse(readFileSync(WORKFLOW_FILE, 'utf-8'));
  
  const toolNodes = workflow.nodes.filter((n: any) => 
    n.type === '@n8n/n8n-nodes-langchain.toolWorkflow'
  ) as ToolWorkflowNode[];
  
  console.log(`Found ${toolNodes.length} ToolWorkflow nodes:\n`);
  
  let totalIssues = 0;
  
  for (const node of toolNodes) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Node: ${node.name}`);
    console.log(`   Description: ${node.parameters.description.substring(0, 80)}...`);
    console.log(`${'='.repeat(60)}`);
    
    const inputs = node.parameters.workflowInputs;
    
    if (!inputs) {
      console.log('   ❌ ERROR: workflowInputs is missing!');
      totalIssues++;
      continue;
    }
    
    console.log(`   mappingMode: ${inputs.mappingMode}`);
    
    // Check schema
    const schema = inputs.schema || [];
    console.log(`   Schema fields: ${schema.length}`);
    for (const field of schema) {
      const required = field.required ? ' (required)' : '';
      console.log(`     - ${field.id}: ${field.type}${required}`);
    }
    
    // Check value with $fromAI expressions
    const value = inputs.value || {};
    const valueKeys = Object.keys(value);
    console.log(`   Value keys: ${valueKeys.length}`);
    
    if (valueKeys.length === 0) {
      console.log('   ❌ ERROR: workflowInputs.value is empty - $fromAI() expressions missing!');
      console.log('   This will cause DynamicTool fallback (no schema sent to LLM)');
      totalIssues++;
      continue;
    }
    
    // Verify each $fromAI expression
    console.log(`   $fromAI() expressions:`);
    for (const [key, expr] of Object.entries(value)) {
      const analysis = analyzeFromAIExpression(expr as string, key);
      const status = analysis.valid ? '✅' : '❌';
      console.log(`     ${status} ${key}: ${expr as string}`);
      
      if (!analysis.valid) {
        analysis.issues.forEach(issue => console.log(`        ⚠️  ${issue}`));
        totalIssues++;
      }
    }
    
    // Check for schema/value mismatch
    const schemaIds = new Set(schema.map(f => f.id));
    const valueIds = new Set(Object.keys(value));
    
    const inSchemaNotInValue = schema.filter(f => !valueIds.has(f.id));
    const inValueNotInSchema = Object.keys(value).filter(k => !schemaIds.has(k));
    
    if (inSchemaNotInValue.length > 0) {
      console.log(`   ⚠️  Warning: ${inSchemaNotInValue.length} fields in schema but not in value`);
      inSchemaNotInValue.forEach(f => console.log(`      - ${f.id}`));
    }
    
    if (inValueNotInSchema.length > 0) {
      console.log(`   ⚠️  Warning: ${inValueNotInSchema.length} fields in value but not in schema`);
      inValueNotInSchema.forEach(f => console.log(`      - ${f}`));
      console.log(`   These fields may not appear in the LLM tool schema!`);
      totalIssues += inValueNotInSchema.length;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Summary: ${totalIssues} issues found`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (totalIssues === 0) {
    console.log('✅ Configuration looks correct!');
    console.log('\nIf you still see "additionalProperties not allowed" error:');
    console.log('1. Verify the workflow is uploaded to the server (not just local)');
    console.log('2. Check n8n server logs for tool schema extraction errors');
    console.log('3. Try re-configuring one tool via UI to compare JSON structure');
  } else {
    console.log('❌ Fix the issues above and re-upload the workflow');
  }
}

main();
