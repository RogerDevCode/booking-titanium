#!/bin/bash
docker exec -i n8n_titanium node <<'EOF' > n8n_nodes_manifest_complete.json
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const manifest = {};

function scanPackage(packagePath, packageName) {
    if (!fs.existsSync(packagePath)) return;
    try {
        const files = execSync(`find ${packagePath} -type f \\( -name "*.node.json" -o -name "*.node.js" \\)`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().split("\n").filter(f => f);
        files.forEach(filePath => {
            try {
                let content;
                let isJson = filePath.endsWith(".json");
                if (isJson) {
                    content = JSON.parse(fs.readFileSync(filePath, "utf8"));
                } else {
                    const fileStr = fs.readFileSync(filePath, "utf8");
                    const versionMatch = fileStr.match(/version:\s*([\s\S]*?)(,|;\n)/);
                    const nameMatch = fileStr.match(/name:\s*['"](.*?)['"]/);
                    if (!versionMatch || !nameMatch) return;
                    let versions = [];
                    const versionRaw = versionMatch[1].trim();
                    if (versionRaw.includes("[")) {
                        const nums = versionRaw.match(/\d+(\.\d+)?/g);
                        if (nums) versions = nums.map(Number);
                    } else {
                        const num = versionRaw.match(/\d+(\.\d+)?/);
                        if (num) versions = [Number(num[0])];
                    }
                    content = { name: nameMatch[1], version: versions.length > 0 ? versions : undefined };
                }
                const technicalName = content.name;
                if (!technicalName) return;
                const fullNodeName = packageName + "." + technicalName;
                if (!manifest[fullNodeName]) {
                    manifest[fullNodeName] = { displayName: content.displayName || technicalName, versions: [], defaultVersion: content.defaultVersion || null };
                }
                let supportedVersions = [];
                if (Array.isArray(content.version)) supportedVersions = content.version;
                else if (typeof content.version === "number") supportedVersions = [content.version];
                else if (content.version === undefined && isJson) supportedVersions = [1];
                supportedVersions.forEach(v => { if (v && !manifest[fullNodeName].versions.includes(v)) manifest[fullNodeName].versions.push(v); });
                if (content.defaultVersion) manifest[fullNodeName].defaultVersion = content.defaultVersion;
                manifest[fullNodeName].versions.sort((a, b) => a - b);
            } catch (e) {}
        });
    } catch (err) {}
}
const n8nRoot = "/usr/local/lib/node_modules/n8n/node_modules";
scanPackage(path.join(n8nRoot, "n8n-nodes-base/dist/nodes"), "n8n-nodes-base");
scanPackage(path.join(n8nRoot, "@n8n/n8n-nodes-langchain/dist/nodes"), "@n8n/n8n-nodes-langchain");
scanPackage("/usr/local/lib/node_modules/n8n-nodes-base/dist/nodes", "n8n-nodes-base");
console.log(JSON.stringify(manifest, null, 2));
EOF
