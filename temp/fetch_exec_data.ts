import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const apiKey = process.env.N8N_API_KEY || process.env.X_N8N_API_KEY;
    console.log("Fetching execution 25328...");
    const res = await fetch("https://n8n.stax.ink/api/v1/executions/25328?includeData=true", {
        headers: { "X-N8N-API-KEY": apiKey }
    });
    const data = await res.json();
    console.log(JSON.stringify(data.data.resultData.runData, null, 2));
}
main().catch(console.error);
