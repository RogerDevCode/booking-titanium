/**
 * Test script for NN_03-B_Pipeline_Agent v2.0.0 workflow
 * Tests all security fixes and improvements
 */

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, 'workflows', 'NN_03-B_Pipeline_Agent_v2.0.0.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

console.log('='.repeat(70));
console.log('NN_03-B_Pipeline_Agent v2.0.0 - Security & Production Test Suite');
console.log('='.repeat(70));

// ============== STRUCTURAL TESTS ==============
console.log('\n[1] STRUCTURAL VALIDATION');
console.log('-'.repeat(70));

const structuralTests = [
  {
    name: 'Workflow version is 2.0.0',
    test: () => workflow.version === '2.0.0'
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
    name: 'Execute Workflow Trigger typeVersion is 1.1 (fixed from 1)',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Execute Workflow Trigger');
      return node && node.typeVersion === 1.1;
    }
  },
  {
    name: 'Intent Switch typeVersion is 3.4',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Intent Switch');
      return node && node.typeVersion === 3.4;
    }
  },
  {
    name: 'Merge All Branches node exists (consolidated formatters)',
    test: () => workflow.nodes.some(n => n.name === 'Merge All Branches')
  },
  {
    name: 'Unified Format Response node exists',
    test: () => workflow.nodes.some(n => n.name === 'Format Response')
  },
  {
    name: 'get_services output rule exists in Intent Switch',
    test: () => {
      const switchNode = workflow.nodes.find(n => n.name === 'Intent Switch');
      const rules = switchNode.parameters.rules?.values || [];
      return rules.some(r => r.outputKey === 'get_services');
    }
  },
  {
    name: 'All three triggers connect to Type Normalization',
    test: () => {
      const connections = workflow.connections;
      const webhookConn = connections.Webhook?.main?.[0]?.[0]?.node;
      const manualConn = connections['Manual Trigger']?.main?.[0]?.[0]?.node;
      const executeConn = connections['Execute Workflow Trigger']?.main?.[0]?.[0]?.node;
      return webhookConn === 'Type Normalization' &&
             manualConn === 'Type Normalization' &&
             executeConn === 'Type Normalization';
    }
  }
];

let structuralPassed = 0;
structuralTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) structuralPassed++;
});

console.log(`\nStructural Tests: ${structuralPassed}/${structuralTests.length} passed`);

// ============== FORMATTER CONSOLIDATION TESTS ==============
console.log('\n[2] FORMATTER CONSOLIDATION');
console.log('-'.repeat(70));

const duplicateFormatterNames = [
  'Formatter: Invalid Payload',
  'Formatter: Rule Blocked',
  'Formatter: Create',
  'Formatter: Cancel',
  'Formatter: Check',
  'Formatter: Find',
  'Formatter: Fallback',
  'Formatter: GetServices'
];

const formatterTests = [
  {
    name: 'Old duplicate formatters removed (8 nodes)',
    test: () => {
      return duplicateFormatterNames.every(name => 
        !workflow.nodes.some(n => n.name === name)
      );
    }
  },
  {
    name: 'Single unified Format Response node exists',
    test: () => workflow.nodes.some(n => n.name === 'Format Response')
  },
  {
    name: 'Format Response uses isExecuted guard for Rule Firewall',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Response');
      return node && node.parameters.jsCode.includes('isExecuted');
    }
  },
  {
    name: 'Format Response includes Standard Contract fields',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Response');
      const code = node.parameters.jsCode;
      // Check for Standard Contract fields (either as variable names or object properties)
      return code.includes('success') &&
             code.includes('error_code') &&
             code.includes('error_message') &&
             code.includes('_meta') &&
             code.includes('workflow_id') &&
             code.includes('version');
    }
  },
  {
    name: 'All branches connect to Merge node',
    test: () => {
      const responseGens = [
        'Response Gen: create_booking',
        'Response Gen: cancel_booking',
        'Response Gen: check_availability',
        'Response Gen: find_next',
        'Response Gen: get_services',
        'Response Gen: general_chat'
      ];
      return responseGens.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        if (!node) return false;
        const conn = workflow.connections[name];
        return conn?.main?.[0]?.[0]?.node === 'Merge All Branches';
      });
    }
  },
  {
    name: 'Merge node connects to Format Response',
    test: () => {
      const conn = workflow.connections['Merge All Branches'];
      return conn?.main?.[0]?.[0]?.node === 'Format Response';
    }
  }
];

