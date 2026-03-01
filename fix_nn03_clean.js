const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const res = $input.first()?.json || {};
let ai_data = {};
try { 
  ai_data = JSON.parse(res.choices[0].message.content); 
} catch(e) { 
  ai_data = { response: res.choices[0].message.content }; 
}

const trigger = $node["Execute Workflow Trigger"].json;
return [{
  json: {
    success: true,
    data: {
      intent: ai_data.intent || "CREATE",
      chat_id: trigger.chat_id,
      user_email: ai_data.email,
      booking_id: ai_data.booking_id,
      start_time: (ai_data.date && ai_data.time) ? (ai_data.date + "T" + ai_data.time + ":00Z") : null,
      ai_response: ai_data.response
    }
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ NN_03 IA Actualizada');
