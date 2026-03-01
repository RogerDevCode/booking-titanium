const fs = require('fs');
const dbUrl = process.argv[2];
const filePath = process.argv[3];

if (!dbUrl || !filePath) {
    console.error('Argumentos faltantes');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

const envBlock = `    environment:
      - DATABASE_URL=${dbUrl}`;

if (content.includes('DATABASE_URL=')) {
    console.log('⚠️ DATABASE_URL ya existe en el archivo.');
} else {
    // Insertamos después de container_name: booking_dal
    content = content.replace(/container_name: booking_dal/, "container_name: booking_dal\n" + envBlock);
    fs.writeFileSync(filePath, content);
    console.log('✅ DATABASE_URL inyectada con éxito.');
}
