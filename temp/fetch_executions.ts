import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const apiKey = process.env.N8N_API_KEY || process.env.X_N8N_API_KEY;
    console.log("Fetching executions via API...");
    const res = await fetch("https://n8n.stax.ink/api/v1/executions?limit=5", {
        headers: {
            "X-N8N-API-KEY": apiKey
        }
    });
    if (!res.ok) {
        console.error("Failed:", res.status, res.statusText, await res.text());
        return;
    }
    const data = await res.json();
    console.log(JSON.stringify(data.data.map(e => ({
        id: e.id,
        status: e.status,
        workflowId: e.workflowId,
        startedAt: e.startedAt,
        stoppedAt: e.stoppedAt,
        waitTill: e.waitTill
    })), null, 2));
}
main().catch(console.error);
