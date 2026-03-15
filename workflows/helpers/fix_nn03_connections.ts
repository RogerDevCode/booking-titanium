import * as fs from 'fs';
const p = 'workflows/NN_03-B_Pipeline_Agent.json';
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

const g8b = "Groq Model (8B)";
const g70b = "Groq Model (70B)";

data.connections[g8b] = {
  "ai_languageModel": [
    [
      { "node": "Intent Classifier LLM", "type": "ai_languageModel", "index": 0 },
      { "node": "Extract Params: create_booking", "type": "ai_languageModel", "index": 0 },
      { "node": "Extract Params: cancel_booking", "type": "ai_languageModel", "index": 0 },
      { "node": "Extract Params: check_availability", "type": "ai_languageModel", "index": 0 },
      { "node": "Extract Params: find_next", "type": "ai_languageModel", "index": 0 },
      { "node": "Extract Params: get_services", "type": "ai_languageModel", "index": 0 }
    ]
  ]
};

data.connections[g70b] = {
  "ai_languageModel": [
    [
      { "node": "Response Gen: create_booking", "type": "ai_languageModel", "index": 0 },
      { "node": "Response Gen: cancel_booking", "type": "ai_languageModel", "index": 0 },
      { "node": "Response Gen: check_availability", "type": "ai_languageModel", "index": 0 },
      { "node": "Response Gen: find_next", "type": "ai_languageModel", "index": 0 },
      { "node": "Response Gen: get_services", "type": "ai_languageModel", "index": 0 },
      { "node": "Fallback Response LLM", "type": "ai_languageModel", "index": 0 },
      { "node": "Response Gen: general_chat", "type": "ai_languageModel", "index": 0 }
    ]
  ]
};

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('Fixed AI model connections in NN_03-B (including get_services)');
