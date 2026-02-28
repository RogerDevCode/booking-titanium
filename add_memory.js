const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Add Memory Node
const memoryNode = {
  "parameters": {},
  "id": "memory_node",
  "name": "Window Buffer Memory",
  "type": "@n8n/n8n-nodes-langchain.memoryWindowBuffer",
  "typeVersion": 1,
  "position": [
    1100,
    500
  ]
};

data.nodes.push(memoryNode);

// Connect Memory to Agent
if (!data.connections["Window Buffer Memory"]) {
  data.connections["Window Buffer Memory"] = {
    "ai_memory": [
      [
        {
          "node": "AI Agent",
          "type": "ai_memory",
          "index": 0
        }
      ]
    ]
  };
}

// Update Agent node to use defined prompt correctly
data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.parameters.agent = "conversationalVariablesAgent";
    node.parameters.promptType = 'define';
    node.parameters.text = '={{ $json.text }}';
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
