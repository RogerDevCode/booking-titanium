import fs from 'fs';

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Local utility regex is fine inside the patching script, just not in workflows
}

function patchWorkflow(filename, patches) {
  const filePath = `workflows/${filename}`;
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] ${filename} no existe.`);
    return;
  }
  const wf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changes = 0;

  for (let node of wf.nodes) {
    if (node.parameters && node.parameters.jsCode) {
      let code = node.parameters.jsCode;
      
      for (const p of patches) {
        if (p.search instanceof RegExp) {
          const newCode = code.replace(p.search, p.replace);
          if (newCode !== code) { code = newCode; changes++; }
        } else {
          const splitCode = code.split(p.search);
          if (splitCode.length > 1) {
            code = splitCode.join(p.replace);
            changes++;
          }
        }
      }
      
      if (node.parameters.jsCode !== code) {
        node.parameters.jsCode = code;
      }
    }
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, JSON.stringify(wf, null, 2), 'utf8');
    console.log(`[OK] Parcheado ${filename} (${changes} cambios).`);
  } else {
    console.log(`[NO CHANGES] ${filename}`);
  }
}

// 1. DB_Create_Booking.json
patchWorkflow('DB_Create_Booking.json', [
  {
    search: "const INT_RE = /^\\d+$/;\nconst ISO_RE = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})?$/;\nconst SAFE_STR_RE = /^[^'\";\\\\]{1,255}$/;",
    replace: `function isPositiveInt(str) { const n = Number(str); return Number.isInteger(n) && n > 0 && String(n) === String(str).trim(); }
function isNonNegativeInt(str) { const n = Number(str); return Number.isInteger(n) && n >= 0 && String(n) === String(str).trim(); }
function isSafeStr(str) { if (!str || str.length > 255) return false; for(let i=0; i<str.length; i++) { const c = str[i]; if (c === "'" || c === '"' || c === ";" || c === '\\\\') return false; } return true; }
function isIsoDate(str) { const d = new Date(str); return !isNaN(d.getTime()) && String(str).includes('T'); }`
  },
  { search: "!SAFE_STR_RE.test(idempotency_key)", replace: "!isSafeStr(idempotency_key)" },
  { search: "!INT_RE.test(pidStr)", replace: "!isPositiveInt(pidStr)" },
  { search: "!INT_RE.test(sidStr)", replace: "!isPositiveInt(sidStr)" },
  { search: "!ISO_RE.test(start_time)", replace: "!isIsoDate(start_time)" },
  { search: "!ISO_RE.test(end_time)", replace: "!isIsoDate(end_time)" },
  { search: "!INT_RE.test(cidStr)", replace: "!isNonNegativeInt(cidStr)" },
  { search: "!SAFE_STR_RE.test(gcal_event_id)", replace: "!isSafeStr(gcal_event_id)" }
]);

// 2. DB_Reschedule_Booking.json
patchWorkflow('DB_Reschedule_Booking.json', [
  {
    search: "!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)",
    replace: "!(typeof bookingId === 'string' && bookingId.length === 36 && bookingId.split('-').length === 5)"
  },
  {
    search: "const parts = startTime.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);\n\nif (!parts) {\n  return [{ json: { success: false, error_code: 'INVALID_DATE_FORMAT', error_message: 'Format must be ISO 8601' } }];\n}\n\nconst [full, y, m, d, hh, mm, ss] = parts.map(p => parseInt(p, 10));",
    replace: `const dateObjCheck = new Date(startTime);
if (isNaN(dateObjCheck.getTime()) || !startTime.includes('T')) {
  return [{ json: { success: false, error_code: 'INVALID_DATE_FORMAT', error_message: 'Format must be ISO 8601' } }];
}
const datePartStr = startTime.split('T')[0].split('-');
const y = parseInt(datePartStr[0], 10);
const m = parseInt(datePartStr[1], 10);
const d = parseInt(datePartStr[2], 10);`
  }
]);

// 3. NN_05_Reminder_Cron.json
patchWorkflow('NN_05_Reminder_Cron.json', [
  {
    search: "const parts = startRaw.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);\nif (!parts) {\n  return [{ json: { _error: true, _msg: 'Invalid start_time format in DB' } }];\n}\n\nconst dateObj = new Date(startRaw);\nconst [full, y, m, d] = parts.map(p => parseInt(p, 10));",
    replace: `const dateObj = new Date(startRaw);
