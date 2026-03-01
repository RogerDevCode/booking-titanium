const fs = require('fs');
const filePath = process.argv[2];
if (!filePath) process.exit(1);

let content = fs.readFileSync(filePath, 'utf8');

const portsBlock = `    ports:
      - "3000:3000"`;

if (!content.includes('3000:3000')) {
    content = content.replace(/container_name: booking_dal/, "container_name: booking_dal\n" + portsBlock);
    fs.writeFileSync(filePath, content);
    console.log('✅ Puerto 3000 mapeado.');
} else {
    console.log('⚠️ Ya mapeado.');
}
