const fs = require('fs');
const workflow = JSON.parse(fs.readFileSync('workflows/DB_Create_Booking_current.json', 'utf8'));

// Nodes to remove
const removeIds = new Set([
  'c5af6062-f175-40f6-876b-c7beeeb62373', // Normalize Idempotency Result
  '665ba98e-a179-460e-8598-ed8f8b444e7a'  // Has Existing Booking?
]);

// Filter out the nodes to remove
workflow.nodes = workflow.nodes.filter(node => !removeIds.has(node.id));

// Generate unique IDs for new nodes
const suffix = '_' + Date.now();
const mergeId = 'merge_idempotency' + suffix;
const normalizeId = 'normalize_idempotency_result' + suffix;
const routeId = 'route_booking_decision' + suffix;

// Add Merge node
workflow.nodes.push({
  parameters: {
    mode: "combine",
    waitFor: "all"
  },
  name: "Merge Idempotency Data",
  type: "n8n-nodes-base.merge",
  typeVersion: 1,
  position: [850, 300],
  id: mergeId
});

// Add Normalize Idempotency Result (Code) node
workflow.nodes.push({
  parameters: {
    jsCode: "// Normalize Idempotency Result\n// Extract validated input from branch 1, query result from branch 2\nconst combined = $input[0].json;   // Array of two: [buildResult, checkResult]\nconst buildResult = combined[0];\nconst checkResult = combined[1];\n\nconst has_existing = Array.isArray(checkResult) && checkResult.length > 0 && checkResult[0].id !== undefined;\nconst existing_booking = has_existing ? checkResult[0] : null;\n\nreturn [{ json: { ...buildResult, has_existing, existing_booking } }];"
  },
  name: "Normalize Idempotency Result",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1050, 300],
  id: normalizeId
});

// Add Route Booking Decision (Code) node
workflow.nodes.push({
  parameters: {
    jsCode: "// Route Booking Decision\nconst input = $input.first().json;\n\nif (input.has_existing && input.existing_booking) {\n  return [{ json: { ...input, _route: 'existing' } }];\n} else {\n  return [{ json: { ...input, _route: 'new' } }];\n}"
  },
  name: "Route Booking Decision",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1250, 300],
  id: routeId
});

// Build a map of node ID to node for quick lookup
const nodeMap = {};
workflow.nodes.forEach(node => {
  nodeMap[node.id] = node;
});

// Function to get a node by its old ID (from the exported workflow) - we know these IDs are still present
function getNodeByOldId(oldId) {
  return nodeMap[oldId];
}

// We'll rebuild the connections object
const connections = {};

// Helper to add a connection
function addConnection(fromNodeId, toNodeId, type = 'main', index = 0) {
  if (!connections[fromNodeId]) {
    connections[fromNodeId] = { main: [] };
  }
  // Find if there's already a main array
  let mainArr = connections[fromNodeId].main;
  if (!mainArr) {
    mainArr = [];
    connections[fromNodeId].main = mainArr;
  }
  mainArr.push([{ node: toNodeId, type: type, index: index }]);
}

// Now, set up the connections based on the fixed design

// Validate Input (id: db14881d-5cd8-48ae-be38-ddaff5d80c96)
//   - On error (_exit_early): to Format Response
//   - On success: to Build Idempotency Check Query
const validateInput = getNodeByOldId('db14881d-5cd8-48ae-be38-ddaff5d80c96');
if (validateInput) {
  connections[validateInput.id] = {
    main: [
      [{ node: 'a987b808-3e8b-44b6-a0ad-a3533ddede77', type: 'main', index: 0 }], // Format Response
      [{ node: 'db989c31-3d95-45f6-a547-b017eb0b77ad', type: 'main', index: 0 }]   // Build Idempotency Check Query
    ]
  };
}

// Build Idempotency Check Query (id: db989c31-3d95-45f6-a547-b017eb0b77ad)
//   - To Merge node (input 1)
//   - To Check Idempotency
const buildIdempotencyCheck = getNodeByOldId('db989c31-3d95-45f6-a547-b017eb0b77ad');
if (buildIdempotencyCheck) {
  connections[buildIdempotencyCheck.id] = {
    main: [
      [{ node: mergeId, type: 'main', index: 0 }],
      [{ node: 'cb06f202-4d9c-48d4-86b3-f8d0c4127485', type: 'main', index: 0 }]
    ]
  };
}

