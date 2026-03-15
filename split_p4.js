const fs = require('fs');

// We have the original ID from list: ZgiDJcBT61v43NvN
// Let's download it exactly as n8n exported it
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
    const res = await axios.get('http://localhost:5678/api/v1/workflows/ZgiDJcBT61v43NvN', { headers });
    const wf = res.data;
    
    // Now we will ONLY overwrite the `jsCode` or specific logic, keeping the exact structure
    // This prevents "additional properties" errors from schema validation
    
    fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_CLEAN.json', JSON.stringify(wf, null, 2));
    console.log("Saved raw WF from server");
  } catch(e) {
    console.log("Error:", e.message);
  }
}
run();
