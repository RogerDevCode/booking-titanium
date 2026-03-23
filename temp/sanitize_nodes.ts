import fs from 'fs';

const filePath = 'workflows/DB_Create_Booking.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// Standard n8n node properties
const ALLOWED_ROOT = ['id', 'name', 'parameters', 'position', 'type', 'typeVersion', 'webhookId', 'credentials', 'onError', 'alwaysOutputData'];

for (let i = 0; i < data.nodes.length; i++) {
  const node = data.nodes[i];
  
  // Remove empty typeOptions
  if (node.typeOptions && Object.keys(node.typeOptions).length === 0) {
    delete node.typeOptions;
  }
  
  // Remove non-standard root properties
  Object.keys(node).forEach(key => {
    if (!ALLOWED_ROOT.includes(key)) {
      console.log(`Node ${i} (${node.name}): Removing property '${key}'`);
      delete node[key];
    }
  });

  // Special case: n8n Code nodes might not like alwaysOutputData at root? 
  // Let's remove it if it's not a DB node
  if (node.alwaysOutputData && !node.type.includes('postgres')) {
     delete node.alwaysOutputData;
  }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
