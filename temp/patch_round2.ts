import fs from 'fs';
const file = 'workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

for (let node of wf.nodes) {
  if (node.name === "Validate Input") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "function ve(code, msg) {\n  return [{ json: {\n    success: false,", 
      "function ve(code, msg) {\n  return [{ json: {\n    ...raw,\n    success: false,"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\n  success: true, idempotency_key", 
      "return [{ json: {\n  ...raw,\n  success: true, idempotency_key"
    );
  }
  
  if (node.name === "Handle Idempotency Error") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "const e = $input.first().json;\nlet error_code = 'IDEMPOTENCY_CHECK_FAILED';",
      "const e = $input.first().json;\nconst upstreamData = $('Build Idempotency Check Query').isExecuted ? $('Build Idempotency Check Query').first().json : {};\nlet error_code = 'IDEMPOTENCY_CHECK_FAILED';"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\n  success: false, error_code, error_message, data: null,\n  _meta",
      "return [{ json: {\n  ...upstreamData,\n  success: false, error_code, error_message, data: null,\n  _meta"
    );
  }
  
  if (node.name === "Handle Insert Error") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "const e = $input.first().json;\nlet error_code = 'DB_INSERT_ERROR';",
      "const e = $input.first().json;\nconst upstreamData = $('Build Insert Query').isExecuted ? $('Build Insert Query').first().json : {};\nlet error_code = 'DB_INSERT_ERROR';"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\n  success: false, error_code, error_message, data: null,\n  _meta",
      "return [{ json: {\n  ...upstreamData,\n  success: false, error_code, error_message, data: null,\n  _meta"
    );
  }
  
  if (node.name === "Format Success Output") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "const result = $input.first().json;\nconst booking_id = result.id || null;",
      "const result = $input.first().json;\nconst upstreamData = $('Build Insert Query').isExecuted ? $('Build Insert Query').first().json : {};\nconst booking_id = result.id || null;"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\n    success: false, error_code: 'DB_ERROR',\n",
      "return [{ json: {\n    ...upstreamData,\n    success: false, error_code: 'DB_ERROR',\n"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\n  success: true, error_code: null, error_message: null,\n",
      "return [{ json: {\n  ...upstreamData,\n  success: true, error_code: null, error_message: null,\n"
    );
  }
}

fs.writeFileSync(file, JSON.stringify(wf, null, 2), 'utf8');
console.log("Workflow patched successfully via Node script replacement.");
