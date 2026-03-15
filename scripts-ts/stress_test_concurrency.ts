import axios from 'axios';

/**
 * CONCURRENCY STRESS TEST
 * Purpose: Attempt to book the SAME slot simultaneously 10 times.
 * Expected Result: Exactly 1 Success, 9 Failures (SLOT_OCCUPIED).
 */

async function runStressTest() {
    const DAL_URL = 'http://localhost:3000/create-booking';
    const provider_id = 1;
    const service_id = 1;
    const start_time = '2026-07-20T11:00:00Z'; // Un horario futuro fijo para el test

    console.log('🚀 Starting Concurrency Stress Test...');
    console.log(`Target: Provider ${provider_id} at ${start_time}`);

    const requests = Array.from({ length: 10 }, (_, i) => {
        return axios.post(DAL_URL, {
            chat_id: 5000 + i, // Diferentes usuarios
            provider_id,
            service_id,
            start_time,
            user_name: `Tester ${i}`,
            user_email: `test${i}@example.com`
        }).catch(err => err.response);
    });

    console.log('📡 Sending 10 simultaneous requests...');
    const responses = await Promise.all(requests);

    let successes = 0;
    let slotOccupiedErrors = 0;
    let otherErrors = 0;

    responses.forEach((res, i) => {
        const data = res.data;
        if (data.success) {
            successes++;
            console.log(`  [${i}] ✅ SUCCESS: Booking ${data.data.booking_code}`);
        } else if (data.error_code === 'SLOT_OCCUPIED') {
            slotOccupiedErrors++;
            console.log(`  [${i}] ❌ REJECTED: Slot Occupied (Correct)`);
        } else {
            otherErrors++;
            console.log(`  [${i}] ⚠️ ERROR: ${data.error_message || 'Unknown'}`);
        }
    });

    console.log('\n' + '='.repeat(40));
    console.log('📊 RESULTS SUMMARY:');
    console.log(`  - Total Requests: 10`);
    console.log(`  - Successes:      ${successes} (Should be 1)`);
    console.log(`  - Occupied Err:   ${slotOccupiedErrors} (Should be 9)`);
    console.log(`  - Other Errors:   ${otherErrors}`);
    console.log('='.repeat(40));

    if (successes === 1 && slotOccupiedErrors === 9) {
        console.log('\n🏆 TEST PASSED: Advisory Locks are preventing double-booking! 🏆');
    } else {
        console.log('\n🔥 TEST FAILED: Race condition detected or database error. 🔥');
    }
}

runStressTest().catch(console.error);