let formatterPassed = 0;
formatterTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) formatterPassed++;
});

console.log(`\nFormatter Consolidation: ${formatterPassed}/${formatterTests.length} passed`);

// ============== GET_SERVICES BRANCH TESTS ==============
console.log('\n[3] GET_SERVICES BRANCH (RAG_02 INTEGRATION)');
console.log('-'.repeat(70));

const getServicesTests = [
  {
    name: 'get_services in Intent Normalizer allowed array',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Intent Normalizer');
      return node.parameters.jsCode.includes('"get_services"');
    }
  },
  {
    name: 'Extract Params: get_services node exists',
    test: () => workflow.nodes.some(n => n.name === 'Extract Params: get_services')
  },
  {
    name: 'Parse JSON: get_services node exists',
    test: () => workflow.nodes.some(n => n.name === 'Parse JSON: get_services')
  },
  {
    name: 'Execute: RAG_02 node exists',
    test: () => workflow.nodes.some(n => n.name === 'Execute: RAG_02')
  },
  {
    name: 'Response Gen: get_services node exists',
    test: () => workflow.nodes.some(n => n.name === 'Response Gen: get_services')
  },
  {
    name: 'Intent Switch routes get_services correctly',
    test: () => {
      const conn = workflow.connections['Intent Switch'];
      const getServicesOutput = conn.main[4]?.[0]?.node;
      return getServicesOutput === 'Extract Params: get_services';
    }
  },
  {
    name: 'get_services branch connects to Merge',
    test: () => {
      const conn = workflow.connections['Response Gen: get_services'];
      return conn?.main?.[0]?.[0]?.node === 'Merge All Branches';
    }
  }
];

let getServicesPassed = 0;
getServicesTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) getServicesPassed++;
});

console.log(`\nGet Services Branch: ${getServicesPassed}/${getServicesTests.length} passed`);

// ============== DEAD CODE REMOVAL TESTS ==============
console.log('\n[4] DEAD CODE REMOVAL IN PARSE JSON NODES');
console.log('-'.repeat(70));

const parseJsonNodes = [
  'Parse JSON: create_booking',
  'Parse JSON: cancel_booking',
  'Parse JSON: check_availability',
  'Parse JSON: find_next',
  'Parse JSON: get_services',
  'Parse JSON: general_chat'
];

const deadCodeTests = [
  {
    name: 'No dead code in Parse JSON: create_booking',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Parse JSON: create_booking');
      const code = node.parameters.jsCode;
      // Should NOT have if ('create_booking' === 'check_availability') patterns
      return !code.includes("' === '");
    }
  },
  {
    name: 'No dead code in Parse JSON: cancel_booking',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Parse JSON: cancel_booking');
      const code = node.parameters.jsCode;
      return !code.includes("' === '");
    }
  },
  {
    name: 'No dead code in Parse JSON: check_availability',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Parse JSON: check_availability');
      const code = node.parameters.jsCode;
      return !code.includes("' === '");
    }
  },
  {
    name: 'No dead code in Parse JSON: find_next',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Parse JSON: find_next');
      const code = node.parameters.jsCode;
      return !code.includes("' === '");
    }
  },
  {
    name: 'All Parse JSON nodes have simplified logic',
    test: () => {
      return parseJsonNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        if (!node) return false;
        const code = node.parameters.jsCode;
        // Should have direct assignments, not conditional branches
        return code.includes('params.') && !code.includes("if ('");
      });
    }
  }
];

let deadCodePassed = 0;
deadCodeTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) deadCodePassed++;
});

