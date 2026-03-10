#!/usr/bin/env tsx
/**
 * Test RAG_01 Validation Regex - Spanish & English Characters
 * =============================================================
 * Tests the validation regex patterns locally without server
 */

// SEC04 - Regex Whitelist (Spanish + English Unicode support)
// \u00C0-\u00FF: Latin-1 Supplement (àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ)
// \u0100-\u017F: Latin Extended-A (āăąćĉċčďđēĕėęěĝğġģĥħĩīĭįıĳĵĺļľŀłńņňŉŋōŏőőœŕŗřśŝşšţťŧũūŭůűųŵŷźżžſ)
// Additional: ¿¡&/ for Spanish questions and common symbols
const safeStringRegex = /^[\w\s\-'".,?!():;¿¡&/\n\r\u00C0-\u017F]{1,500}$/u;
const safeLongRegex   = /^[\w\s\-'".,?!():;¿¡&/+\n\r[\]{}\u00C0-\u017F]{1,50000}$/u;

const testCases = [
  { name: "Spanish title", text: "Servicios Médicos Disponibles", shouldPass: true },
  { name: "Spanish content", text: "La clínica ofrece las siguientes especialidades: Medicina General, Pediatría, Ginecología y Obstetricia, Traumatología, Cardiología.", shouldPass: true },
  { name: "English title", text: "Medical Services Available", shouldPass: true },
  { name: "English content", text: "The clinic offers the following specialties: General Medicine, Pediatrics, Gynecology and Obstetrics.", shouldPass: true },
  { name: "Spanish question", text: "¿Cómo agendar una hora médica? - Guía completa", shouldPass: true },
  { name: "Mixed text", text: "Emergency / Emergencia: +56 2 2345 6700 (24/7)", shouldPass: true },
  { name: "Spanish with accents", text: "Atención médica de lunes a viernes. Últimos cupos disponibles.", shouldPass: true },
  { name: "English with punctuation", text: "Patient's guide: arrival, examination, treatment & follow-up.", shouldPass: true },
  { name: "Invalid chars (emoji)", text: "Medical services 🏥", shouldPass: false },
  { name: "Invalid chars (control)", text: "Text with \x00 control", shouldPass: false },
];

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  RAG_01 Validation Regex Test - Spanish & English           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = safeLongRegex.test(testCase.text);
  const success = result === testCase.shouldPass;
  
  if (success) {
    console.log(`✅ ${testCase.name}`);
    console.log(`   Text: "${testCase.text.substring(0, 60)}..."`);
    console.log(`   Expected: ${testCase.shouldPass ? 'PASS' : 'FAIL'}, Got: ${result ? 'PASS' : 'FAIL'}`);
    passed++;
  } else {
    console.log(`❌ ${testCase.name}`);
    console.log(`   Text: "${testCase.text.substring(0, 60)}..."`);
    console.log(`   Expected: ${testCase.shouldPass ? 'PASS' : 'FAIL'}, Got: ${result ? 'PASS' : 'FAIL'} ← MISMATCH`);
    failed++;
  }
  console.log('');
}

console.log('═'.repeat(64));
console.log(`\n📊 RESULTS: ${passed}/${testCases.length} passed\n`);

if (failed === 0) {
  console.log('🎉 All tests passed! Spanish and English characters are supported.\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Check the regex patterns.\n');
  process.exit(1);
}
