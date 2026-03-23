import fs from 'fs';

function applyRegexPatch(filename, patches) {
  const filePath = `workflows/${filename}`;
  if (!fs.existsSync(filePath)) return;
  const wf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changes = 0;
  
  for (let node of wf.nodes) {
    if (node.parameters && node.parameters.jsCode) {
      let code = node.parameters.jsCode;
      
      for (const p of patches) {
        const newCode = code.replace(p.search, p.replace);
        if (newCode !== code) { code = newCode; changes++; }
      }
      
      if (node.parameters.jsCode !== code) {
        node.parameters.jsCode = code;
      }
    }
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, JSON.stringify(wf, null, 2), 'utf8');
    console.log(`[OK] Parcheado 2 ${filename} (${changes} cambios)`);
  }
}

// 1. NN_03_AI_Agent.json
applyRegexPatch('NN_03_AI_Agent.json', [
  { search: /const isValidChatId = \/\^\\d\+\$\/\.test\(String\(rawChatId \|\| ''\)\);/, replace: "const cidStr = String(rawChatId || ''); const cidNum = Number(cidStr); const isValidChatId = Number.isInteger(cidNum) && cidNum > 0 && String(cidNum) === cidStr.trim();" },
  { search: /const isSafeText = \/\^\[\\w(?:.*?)\$\/i\.test\(sanitizedText\);/, replace: `const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \\n\\táéíóúÁÉÍÓÚñÑ-.,!?()¿¡'; let isSafeText = true; for (let i = 0; i < sanitizedText.length; i++) { if (!allowed.includes(sanitizedText[i])) { isSafeText = false; break; } }` }
]);

// 2. NN_03-B_Pipeline_Agent.json
applyRegexPatch('NN_03-B_Pipeline_Agent.json', [
  { search: /const PROFANITY_REGEX = \/\\b\(conchetumare\|[^/]+\/i;/, replace: "const PROFANITY_WORDS = ['conchetumare','ctm','culiao','qliao','pichula','tula','zorra','maraco','maricón','maricon','puta','mierda','fuck','shit','asshole','bitch','bastard','motherfucker','dick','cunt','pussy','prick','estúpido','estupido','idiota','imbécil','imbecil','gilipollas','huevon','weon'];" },
  { search: /if \(PROFANITY_REGEX\.test\(textLower\)\) isBlocked = true;/, replace: "let tClean = ''; for(let i=0;i<textLower.length;i++) { const c = textLower[i]; if (c==='.'||c===','||c==='!'||c==='?'||c==='('||c===')') tClean += ' '; else tClean += c; } const words = tClean.split(' '); for(const w of words) { if (PROFANITY_WORDS.includes(w)) { isBlocked = true; break; } }" },
  { search: /const isoRegex = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\(T\\d\{2\}:\\d\{2\}:\\d\{2\}\)\?\$\/;\nparams\.start_time = \(params\.start_time && isoRegex\.test\(String\(params\.start_time\)\)\)/g, replace: "const tStr = String(params.start_time || ''); const tObj = new Date(tStr); params.start_time = (params.start_time && !isNaN(tObj.getTime()) && tStr.includes('-'))" },
  { search: /const emailRegex = \/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\\.\[\^\\s@\]\+\$\/;\nparams\.user_email = emailRegex\.test\(String\(params\.user_email\)\)/g, replace: "const eml = String(params.user_email || ''); const emlParts = eml.split('@'); const isEml = emlParts.length === 2 && emlParts[1].includes('.') && !eml.includes(' '); params.user_email = isEml" },
  { search: /const uuidRegex = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i;\nconst bookingId = String\(params\.booking_id \|\| ''\);\n\nif \(\!uuidRegex\.test\(bookingId\)\) \{/g, replace: "const bookingId = String(params.booking_id || ''); const isUUID = bookingId.length === 36 && bookingId.split('-').length === 5; if (!isUUID) {" },
  { search: /const isoDateRegex = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/;\nparams\.date = \(params\.date && isoDateRegex\.test\(String\(params\.date\)\)\)/g, replace: "const dStr = String(params.date||''); const docObj = new Date(dStr); params.date = (params.date && !isNaN(docObj.getTime()) && dStr.includes('-'))" },
  { search: /const jsonMatch = content\.match\(\/\\\\\{\[\\\\s\\\\S\]\*\\\\\}\/\);\nlet params = \{\};\n\nif \(\!jsonMatch\) \{\n  throw \{ success: false, error_code: 'PARSE_ERROR', error_message: 'No se detectó JSON en la respuesta del modelo\.' \};\n\}\n\ntry \{\n  params = JSON\.parse\(jsonMatch\[0\]\);\n\} catch\(e\) \{\n  throw \{ success: false, error_code: 'JSON_INVALID', error_message: 'El JSON extraído es inválido\.' \};\n\}/g, replace: "const startIdx = content.indexOf('{'); const endIdx = content.lastIndexOf('}'); let params = {}; if (startIdx === -1 || Math === -1 || startIdx >= endIdx) { throw { success: false, error_code: 'PARSE_ERROR', error_message: 'No se detectó JSON en la respuesta del modelo.' }; } try { params = JSON.parse(content.substring(startIdx, endIdx + 1)); } catch(e) { throw { success: false, error_code: 'JSON_INVALID', error_message: 'El JSON extraído es inválido.' }; }" }
]);

// 3. DB_Reschedule_Booking.json
applyRegexPatch('DB_Reschedule_Booking.json', [
  { search: /if \(\!bookingId \|\| \!\/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i\.test\(bookingId\)\) \{/, replace: "if (!bookingId || !(typeof bookingId === 'string' && bookingId.length === 36 && bookingId.split('-').length === 5)) {" }
]);
