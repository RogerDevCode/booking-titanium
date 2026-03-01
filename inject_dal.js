const fs = require('fs');

const filePath = process.argv[2];
if (!filePath) {
    console.error('Falta la ruta del archivo');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

const dalServiceBlock = `
  # ============================================================================
  # DAL SERVICE (PROXY DE DATOS PARA BOOKING-TITANIUM)
  # ============================================================================
  dal-service:
    container_name: booking_dal
    build:
      context: /home/manager/Sync/N8N Projects/booking-titanium
      dockerfile: Dockerfile.dal
    restart: unless-stopped
    env_file:
      - /home/manager/Sync/docker-compose/n8n-titanium/.env
    networks:
      - n8n-network
`;

if (content.includes('dal-service:')) {
    console.log('⚠️ El servicio dal-service ya existe.');
} else {
    // Buscamos la línea que empieza exactamente con "networks:" (al final del archivo usualmente)
    const networksMatch = content.match(/^networks:/m);
    if (networksMatch) {
        content = content.replace(/^networks:/m, dalServiceBlock + '\nnetworks:');
        fs.writeFileSync(filePath, content);
        console.log('✅ dal-service inyectado con éxito.');
    } else {
        // Si no hay networks, simplemente añadimos al final
        fs.appendFileSync(filePath, dalServiceBlock);
        console.log('✅ dal-service añadido al final del archivo.');
    }
}
