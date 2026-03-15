const fs = require('fs');

const file = 'workflows/seed_clean/WF2_Booking_Orchestrator.json';
let text = fs.readFileSync(file, 'utf8');

// There's a bad control character at position 863 (line 35).
// Let's print out lines around line 35 to see what's wrong.
const lines = text.split('\n');
for (let i = 25; i < 45; i++) {
  if (lines[i]) console.log(`${i+1}: ${lines[i]}`);
}
