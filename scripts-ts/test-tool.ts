import axios from 'axios';

async function test() {
  try {
    const res = await axios.post('https://n8n.stax.ink/api/v1/workflows/mJMUeVZSi55z8Bu9/execute', {
      chat_id: 11001
    }, {
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY || 'YOUR_API_KEY_HERE' }
    });
    console.log("Success:", JSON.stringify(res.data, null, 2));
  } catch(e) {
    console.error("Error:", e.response?.data || e.message);
  }
}
test();