// Check Idempotency (id: cb06f202-4d9c-48d4-86b3-f8d0c4127485)
//   - To Merge node (input 2)
//   - To Handle Idempotency Error
const checkIdempotency = getNodeByOldId('cb06f202-4d9c-48d4-86b3-f8d0c4127485');
if (checkIdempotency) {
  connections[checkIdempotency.id] = {
    main: [
      [{ node: mergeId, type: 'main', index: 1 }],
      [{ node: 'f95b3406-37e0-4dd9-8a64-1c7eab91087c', type: 'main', index: 0 }]
    ]
  };
}

// Merge node (id: mergeId)
//   - To Normalize Idempotency Result node
connections[mergeId] = {
  main: [
    [{ node: normalizeId, type: 'main', index: 0 }]
  ]
};

// Normalize Idempotency Result node (id: normalizeId)
//   - To Route Booking Decision node
connections[normalizeId] = {
  main: [
    [{ node: routeId, type: 'main', index: 0 }]
  ]
};

// Route Booking Decision node (id: routeId)
//   - To Return Existing Booking (when _route === 'existing')
//   - To Build Insert Query (when _route === 'new')
connections[routeId] = {
  main: [
    [{ node: '665ba98e-a179-460e-8598-ed8f8b444e7a', type: 'main', index: 0 }], // Return Existing Booking
    [{ node: 'f17ed144-d2f1-47ea-a78e-c9aabdd4efa8', type: 'main', index: 0 }]   // Build Insert Query
  ]
};

// Return Existing Booking (id: 665ba98e-a179-460e-8598-ed8f8b444e7a)
//   - To Format Response
connections['665ba98e-a179-460e-8598-ed8f8b444e7a'] = {
  main: [
    [{ node: 'a987b808-3e8b-44b6-a0ad-a3533ddede77', type: 'main', index: 0 }]
  ]
};

// Build Insert Query (id: f17ed144-d2f1-47ea-a78e-c9aabdd4efa8)
//   - To Execute Insert
connections['f17ed144-d2f1-47ea-a78e-c9aabdd4efa8'] = {
  main: [
    [{ node: '69a35ae9-ae54-4b10-99d4-d81b9203c66b', type: 'main', index: 0 }]
  ]
};

// Execute Insert (id: 69a35ae9-ae54-4b10-99d4-d81b9203c66b)
//   - Success: to Format Success Output
//   - Error: to Handle Insert Error
connections['69a35ae9-ae54-4b10-99d4-d81b9203c66b'] = {
  main: [
    [{ node: '2be29384-4671-4708-9d69-77ce0de4e7be', type: 'main', index: 0 }], // Format Success Output
    [{ node: 'f7473c38-09de-4908-a689-b422aa1b2d77', type: 'main', index: 0 }]   // Handle Insert Error
  ]
};

// Format Success Output (id: 2be29384-4671-4708-9d69-77ce0de4e7be)
//   - To Format Response
connections['2be29384-4671-4708-9d69-77ce0de4e7be'] = {
  main: [
    [{ node: 'a987b808-3e8b-44b6-a0ad-a3533ddede77', type: 'main', index: 0 }]
  ]
};

// Handle Insert Error (id: f7473c38-09de-4908-a689-b422aa1b2d77)
//   - To Format Response
connections['f7473c38-09de-4908-a689-b422aa1b2d77'] = {
  main: [
    [{ node: 'a987b808-3e8b-44b6-a0ad-a3533ddede77', type: 'main', index: 0 }]
  ]
};

// Handle Idempotency Error (id: f95b3406-37e0-4dd9-8a64-1c7eab91087c)
//   - To Format Response
connections['f95b3406-37e0-4dd9-8a64-1c7eab91087c'] = {
  main: [
    [{ node: 'a987b808-3e8b-44b6-a0ad-a3533ddede77', type: 'main', index: 0 }]
  ]
};

// Format Response (id: a987b808-3e8b-44b6-a0ad-a3533ddede77)
//   - No outgoing connections (it's the end)

workflow.connections = connections;

// Update the version
workflow.version = "3.1";

// Write the fixed workflow to a file
fs.writeFileSync('workflows/DB_Create_Booking_fixed.json', JSON.stringify(workflow, null, 2));
console.log('Fixed workflow written to workflows/DB_Create_Booking_fixed.json');
