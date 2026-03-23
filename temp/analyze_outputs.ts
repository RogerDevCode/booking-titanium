import fs from 'fs';
const wfs = ['DB_Reschedule_Booking.json', 'DB_Create_Booking.json', 'NN_03-B_Pipeline_Agent.json', 'NN_05_Reminder_Cron.json', 'NN_03_AI_Agent.json'];
const issues = [];
for (const file of wfs) {
  const data = JSON.parse(fs.readFileSync('workflows/' + file));
  for (const node of data.nodes) {
    if (node.type === 'n8n-nodes-base.code' && (node.name.includes('Format Success') || node.name.includes('Handle ') || node.name.includes('Return '))) {
      const code = node.parameters.jsCode || '';
      if (!code.includes('success: ') && !code.includes('error_code')) continue;
      if (!code.includes('_meta') || !code.includes('data:')) {
         issues.push({ file, name: node.name, lacks_meta: !code.includes('_meta'), lacks_data: !code.includes('data:') });
      }
    }
  }
}
console.log(JSON.stringify(issues, null, 2));
