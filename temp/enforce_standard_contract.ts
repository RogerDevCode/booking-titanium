import fs from 'fs';

function applyCodePatch(filename, patches) {
  const filePath = `workflows/${filename}`;
  if (!fs.existsSync(filePath)) return;
  const wf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changes = 0;
  
  for (let node of wf.nodes) {
    if (node.parameters && node.parameters.jsCode) {
      let code = node.parameters.jsCode;
      
      for (const p of patches) {
        if (p.nodeName && node.name !== p.nodeName) continue;
        
        let newCode = code;
        if (p.search instanceof RegExp) {
          newCode = code.replace(p.search, p.replace);
        } else {
          newCode = code.split(p.search).join(p.replace);
        }
        
        if (newCode !== code) { code = newCode; changes++; }
      }
      
      if (node.parameters.jsCode !== code) {
        node.parameters.jsCode = code;
      }
    }
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, JSON.stringify(wf, null, 2), 'utf8');
    console.log(`[OK] Parcheado Rule 3.2 ${filename} (${changes} cambios)`);
  }
}

// 1. DB_Reschedule_Booking.json
applyCodePatch('DB_Reschedule_Booking.json', [
  { 
    nodeName: 'Validate Reschedule Input',
    // Catch every `success: false` and inject _meta and data
    search: "success: false,", 
    replace: "success: false, data: null, _meta: { source: 'DB_Reschedule_Booking', timestamp: new Date().toISOString() }," 
  },
  {
    nodeName: 'Validate Reschedule Input',
    search: "return [{ json: { success: true, booking_id: body.booking_id, new_start_time: startTime } }];",
    replace: `return [{ json: { 
  success: true, 
  error_code: null, error_message: null, 
  data: { booking_id: body.booking_id, new_start_time: startTime }, 
  _meta: { source: 'DB_Reschedule_Booking', timestamp: new Date().toISOString() } 
} }];`
  },
  { 
    nodeName: 'Final Response',
    search: "success: false,", 
    replace: "success: false, data: null, _meta: { source: 'DB_Reschedule_Booking', timestamp: new Date().toISOString() }," 
  }
]);

// 2. NN_05_Reminder_Cron.json
applyCodePatch('NN_05_Reminder_Cron.json', [
  {
    nodeName: 'Build Initial Variables',
    search: "return [{ json: { _error: true, _msg: 'Invalid start_time format in DB' } }];",
    replace: "return [{ json: { success: false, error_code: 'INVALID_DB_DATA', error_message: 'Invalid start_time format in DB', data: null, _meta: { source: 'NN_05_Reminder_Cron', timestamp: new Date().toISOString() } } }];"
  },
  {
    nodeName: 'Build Initial Variables',
    search: /^return \[\{ json: \{([\s\S]+?)\} \}\];$/m,
    replace: `return [{ json: {
  success: true,
  error_code: null,
  error_message: null,
  data: {$1},
  _meta: { source: 'NN_05_Reminder_Cron', timestamp: new Date().toISOString() }
} }];`
  }
]);

// 3. NN_03_AI_Agent.json
applyCodePatch('NN_03_AI_Agent.json', [
  {
    nodeName: 'Validate Input',
    search: "return [{ json: {\n  isValid,",
    replace: "return [{ json: {\n  success: true,\n  error_code: null,\n  error_message: null,\n  data: {\n    isValid,"
  },
  {
    nodeName: 'Validate Input',
    search: "    version: \"2.0.0\"\n  }\n}}];",
    replace: "    version: \"2.0.0\"\n  }\n} }];"
  }
]);

// 4. NN_03-B_Pipeline_Agent.json
// Missing success true wrappers
applyCodePatch('NN_03-B_Pipeline_Agent.json', [
  {
    nodeName: 'Profanity & Injection Check',
    search: "return [{ json: { ...$json, isBlocked } }];",
    replace: "return [{ json: { success: true, error_code: null, error_message: null, data: { ...$json, isBlocked }, _meta: { source: 'NN_03-B_Pipeline_Agent', timestamp: new Date().toISOString() } } }];"
  },
  {
    search: "throw { success: false,",
    replace: "throw { success: false, data: null, _meta: { source: 'NN_03-B_Pipeline_Agent', timestamp: new Date().toISOString() },"
  }
]);
