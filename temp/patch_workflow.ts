import fs from 'fs';
const file = '/home/manager/Sync/N8N_Projects/booking-titanium/workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

for (let node of wf.nodes) {
  if (node.name === "Validate Input") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "function ve(code, msg) {\\n  return [{ json: {", 
      "function ve(code, msg) {\\n  return [{ json: {\\n    ...raw,"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\\n  success: true,", 
      "return [{ json: {\\n  ...raw,\\n  success: true,"
    );
  }
  
  if (node.name === "Handle Idempotency Error") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "const e = $input.first().json;\\n",
      "const e = $input.first().json;\\nconst upstreamData = $('Build Idempotency Check Query').isExecuted ? $('Build Idempotency Check Query').first().json : {};\\n"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\\n  success: false,",
      "return [{ json: {\\n  ...upstreamData,\\n  success: false,"
    );
  }
  
  if (node.name === "Handle Insert Error") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "const e = $input.first().json;\\n",
      "const e = $input.first().json;\\nconst upstreamData = $('Build Insert Query').isExecuted ? $('Build Insert Query').first().json : {};\\n"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\\n  success: false,",
      "return [{ json: {\\n  ...upstreamData,\\n  success: false,"
    );
  }
  
  if (node.name === "Format Success Output") {
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "const result = $input.first().json;\\n",
      "const result = $input.first().json;\\nconst upstreamData = $('Build Insert Query').isExecuted ? $('Build Insert Query').first().json : {};\\n"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\\n    success: false,",
      "return [{ json: {\\n    ...upstreamData,\\n    success: false,"
    );
    node.parameters.jsCode = node.parameters.jsCode.replace(
      "return [{ json: {\\n  success: true,",
      "return [{ json: {\\n  ...upstreamData,\\n  success: true,"
    );
  }
}

fs.writeFileSync(file, JSON.stringify(wf, null, 2), 'utf8');
console.log("Workflow patched successfully.");
