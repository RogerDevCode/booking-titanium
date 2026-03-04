const fs = require('fs');
const path = require('path');

// Localización dinámica basada en tu estructura de directorios
const projectRoot = "/home/manager/Sync/N8N Projects/booking-titanium";
const possibleNodesPath = path.join(projectRoot, "node_modules/n8n-nodes-base/dist/nodes");

if (!fs.existsSync(possibleNodesPath)) {
    console.error("CRITICAL_ERROR: No se encontró n8n-nodes-base en: " + possibleNodesPath);
    process.exit(1);
}

const manifest = {};

function scanDir(dir) {
    const items = fs.readdirSync(dir);
    for (let item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else if (item.endsWith(".node.js")) {
            const content = fs.readFileSync(fullPath, "utf8");
            
            // Inspección de "firmware": Extraemos versiones del código compilado
            const versionMatch = content.match(/currentVersion:\s*([\d.]+)/);
            const versionsArrayMatch = content.match(/versions:\s*\[([\d.,\s]+)\]/);
            const nameMatch = content.match(/name:\s*["\']([^"\']+)["\']/);

            if (nameMatch) {
                const techName = nameMatch[1];
                if (!manifest[techName]) {
                    manifest[techName] = {
                        technicalName: techName,
                        latest: versionMatch ? parseFloat(versionMatch[1]) : 1,
                        supported: versionsArrayMatch 
                            ? versionsArrayMatch[1].split(",").map(v => parseFloat(v.trim()))
                            : [versionMatch ? parseFloat(versionMatch[1]) : 1]
                    };
                }
            }
        }
    }
}

console.log("Escaneando Source of Truth en: " + possibleNodesPath);
scanDir(possibleNodesPath);
fs.writeFileSync("n8n_discovery_2.10.2.json", JSON.stringify(manifest, null, 2));
console.log("ÉXITO: Manifiesto generado con " + Object.keys(manifest).length + " nodos.");
