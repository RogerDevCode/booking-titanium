const fs = require('fs');

const file = 'workflows/seed_clean/WF2_Booking_Orchestrator.json';
let text = fs.readFileSync(file, 'utf8');

// Use standard JSON stringify to fix escaping in jsCode parameters
const lines = text.split('\n');

// We have syntax errors at lines with \n instead of \\n
// The easiest way is to let node reconstruct the JSON properly using standard API.
// Wait, the file is currently invalid JSON so JSON.parse won't work.
// Let's download the original ID 331l1dm2pmFsSWBF from the API, we can use that as a base!

const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

let apiKey = '';
const envContent = fs.readFileSync('.env', 'utf8');
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '');
    break;
  }
}

async function run() {
  try {
    const headers = { 'X-N8N-API-KEY': apiKey };
    const res = await axios.get('http://localhost:5678/api/v1/workflows/331l1dm2pmFsSWBF', { headers });
    const wf = res.data;
    
    // We will just save this valid version as a starting point.
    fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_FIXED.json', JSON.stringify(wf, null, 2));
    console.log("Saved valid WF from server to WF2_Booking_Orchestrator_FIXED.json");
  } catch(e) {
    console.log("Error:", e.message);
  }
}
run();
