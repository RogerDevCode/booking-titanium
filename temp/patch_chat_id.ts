import fs from 'fs';

const file = 'workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

const validateInput = wf.nodes.find((n: any) => n.name === 'Validate Input');
if (validateInput) {
  validateInput.parameters.jsCode = validateInput.parameters.jsCode.replace(
    /let chat_id = null;\nif \(input\.chat_id !== undefined && input\.chat_id !== null\) \{/,
    `let chat_id = null;\nif (input.chat_id === undefined || input.chat_id === null) return ve('MISSING_FIELD', 'chat_id is required');\nif (true) {`
  );
}

fs.writeFileSync(file, JSON.stringify(wf, null, 2));
console.log("Updated Validate Input.");
