import fs from "fs";
import path from "path";

const workflows = [
  {
    file: "workflows/WF2_Booking_Orchestrator.json",
    patches: [
      {
        nodeName: "Error - No Availability",
        search: "data: $input.first().json.data || null, // Incluimos la razón (p.ej. mode fail-safe)",
        replace: "data: { ctx, rawData: $input.first().json.data || null }, // Modified to wrap context inside data"
      },
      {
        nodeName: "Error - No Availability",
        search: "ctx,\n    success: false,",
        replace: "success: false,"
      },
      {
        nodeName: "Return Duplicate",
        search: "ctx,\n    success: true,",
        replace: "success: true,"
      },
      {
        nodeName: "Return Duplicate",
        search: "data: {\n      booking_id",
        replace: "data: {\n      ctx,\n      booking_id"
      },
      {
        nodeName: "Final Response",
        search: "return [{ json: { success: false, error_code: 'ORCHESTRATOR_INTERNAL_ERROR', error_message: String(err), _meta: { source: 'WF2_BOOKING_ORCHESTRATOR', timestamp: new Date().toISOString() } } }];",
        replace: "return [{ json: { success: false, error_code: 'ORCHESTRATOR_INTERNAL_ERROR', error_message: String(err), data: null, _meta: { source: 'WF2_BOOKING_ORCHESTRATOR', timestamp: new Date().toISOString() } } }];"
      }
    ]
  },
  {
    file: "workflows/SEED_01_Daily_Provisioning.json",
    patches: [
      {
        nodeName: "Handle Slot Error",
        search: "success: false,\n    slot: 'unknown',\n    error_code: 'PROCESS_SLOT_CRASH',\n    error_message: err.message || err.error?.message || 'SEED_01_Process_Slot crashed',\n    idempotency_key: null,\n    source: 'SEED_01',\n    _meta",
        replace: "success: false,\n    error_code: 'PROCESS_SLOT_CRASH',\n    error_message: err.message || err.error?.message || 'SEED_01_Process_Slot crashed',\n    data: { slot: 'unknown', idempotency_key: null, source: 'SEED_01' },\n    _meta"
      }
    ]
  }
];

let totalChanges = 0;

for (const wf of workflows) {
  const filePath = path.join(process.cwd(), wf.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Status: SKIP - ${wf.file} not found.`);
    continue;
  }

  let data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let changes = 0;

  for (const patch of wf.patches) {
    const node = data.nodes.find((n: any) => n.name === patch.nodeName);
    if (!node || !node.parameters || !node.parameters.jsCode) {
      console.warn(`[WARN] Node '${patch.nodeName}' not found or lacks jsCode in ${wf.file}`);
      continue;
    }

    if (node.parameters.jsCode.includes(patch.search)) {
      node.parameters.jsCode = node.parameters.jsCode.split(patch.search).join(patch.replace);
      changes++;
    } else if (node.parameters.jsCode.includes(patch.replace)) {
      console.log(`[INFO] Patch already applied on '${patch.nodeName}' in ${wf.file}`);
    } else {
      console.warn(`[WARN] Search string not found in '${patch.nodeName}' of ${wf.file}`);
    }
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[OK] Patched Rule 3.2 ${path.basename(wf.file)} (${changes} patches applied)`);
    totalChanges += changes;
  } else {
    console.log(`[INFO] No changes made to ${path.basename(wf.file)}`);
  }
}

if (totalChanges > 0) process.exit(0);
else process.exit(1);