if (isNaN(dateObj.getTime()) || !startRaw.includes('T')) {
  return [{ json: { _error: true, _msg: 'Invalid start_time format in DB' } }];
}
const dtP = startRaw.split('T')[0].split('-');
const y = parseInt(dtP[0], 10);
const m = parseInt(dtP[1], 10);
const d = parseInt(dtP[2], 10);`
  }
]);

// 4. NN_03_AI_Agent.json
patchWorkflow('NN_03_AI_Agent.json', [
  {
    search: "const isValidChatId = /^\\d+$/.test(String(rawChatId || ''));",
    replace: `const cidStr = String(rawChatId || ''); 
const cidNum = Number(cidStr); 
const isValidChatId = Number.isInteger(cidNum) && cidNum > 0 && String(cidNum) === cidStr.trim();`
  },
  {
    search: "// SEC04 Regex seguro: alfa-numerico, espacios, guiones, puntuacion\nconst isSafeText = /^[\\w\\s\\áéíóúÁÉÍÓÚñÑ\\-\\.,!?()¿¡]+$/i.test(sanitizedText);",
    replace: `// SEC04 Analisis iterativo nativo
const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \\n\\táéíóúÁÉÍÓÚñÑ-.,!?()¿¡";
let isSafeText = true;
for (let i = 0; i < sanitizedText.length; i++) {
  if (!allowed.includes(sanitizedText[i])) { isSafeText = false; break; }
}`
  }
]);

// 5. NN_03-B_Pipeline_Agent.json
patchWorkflow('NN_03-B_Pipeline_Agent.json', [
  { // Type 1 extraction
    search: "const jsonMatch = content.match(/\\\\{[\\\\s\\\\S]*\\\\}/);\nlet params = {};\n\ntry {\n  params = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');\n} catch(e) { params = {}; }",
    replace: `const startIdx = content.indexOf('{');
const endIdx = content.lastIndexOf('}');
let params = {};
try {
  params = JSON.parse(startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx ? content.substring(startIdx, endIdx + 1) : '{}');
} catch(e) { params = {}; }`
  },
  { // Type 2 extraction
    search: "const jsonMatch = content.match(/\\\\{[\\\\s\\\\S]*\\\\}/);\nlet params = {};\n\nif (!jsonMatch) {\n  throw { success: false, error_code: 'PARSE_ERROR', error_message: 'No se detectó JSON en la respuesta del modelo.' };\n}\n\ntry {\n  params = JSON.parse(jsonMatch[0]);\n} catch(e) {\n  throw { success: false, error_code: 'JSON_INVALID', error_message: 'El JSON extraído es inválido.' };\n}",
    replace: `const startIdx = content.indexOf('{');
const endIdx = content.lastIndexOf('}');
let params = {};

if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
  throw { success: false, error_code: 'PARSE_ERROR', error_message: 'No se detectó JSON en la respuesta del modelo.' };
}

