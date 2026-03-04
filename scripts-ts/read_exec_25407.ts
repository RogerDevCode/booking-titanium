import axios from 'axios';
import { N8N_HOST, HEADERS } from './test_config';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

async function main() {
  try {
    const res = await axios.get(`${N8N_HOST}/api/v1/executions/25407`, { headers: HEADERS });
    console.log(JSON.stringify(res.data, null, 2));
    // Cancel watchdog on success
    watchdog.cancel();
  } catch(e) {
    watchdog.cancel();
    console.error(e);
  }
}
main();