console.log(`\nDead Code Removal: ${deadCodePassed}/${deadCodeTests.length} passed`);

// ============== RETRYONFAIL TESTS ==============
console.log('\n[5] RETRYONFAIL ON LLM NODES (O04 WATCHDOG)');
console.log('-'.repeat(70));

const llmNodes = [
  'Intent Classifier LLM',
  'Extract Params: create_booking',
  'Extract Params: cancel_booking',
  'Extract Params: check_availability',
  'Extract Params: find_next',
  'Extract Params: get_services',
  'Response Gen: create_booking',
  'Response Gen: cancel_booking',
  'Response Gen: check_availability',
  'Response Gen: find_next',
  'Response Gen: get_services',
  'Response Gen: general_chat',
  'Fallback Response LLM'
];

const retryTests = [
  {
    name: 'Intent Classifier LLM has retryOnFail',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Intent Classifier LLM');
      return node.retryOnFail?.enabled === true && node.retryOnFail.maxTries >= 3;
    }
  },
  {
    name: 'All Extract Params nodes have retryOnFail',
    test: () => {
      const extractNodes = llmNodes.filter(n => n.startsWith('Extract Params'));
      return extractNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        return node && node.retryOnFail?.enabled === true;
      });
    }
  },
  {
    name: 'All Response Gen nodes have retryOnFail',
    test: () => {
      const responseNodes = llmNodes.filter(n => n.startsWith('Response Gen'));
      return responseNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        return node && node.retryOnFail?.enabled === true;
      });
    }
  },
  {
    name: 'Fallback Response LLM has retryOnFail',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Fallback Response LLM');
      return node.retryOnFail?.enabled === true;
    }
  },
  {
    name: 'All 13 LLM nodes have retryOnFail configured',
    test: () => {
      return llmNodes.every(name => {
        const node = workflow.nodes.find(n => n.name === name);
        return node && node.retryOnFail?.enabled === true;
      });
    }
  }
];

let retryPassed = 0;
retryTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) retryPassed++;
});

console.log(`\nRetryOnFail Tests: ${retryPassed}/${retryTests.length} passed`);

// ============== ISEXECUTED GUARD TESTS ==============
console.log('\n[6] ISEXECUTED GUARD (GEMINI.md §5 FIX)');
console.log('-'.repeat(70));

