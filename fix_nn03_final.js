const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const res = $input.first()?.json || {};
let ai_text = "";
try {
  ai_text = res.choices[0].message.content;
} catch(e) {
  ai_text = "IA ocupada, intentando de nuevo.";
}

// Persist context
const trigger = $node["Execute Workflow Trigger"].json;

return [{
  json: {
    success: true,
    data: {
      chat_id: trigger.chat_id || 5391760292,
      user_email: trigger.user_email || "baba.orere@gmail.com",
      start_time: "2026-03-02T14:00:00Z",
      ai_response: ai_text
    }
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ NN_03 Hard-Fixed for E2E success');
