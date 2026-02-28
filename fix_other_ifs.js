const fs = require('fs');
const path = require('path');

const files = ['workflows/NN_03_AI_Agent.json', 'workflows/NN_04_Telegram_Sender.json'];

files.forEach(filePath => {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  data.nodes.forEach(node => {
    if (node.type === 'n8n-nodes-base.if' && node.typeVersion === 2) {
      if (node.parameters && node.parameters.conditions && node.parameters.conditions.conditions) {
        
        // Add typeValidation: "strict" to options if it exists
        if (node.parameters.conditions.options) {
            delete node.parameters.conditions.options.caseSensitive;
            delete node.parameters.conditions.options.leftValue;
            delete node.parameters.conditions.options.rightValue;
            node.parameters.conditions.options.typeValidation = "strict";
        } else {
            node.parameters.conditions.options = { typeValidation: "strict" };
        }

        // Fix the operator to be the object required by v2
        node.parameters.conditions.conditions.forEach(cond => {
          if (typeof cond.operator === 'string' && cond.operator === 'equals') {
            cond.operator = {
              type: "boolean",
              operation: "true",
              singleValue: true
            };
            // The v2 schema often doesn't use the 'type' field outside the operator object
            delete cond.type; 
          }
        });
      }
    }
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log('Fixed IF nodes in', filePath);
});
