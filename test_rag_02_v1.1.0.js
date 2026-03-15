/**
 * Test script for RAG_02_Document_Retrieval v1.1.0 workflow
 * Tests all security fixes and improvements
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'workflows', 'RAG_02_Document_Retrieval_v1.1.0.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

console.log('='.repeat(70));
console.log('RAG_02_Document_Retrieval v1.1.0 - Security & Production Test Suite');
console.log('='.repeat(70));

// ============== SECURITY INCIDENT CHECK ==============
console.log('\n[0] SECURITY INCIDENT VERIFICATION');
console.log('-'.repeat(70));

const hasSecurityNotice = workflow.securityNotice !== undefined;
const hasVersionHistory = workflow.versionHistory !== undefined;

console.log(`  ${hasSecurityNotice ? '✓' : '✗'} Security notice documented in workflow`);
console.log(`  ${hasVersionHistory ? '✓' : '✗'} Version history tracked`);

// Check for hardcoded API keys in entire workflow
const workflowJson = JSON.stringify(workflow);
const apiKeyPattern = /sk-proj-[A-Za-z0-9_-]{20,}/;
const hasHardcodedKey = apiKeyPattern.test(workflowJson);

console.log(`  ${!hasHardcodedKey ? '✓' : '✗'} No hardcoded API keys detected`);

if (hasHardcodedKey) {
  console.log('  🔴 CRITICAL: Hardcoded API key found! Must be revoked immediately.');
}

// ============== STRUCTURAL TESTS ==============
console.log('\n[1] STRUCTURAL VALIDATION');
console.log('-'.repeat(70));

const structuralTests = [
  {
    name: 'Workflow version is 1.1.0',
    test: () => workflow.version === '1.1.0'
  },
  {
    name: 'Triple Entry Pattern - Webhook exists',
    test: () => workflow.nodes.some(n => n.name === 'Webhook')
  },
  {
    name: 'Triple Entry Pattern - Manual Trigger exists',
    test: () => workflow.nodes.some(n => n.name === 'Manual Trigger')
  },
  {
    name: 'Triple Entry Pattern - Execute Workflow Trigger exists',
    test: () => workflow.nodes.some(n => n.name === 'Execute Workflow Trigger')
  },
  {
    name: 'All three triggers connect to Validate & Normalize',
    test: () => {
      const connections = workflow.connections;
      const webhookConn = connections.Webhook?.main?.[0]?.[0]?.node;
      const manualConn = connections['Manual Trigger']?.main?.[0]?.[0]?.node;
      const executeConn = connections['Execute Workflow Trigger']?.main?.[0]?.[0]?.node;
      return webhookConn === 'Validate & Normalize' &&
             manualConn === 'Validate & Normalize' &&
             executeConn === 'Validate & Normalize';
    }
  },
  {
    name: 'Postgres node typeVersion is 2.6',
    test: () => {
      const postgresNode = workflow.nodes.find(n => n.name === 'Search');
      return postgresNode && postgresNode.typeVersion === 2.6;
    }
  },
  {
    name: 'OpenAI node is native type (not httpRequest)',
    test: () => {
      const openaiNode = workflow.nodes.find(n => n.name === 'Get OpenAI Embedding');
      return openaiNode && openaiNode.type === 'n8n-nodes-base.openAi';
    }
  },
  {
    name: 'OpenAI node uses credentials (not manual header)',
    test: () => {
      const openaiNode = workflow.nodes.find(n => n.name === 'Get OpenAI Embedding');
      return openaiNode && 
             openaiNode.credentials && 
             openaiNode.credentials.openAiApi &&
             !openaiNode.parameters.sendHeaders;
    }
  },
  {
    name: 'OpenAI node has retryOnFail enabled',
    test: () => {
      const openaiNode = workflow.nodes.find(n => n.name === 'Get OpenAI Embedding');
      return openaiNode && 
             openaiNode.retryOnFail && 
             openaiNode.retryOnFail.enabled === true;
    }
  },
  {
    name: 'OpenAI node has timeout configured',
    test: () => {
      const openaiNode = workflow.nodes.find(n => n.name === 'Get OpenAI Embedding');
      return openaiNode && openaiNode.timeout && openaiNode.timeout > 0;
    }
  },
  {
    name: 'Build Parameterized Query node exists',
    test: () => workflow.nodes.some(n => n.name === 'Build Parameterized Query')
  },
  {
    name: 'Embedding Success? watchdog node exists',
    test: () => workflow.nodes.some(n => n.name === 'Embedding Success?')
  },
  {
    name: 'Search Success? watchdog node exists',
    test: () => workflow.nodes.some(n => n.name === 'Search Success?')
  }
];

let structuralPassed = 0;
structuralTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) structuralPassed++;
});

console.log(`\nStructural Tests: ${structuralPassed}/${structuralTests.length} passed`);

// ============== SECURITY TESTS ==============
console.log('\n[2] SECURITY VALIDATION');
console.log('-'.repeat(70));

const securityTests = [
  {
    name: 'No hardcoded API key in OpenAI node',
    test: () => {
      const openaiNode = workflow.nodes.find(n => n.name === 'Get OpenAI Embedding');
      const nodeJson = JSON.stringify(openaiNode);
      return !apiKeyPattern.test(nodeJson);
    }
  },
  {
    name: 'OpenAI node uses Credential Store',
    test: () => {
      const openaiNode = workflow.nodes.find(n => n.name === 'Get OpenAI Embedding');
      return openaiNode.credentials && openaiNode.credentials.openAiApi;
    }
  },
  {
    name: 'SQL injection prevented - query uses placeholders',
    test: () => {
      const buildQueryNode = workflow.nodes.find(n => n.name === 'Build Parameterized Query');
      const code = buildQueryNode.parameters.jsCode;
      return code.includes('$1') && code.includes('$2') && code.includes('$3');
    }
  },
  {
    name: 'SQL injection prevented - Postgres uses queryParameters',
    test: () => {
      const postgresNode = workflow.nodes.find(n => n.name === 'Search');
      return postgresNode.parameters.queryParameters !== undefined;
    }
  },
  {
    name: 'No .replace() for SQL escaping in workflow',
    test: () => {
      // Check all nodes for .replace(/'/g pattern
      return !workflow.nodes.some(n => 
        n.parameters?.jsCode?.includes(".replace(/'/g") ||
        n.parameters?.query?.includes(".replace(/'/g")
      );
    }
  },
  {
    name: 'Webhook has input documentation in notes',
    test: () => {
      const webhookNode = workflow.nodes.find(n => n.name === 'Webhook');
      return webhookNode.notes && webhookNode.notes.includes('hybrid_search_rag_documents');
    }
  }
];

let securityPassed = 0;
securityTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) securityPassed++;
});

console.log(`\nSecurity Tests: ${securityPassed}/${securityTests.length} passed`);

// ============== VALIDATION SANDWICH TESTS ==============
console.log('\n[3] VALIDATION SANDWICH');
console.log('-'.repeat(70));

const validateNode = workflow.nodes.find(n => n.name === 'Validate & Normalize');
const validateCode = validateNode.parameters.jsCode;

const validationTests = [
  {
    name: 'Validates query is present',
    test: () => validateCode.includes('!query') || validateCode.includes('query.length < 2')
  },
  {
    name: 'Validates query minimum length (2 chars)',
    test: () => validateCode.includes('length < 2') || validateCode.includes('length<2')
  },
  {
    name: 'Validates provider_id is positive',
    test: () => validateCode.includes('provider_id <= 0') || validateCode.includes('provider_id<=0')
  },
  {
    name: 'Validates limit range (1-10)',
    test: () => validateCode.includes('limit < 1') || validateCode.includes('limit > 10')
  },
  {
    name: 'Validates similarity_threshold range (0-1)',
    test: () => validateCode.includes('threshold < 0') || validateCode.includes('threshold > 1')
  },
  {
    name: 'Returns error_message on validation failure',
    test: () => validateCode.includes('error_message') && validateCode.includes('errors.join')
  },
  {
    name: 'Does NOT have silent default for query',
    test: () => !validateCode.includes("query || 'horarios'")
  }
];

let validationPassed = 0;
validationTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) validationPassed++;
});

console.log(`\nValidation Sandwich: ${validationPassed}/${validationTests.length} passed`);

// ============== STANDARD CONTRACT TESTS ==============
console.log('\n[4] STANDARD CONTRACT (O02)');
console.log('-'.repeat(70));

const errorNodes = [
  'Format Validation Error',
  'Format Embedding Error',
  'Format Database Error'
];

const successNode = workflow.nodes.find(n => n.name === 'Format Success Response');

const contractTests = [
  {
    name: 'Success response has success: true',
    test: () => successNode.parameters.jsCode.includes('success: true')
  },
  {
    name: 'Success response has error_code: null',
    test: () => successNode.parameters.jsCode.includes('error_code: null')
  },
  {
    name: 'Success response has error_message: null',
    test: () => successNode.parameters.jsCode.includes('error_message: null')
  },
  {
    name: 'Success response has _meta with workflow_id',
    test: () => {
      const code = successNode.parameters.jsCode;
      return code.includes('_meta:') && code.includes('workflow_id');
    }
  },
  {
    name: 'Success response has _meta with version',
    test: () => {
      const code = successNode.parameters.jsCode;
      return code.includes('version');
    }
  },
  {
    name: 'Success response has _meta with timestamp',
    test: () => {
      const code = successNode.parameters.jsCode;
      return code.includes('timestamp') && code.includes('toISOString()');
    }
  },
  {
    name: 'All error nodes return success: false',
    test: () => {
      return errorNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        return node && node.parameters.jsCode.includes('success: false');
      });
    }
  },
  {
    name: 'All error nodes return error_code',
    test: () => {
      return errorNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        return node && node.parameters.jsCode.includes('error_code:');
      });
    }
  },
  {
    name: 'All error nodes return error_message',
    test: () => {
      return errorNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        return node && node.parameters.jsCode.includes('error_message:');
      });
    }
  },
  {
    name: 'All error nodes return _meta',
    test: () => {
      return errorNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        return node && node.parameters.jsCode.includes('_meta:');
      });
    }
  },
  {
    name: 'Validation Error has error_code: VALIDATION_ERROR',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Validation Error');
      return node.parameters.jsCode.includes("'VALIDATION_ERROR'");
    }
  },
  {
    name: 'Embedding Error has error_code: EMBEDDING_ERROR',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Embedding Error');
      return node.parameters.jsCode.includes("'EMBEDDING_ERROR'");
    }
  },
  {
    name: 'Database Error has error_code: DATABASE_ERROR',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Database Error');
      return node.parameters.jsCode.includes("'DATABASE_ERROR'");
    }
  }
];

let contractPassed = 0;
contractTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) contractPassed++;
});

console.log(`\nStandard Contract: ${contractPassed}/${contractTests.length} passed`);

// ============== ERROR HANDLING TESTS ==============
console.log('\n[5] ERROR HANDLING (O04 WATCHDOG)');
console.log('-'.repeat(70));

const errorHandlingTests = [
  {
    name: 'Is Valid? node branches on validation result',
    test: () => {
      const conn = workflow.connections['Is Valid?'];
      return conn && conn.main && conn.main.length === 2;
    }
  },
  {
    name: 'Is Valid? false branch goes to Format Validation Error',
    test: () => {
      const conn = workflow.connections['Is Valid?'];
      return conn.main[1]?.[0]?.node === 'Format Validation Error';
    }
  },
  {
    name: 'Embedding Success? watchdog exists',
    test: () => workflow.nodes.some(n => n.name === 'Embedding Success?')
  },
  {
    name: 'Embedding Success? error branch goes to Format Embedding Error',
    test: () => {
      const conn = workflow.connections['Embedding Success?'];
      return conn.main[1]?.[0]?.node === 'Format Embedding Error';
    }
  },
  {
    name: 'Search Success? watchdog exists',
    test: () => workflow.nodes.some(n => n.name === 'Search Success?')
  },
  {
    name: 'Search Success? error branch goes to Format Database Error',
    test: () => {
      const conn = workflow.connections['Search Success?'];
      return conn.main[1]?.[0]?.node === 'Format Database Error';
    }
  },
  {
    name: 'Error nodes are terminal (no outgoing connections)',
    test: () => {
      const errorConns = [
        workflow.connections['Format Validation Error'],
        workflow.connections['Format Embedding Error'],
        workflow.connections['Format Database Error']
      ];
      return errorConns.every(c => !c || !c.main || !c.main[0] || c.main[0].length === 0);
    }
  },
  {
    name: 'OpenAI node has retryOnFail configured',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Get OpenAI Embedding');
      return node.retryOnFail?.enabled && node.retryOnFail.maxTries >= 3;
    }
  }
];

let errorHandlingPassed = 0;
errorHandlingTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) errorHandlingPassed++;
});

console.log(`\nError Handling: ${errorHandlingPassed}/${errorHandlingTests.length} passed`);

// ============== CONNECTION FLOW VALIDATION ==============
console.log('\n[6] CONNECTION FLOW VALIDATION');
console.log('-'.repeat(70));

const expectedFlow = [
  { from: 'Validate & Normalize', to: 'Is Valid?' },
  { from: 'Is Valid?', to: 'Get OpenAI Embedding', branch: 'valid' },
  { from: 'Is Valid?', to: 'Format Validation Error', branch: 'invalid' },
  { from: 'Get OpenAI Embedding', to: 'Embedding Success?' },
  { from: 'Embedding Success?', to: 'Build Parameterized Query', branch: 'success' },
  { from: 'Embedding Success?', to: 'Format Embedding Error', branch: 'error' },
  { from: 'Build Parameterized Query', to: 'Search' },
  { from: 'Search', to: 'Search Success?' },
  { from: 'Search Success?', to: 'Format Success Response', branch: 'success' },
  { from: 'Search Success?', to: 'Format Database Error', branch: 'error' }
];

let flowPassed = 0;
expectedFlow.forEach(step => {
  const conn = workflow.connections[step.from];
  if (conn && conn.main) {
    const allOutputs = conn.main.flatMap(branch => branch.map(o => o.node));
    const found = allOutputs.includes(step.to);
    console.log(`  ${found ? '✓' : '✗'} ${step.from} -> ${step.to}${step.branch ? ` (${step.branch})` : ''}`);
    if (found) flowPassed++;
  } else {
    console.log(`  ✗ ${step.from} -> ${step.to} (no connection)`);
  }
});

console.log(`\nConnection Flow: ${flowPassed}/${expectedFlow.length} passed`);

// ============== FINAL SUMMARY ==============
console.log('\n' + '='.repeat(70));
console.log('FINAL SUMMARY');
console.log('='.repeat(70));

const securityIncidentFixed = !hasHardcodedKey && hasSecurityNotice;
const totalTests = structuralTests.length + securityTests.length + validationTests.length + contractTests.length + errorHandlingTests.length + expectedFlow.length;
const totalPassed = structuralPassed + securityPassed + validationPassed + contractPassed + errorHandlingPassed + flowPassed;

console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│  Category                        Passed  Total   Rate              │
├─────────────────────────────────────────────────────────────────────┤
│  Security Incident Fixed         ${String(securityIncidentFixed ? 1 : 0).padStart(2)}       ${String(1).padStart(2)}      ${(securityIncidentFixed ? 100 : 0)}%               │
│  Structural Tests                ${String(structuralPassed).padStart(2)}      ${String(structuralTests.length).padStart(2)}      ${(structuralPassed/structuralTests.length*100).toFixed(0)}%               │
│  Security Validation             ${String(securityPassed).padStart(2)}       ${String(securityTests.length).padStart(2)}      ${(securityPassed/securityTests.length*100).toFixed(0)}%               │
│  Validation Sandwich             ${String(validationPassed).padStart(2)}       ${String(validationTests.length).padStart(2)}      ${(validationPassed/validationTests.length*100).toFixed(0)}%               │
│  Standard Contract               ${String(contractPassed).padStart(2)}      ${String(contractTests.length).padStart(2)}      ${(contractPassed/contractTests.length*100).toFixed(0)}%               │
│  Error Handling                  ${String(errorHandlingPassed).padStart(2)}       ${String(errorHandlingTests.length).padStart(2)}      ${(errorHandlingPassed/errorHandlingTests.length*100).toFixed(0)}%               │
│  Connection Flow                 ${String(flowPassed).padStart(2)}       ${String(expectedFlow.length).padStart(2)}      ${(flowPassed/expectedFlow.length*100).toFixed(0)}%               │
├─────────────────────────────────────────────────────────────────────┤
│  TOTAL                           ${String(totalPassed + (securityIncidentFixed ? 1 : 0)).padStart(2)}      ${String(totalTests + 1).padStart(2)}      ${((totalPassed + (securityIncidentFixed ? 1 : 0))/(totalTests + 1)*100).toFixed(1)}%               │
└─────────────────────────────────────────────────────────────────────┘
`);

if (totalPassed === totalTests && securityIncidentFixed) {
  console.log('✓ All tests passed! Workflow v1.1.0 is ready for production.');
  console.log('\n⚠️  REMINDER: Revoke the hardcoded API key from v1.0.0 immediately!');
  process.exit(0);
} else {
  console.log(`✗ ${totalTests + 1 - totalPassed - (securityIncidentFixed ? 1 : 0)} test(s) failed. Review issues above.`);
  if (!securityIncidentFixed) {
    console.log('🔴 CRITICAL: Security incident not properly addressed!');
  }
  process.exit(1);
}
