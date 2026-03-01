const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Standard Success Output') {
    node.parameters.jsCode = `return [{\n  json: {\n    success: true,\n    error_code: null,\n    data: {\n      booking_id: $node["Execute DB Create"].json.data?.booking_id,\n      ai_response: $node["Execute NN_03 (AI)"].json.data?.ai_response\n    },\n    _meta: { source: "NN_01_Booking_Gateway", timestamp: new Date().toISOString(), workflow_id: "NN_01" }\n  }\n}];`;
  }
  if (node.name === 'Standard Error Handler') {
    node.parameters.jsCode = `const prev = $input.first()?.json || {};\nreturn [{\n  json: {\n    success: false,\n    error_code: prev.error_code || "VALIDATION_ERROR",\n    error_message: prev.error_message || "Error en la cadena de procesamiento.",\n    data: null,\n    _meta: { source: "NN_01_Booking_Gateway", timestamp: new Date().toISOString(), workflow_id: "NN_01" }\n  }\n}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
