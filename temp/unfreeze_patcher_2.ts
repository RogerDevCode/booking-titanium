import fs from "fs";
import path from "path";

const workflows = [
  {
    file: "workflows/WF2_Booking_Orchestrator.json",
    nodeName: "Generate Idempotency Key",
    regexReplace: true,
    searchFilter: /return \[\{\s*json:\s*\{\s*success:\s*false,\s*error_code:\s*'([^']+)',\s*error_message:\s*([^}]+)\s*\}\s*\}\];/g,
    replacement: "return [{ json: { success: false, error_code: '$1', error_message:$2, data: null, _meta: { source: 'WF2_BOOKING_ORCHESTRATOR', timestamp: new Date().toISOString() } } }];"
  },
  {
    file: "workflows/SEED_01_Daily_Provisioning.json",
    nodeName: "Report Summary",
    regexReplace: false,
    searchStr: "    success: integrity_status === 'OK' && failed.length === 0,\n    message: `Seeding completed",
    replacementStr: "    success: integrity_status === 'OK' && failed.length === 0,\n    error_code: (integrity_status === 'OK' && failed.length === 0) ? null : 'PROVISIONING_ERROR',\n    error_message: (integrity_status === 'OK' && failed.length === 0) ? null : 'Some slots failed to provision or integrity warning',\n    message: `Seeding completed"
  }
];

let totalChanges = 0;

for (const wf of workflows) {
  const filePath = path.join(process.cwd(), wf.file);
  let data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let changes = 0;

  const node = data.nodes.find((n: any) => n.name === wf.nodeName);
  if (!node || !node.parameters || !node.parameters.jsCode) {
    console.warn(`[WARN] Node '${wf.nodeName}' not found`);
    continue;
  }

  if (wf.regexReplace) {
    const original = node.parameters.jsCode;
    node.parameters.jsCode = original.replace(wf.searchFilter, wf.replacement);
    if (original !== node.parameters.jsCode) changes++;
  } else {
    if (node.parameters.jsCode.includes(wf.searchStr as string)) {
      node.parameters.jsCode = node.parameters.jsCode.split(wf.searchStr).join(wf.replacementStr);
      changes++;
    }
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[OK] Patched Rule 3.2 ${path.basename(wf.file)}`);
    totalChanges++;
  } else {
    console.log(`[INFO] No changes to ${wf.file}`);
  }
}

if (totalChanges > 0) process.exit(0);
else process.exit(1);
