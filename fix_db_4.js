const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// 1. Process Idempotency needs to merge validated input context properly
const processIdemp = wf.nodes.find(n => n.name === 'Process Idempotency');
if (processIdemp) {
    processIdemp.parameters.jsCode = "const items = $input.all();\nconst validated = $('Validate & Prepare').first().json;\nif (items.length > 0 && items[0].json && items[0].json.message && !items[0].json.booking_id) {\n  return [{ json: { ...validated, _db_error: items[0].json.message, _is_duplicate: false } }];\n}\nconst hasDup = items.length > 0 && items[0].json && items[0].json.booking_id;\nreturn [{ json: { ...validated, _is_duplicate: !!hasDup, _dup: hasDup ? items[0].json : null } }];";
}

// 2. Validate Is Duplicate node format (needs to check _is_duplicate properly)
const isDup = wf.nodes.find(n => n.name === 'Is Duplicate?');
if (isDup) {
    isDup.parameters.conditions.conditions[0] = { 
        id: "is_dup", 
        leftValue: "={{ $json._is_duplicate }}", 
        rightValue: true, 
        operator: { type: "boolean", operation: "equals" } 
    };
}

// 3. Duplicate SCO missing booking context 
const returnDup = wf.nodes.find(n => n.name === 'Return Duplicate SCO');
if (returnDup) {
    returnDup.parameters.jsCode = "const input = $input.first().json;\nreturn [{ json: {\n  success: true,\n  data: { booking_id: input._dup.booking_id, status: input._dup.status, gcal_event_id: input._dup.gcal_event_id, is_duplicate: true },\n  _meta: { source: 'WF2_Orchestrator', timestamp: new Date().toISOString(), workflow_id: $workflow.id }\n}}];";
}

// 4. Ensure Check DB Idempotency always outputs data
const checkDbIdemp = wf.nodes.find(n => n.name === 'Check DB Idempotency');
if (checkDbIdemp) {
    checkDbIdemp.alwaysOutputData = true;
}

// Clean up some unneeded properties from earlier mistakes
delete wf.id;
delete wf.active;

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
console.log('Patched Process Idempotency and Duplicates context flow');
