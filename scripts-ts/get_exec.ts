import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const apiKey = process.env.N8N_API_KEY;
  const baseUrl = (process.env.N8N_URL || "https://n8n.stax.ink").replace(/\/$/, "") + "/api/v1";

  const client = axios.create({
    baseURL: baseUrl,
    headers: { "X-N8N-API-KEY": apiKey }
  });

  // SEED_Book_Tomorrow workflow ID from workflow_activation_order.json
  const workflowId = "HxMojMqbRiNgquvd";
  const r = await client.get(`/executions?workflowId=${workflowId}&limit=1`);
  if (!r.data.data || r.data.data.length === 0) {
    console.log("No executions found for SEED_Book_Tomorrow workflow");
    return;
  }
  const exec = r.data.data[0];
  
  const detail = await client.get(`/executions/${exec.id}?includeData=true`);
  console.log(JSON.stringify(detail.data, null, 2));
}
main().catch(console.error);
