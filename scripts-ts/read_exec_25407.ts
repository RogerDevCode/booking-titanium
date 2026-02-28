import axios from 'axios';
import { N8N_HOST, HEADERS } from './test_config';

async function main() {
  try {
    const res = await axios.get(`${N8N_HOST}/api/v1/executions/25407`, { headers: HEADERS });
    console.log(JSON.stringify(res.data, null, 2));
  } catch(e) { console.error(e); }
}
main();
