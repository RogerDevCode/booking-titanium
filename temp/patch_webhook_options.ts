import fs from 'fs';

const file = 'workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

const webhook = wf.nodes.find((n: any) => n.name === 'Webhook');
if (webhook) {
  webhook.parameters.options = {
    ...webhook.parameters.options,
    responseNode: "Respond to Webhook"
  };
}

fs.writeFileSync(file, JSON.stringify(wf, null, 2));