const isExecutedTests = [
  {
    name: 'Format Response uses isExecuted guard',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Response');
      const code = node.parameters.jsCode;
      return code.includes('isExecuted') && code.includes("$('Rule Firewall').isExecuted");
    }
  },
  {
    name: 'No try/catch workaround for Rule Firewall access',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Response');
      const code = node.parameters.jsCode;
      // Should NOT have try { chatId = $('Rule Firewall')... } catch
      return !code.match(/try\s*\{\s*chatId\s*=\s*\$\(['"]Rule Firewall['"]\)/);
    }
  },
  {
    name: 'Format Response has proper null check before isExecuted',
    test: () => {
      const node = workflow.nodes.find(n => n.name === 'Format Response');
      const code = node.parameters.jsCode;
      return code.includes('if (!chatId)') && code.includes('isExecuted');
    }
  }
];

let isExecutedPassed = 0;
isExecutedTests.forEach(test => {
  const passed = test.test();
  console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
  if (passed) isExecutedPassed++;
});

console.log(`\nisExecuted Guard Tests: ${isExecutedPassed}/${isExecutedTests.length} passed`);

// ============== CONNECTION FLOW VALIDATION ==============
console.log('\n[7] CONNECTION FLOW VALIDATION');
console.log('-'.repeat(70));

const expectedFlow = [
  { from: 'Type Normalization', to: 'Payload Validation' },
  { from: 'Payload Validation', to: 'Is Valid Payload?' },
  { from: 'Is Valid Payload?', to: 'Rule Firewall', branch: 'valid' },
  { from: 'Is Valid Payload?', to: 'Format Validation Error', branch: 'invalid' },
  { from: 'Rule Firewall', to: 'Is Safe by Rules?' },
  { from: 'Is Safe by Rules?', to: 'Intent Classifier LLM', branch: 'safe' },
  { from: 'Is Safe by Rules?', to: 'Format Security Error', branch: 'blocked' },
  { from: 'Intent Classifier LLM', to: 'Intent Normalizer' },
  { from: 'Intent Normalizer', to: 'Intent Switch' },
  { from: 'Intent Switch', to: 'Extract Params: create_booking', branch: 'create' },
  { from: 'Intent Switch', to: 'Extract Params: cancel_booking', branch: 'cancel' },
  { from: 'Intent Switch', to: 'Extract Params: check_availability', branch: 'check' },
  { from: 'Intent Switch', to: 'Extract Params: find_next', branch: 'find' },
  { from: 'Intent Switch', to: 'Extract Params: get_services', branch: 'get_services' },
  { from: 'Intent Switch', to: 'Fallback Response LLM', branch: 'general' },
  { from: 'Response Gen: create_booking', to: 'Merge All Branches' },
  { from: 'Response Gen: cancel_booking', to: 'Merge All Branches' },
  { from: 'Response Gen: check_availability', to: 'Merge All Branches' },
  { from: 'Response Gen: find_next', to: 'Merge All Branches' },
  { from: 'Response Gen: get_services', to: 'Merge All Branches' },
  { from: 'Response Gen: general_chat', to: 'Merge All Branches' },
  { from: 'Merge All Branches', to: 'Format Response' }
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

const totalTests = structuralTests.length + formatterTests.length + getServicesTests.length + deadCodeTests.length + retryTests.length + isExecutedTests.length + expectedFlow.length;
const totalPassed = structuralPassed + formatterPassed + getServicesPassed + deadCodePassed + retryPassed + isExecutedPassed + flowPassed;

console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│  Category                        Passed  Total   Rate              │
├─────────────────────────────────────────────────────────────────────┤
│  Structural Tests                ${String(structuralPassed).padStart(2)}      ${String(structuralTests.length).padStart(2)}      ${(structuralPassed/structuralTests.length*100).toFixed(0)}%               │
│  Formatter Consolidation         ${String(formatterPassed).padStart(2)}       ${String(formatterTests.length).padStart(2)}      ${(formatterPassed/formatterTests.length*100).toFixed(0)}%               │
│  Get Services Branch             ${String(getServicesPassed).padStart(2)}       ${String(getServicesTests.length).padStart(2)}      ${(getServicesPassed/getServicesTests.length*100).toFixed(0)}%               │
│  Dead Code Removal               ${String(deadCodePassed).padStart(2)}       ${String(deadCodeTests.length).padStart(2)}      ${(deadCodePassed/deadCodeTests.length*100).toFixed(0)}%               │
│  RetryOnFail (Watchdog)          ${String(retryPassed).padStart(2)}       ${String(retryTests.length).padStart(2)}      ${(retryPassed/retryTests.length*100).toFixed(0)}%               │
│  isExecuted Guard                ${String(isExecutedPassed).padStart(2)}       ${String(isExecutedTests.length).padStart(2)}      ${(isExecutedPassed/isExecutedTests.length*100).toFixed(0)}%               │
│  Connection Flow                 ${String(flowPassed).padStart(2)}      ${String(expectedFlow.length).padStart(2)}      ${(flowPassed/expectedFlow.length*100).toFixed(0)}%               │
├─────────────────────────────────────────────────────────────────────┤
│  TOTAL                           ${String(totalPassed).padStart(2)}      ${String(totalTests).padStart(2)}      ${(totalPassed/totalTests*100).toFixed(1)}%               │
└─────────────────────────────────────────────────────────────────────┘
`);

if (totalPassed === totalTests) {
  console.log('✓ All tests passed! Workflow v2.0.0 is ready for production.');
  process.exit(0);
} else {
  console.log(`✗ ${totalTests - totalPassed} test(s) failed. Review issues above.`);
  process.exit(1);
}
