const fs = require('fs');
const path = require('path');

// Ruta proporcionada por el usuario (Source of Truth)
const basePath = "/home/manager/Sync/N8N Projects/booking-titanium/node_modules/n8n-core/node_modules/";
const nodesBaseDir = path.join(basePath, "n8n-nodes-base/dist/nodes");

if (!fs.existsSync(nodesBaseDir)) {
    console.error(`ERROR: No se encontró el directorio de nodos en: ${nodesBaseDir}`);
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
            
            // Regex de alta precisión para extraer metadatos del binario compilado
            const versionMatch = content.match(/currentVersion:\s*([\d.]+)/);
            const versionsArrayMatch = content.match(/versions:\s*\[([\d.,\s]+)\]/);
            const nameMatch = content.match(/name:\s*["\']([^"\']+)["\']/);
            const displayNameMatch = content.match(/displayName:\s*["\']([^"\']+)["\']/);

            if (nameMatch) {
                const technicalName = nameMatch[1];
                if (!manifest[technicalName]) {
                    manifest[technicalName] = {
                        technicalName,
                        displayName: displayNameMatch ? displayNameMatch[1] : technicalName,
                        latestVersion: versionMatch ? parseFloat(versionMatch[1]) : 1,
                        supportedVersions: versionsArrayMatch 
                            ? versionsArrayMatch[1].split(",").map(v => parseFloat(v.trim()))
                            : [versionMatch ? parseFloat(versionMatch[1]) : 1]
                    };
                }
            }
        }
    }
}

console.log("Iniciando escaneo de nodos n8n v2.10.2...");
scanDir(nodesBaseDir);
const output = JSON.stringify(manifest, null, 2);
fs.writeFileSync("n8n_precision_manifest.json", output);
console.log(`Éxito: Se han mapeado ${Object.keys(manifest).length} tipos de nodos.`);
console.log("Resultados guardados en: n8n_precision_manifest.json");