try {
  params = JSON.parse(content.substring(startIdx, endIdx + 1));
} catch(e) {
  throw { success: false, error_code: 'JSON_INVALID', error_message: 'El JSON extraído es inválido.' };
}`
  },
  {
    search: "const isoRegex = /^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2})?$/;\nparams.start_time = (params.start_time && isoRegex.test(String(params.start_time)))",
    replace: "const tStr = String(params.start_time || '');\nconst tObj = new Date(tStr);\nparams.start_time = (params.start_time && !isNaN(tObj.getTime()) && tStr.includes('-'))"
  },
  {
    search: "const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\nparams.user_email = emailRegex.test(String(params.user_email))",
    replace: "const eml = String(params.user_email || ''); const emlParts = eml.split('@'); const isEml = emlParts.length === 2 && emlParts[1].includes('.') && !eml.includes(' ');\nparams.user_email = isEml"
  },
  {
    search: "const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nconst shortCodeRegex = /^BKG-[A-Z0-9]{6,10}$/i;\n\nif (!uuidRegex.test(bookingId) && !shortCodeRegex.test(bookingId)) {",
    replace: "const isUUID = bookingId.length === 36 && bookingId.split('-').length === 5;\nconst shortParts = bookingId.toUpperCase().split('BKG-'); const isShort = bookingId.toUpperCase().startsWith('BKG-') && shortParts[1] && shortParts[1].length >= 6 && shortParts[1].length <= 10;\nif (!isUUID && !isShort) {"
  },
  {
    search: "const match = userText.match(/BKG-[A-Z0-9]{6,10}/i);\n  if (match) {\n    params.booking_id = match[0].toUpperCase();",
    replace: `let extractedShort = null;
  const tUpper = userText.toUpperCase();
  const bkgIdx = tUpper.indexOf('BKG-');
  if (bkgIdx !== -1) {
    let code = '';
    for(let i=bkgIdx+4; i<tUpper.length; i++) {
       const c = tUpper.charCodeAt(i);
       if ((c>=48 && c<=57) || (c>=65 && c<=90)) { code += tUpper[i]; } else break;
    }
    if (code.length >= 6 && code.length <= 10) extractedShort = 'BKG-' + code;
  }
  if (extractedShort) {
    params.booking_id = extractedShort;`
  },
  {
    search: "const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nconst bookingId = String(params.booking_id || '');\n\nif (!uuidRegex.test(bookingId)) {",
    replace: "const bookingId = String(params.booking_id || '');\nconst isUUID = bookingId.length === 36 && bookingId.split('-').length === 5;\nif (!isUUID) {"
  },
  {
    search: "const isoDateRegex = /^\\d{4}-\\d{2}-\\d{2}$/;\nparams.date = (params.date && isoDateRegex.test(String(params.date)))",
    replace: "const dStr = String(params.date||''); const docObj = new Date(dStr);\nparams.date = (params.date && !isNaN(docObj.getTime()) && dStr.includes('-'))"
  },
  {
    search: "const uuidMatch = userText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);\nconst shortMatch = userText.match(/BKG-[A-Z0-9]{6,10}/i);\n\nif (!bookingId || bookingId.includes('AQUÍ') || bookingId === 'UUID') {\n  if (uuidMatch) bookingId = uuidMatch[0];\n  else if (shortMatch) bookingId = shortMatch[0].toUpperCase();\n}",
    replace: `if (!bookingId || bookingId.includes('AQUÍ') || bookingId === 'UUID') {
  let extractedShort = null;
  const tUpper = userText.toUpperCase();
  const bkgIdx = tUpper.indexOf('BKG-');
  if (bkgIdx !== -1) {
    let code = '';
    for(let i=bkgIdx+4; i<tUpper.length; i++) {
       const c = tUpper.charCodeAt(i);
       if ((c>=48 && c<=57) || (c>=65 && c<=90)) { code += tUpper[i]; } else break;
    }
    if (code.length >= 6 && code.length <= 10) extractedShort = 'BKG-' + code;
  }
  let extractedUuid = null;
  if (!extractedShort && userText.includes('-')) {
     const wArr = userText.split(' ');
     for(const w of wArr) {
        let cleanW = '';
        for(let i=0;i<w.length;i++) {
           const c = w.charCodeAt(i);
           if ((c>=48&&c<=57)||(c>=65&&c<=90)||(c>=97&&c<=122)||c===45) cleanW += w[i];
        }
        if (cleanW.length === 36 && cleanW.split('-').length === 5) { extractedUuid = cleanW; break; }
     }
  }
  
  if (extractedUuid) bookingId = extractedUuid;
  else if (extractedShort) bookingId = extractedShort;
}`
  },
  {
    search: "const PROFANITY_REGEX = /\\b(conchetumare|ctm|culiao|qliao|pichula|tula|zorra|maraco|maricón|maricon|puta|mierda|fuck|shit|asshole|bitch|bastard|motherfucker|dick|cunt|pussy|prick|estúpido|estupido|idiota|imbécil|imbecil|gilipollas|huevon|weon)\\b/i;\n\nconst INJECTION_PHRASES",
    replace: "const PROFANITY_WORDS = ['conchetumare','ctm','culiao','qliao','pichula','tula','zorra','maraco','maricón','maricon','puta','mierda','fuck','shit','asshole','bitch','bastard','motherfucker','dick','cunt','pussy','prick','estúpido','estupido','idiota','imbécil','imbecil','gilipollas','huevon','weon'];\n\nconst INJECTION_PHRASES"
  },
  {
    search: "if (PROFANITY_REGEX.test(textLower)) isBlocked = true;",
    replace: `let tClean = '';
for(let i=0;i<textLower.length;i++) {
   const c = textLower[i];
   if (c==='.'||c===','||c==='!'||c==='?'||c==='('||c===')') tClean += ' '; else tClean += c;
}
const words = tClean.split(' ');
for(const w of words) { if (PROFANITY_WORDS.includes(w)) { isBlocked = true; break; } }`
  }
]);
