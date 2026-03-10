import axios from 'axios';

/**
 * AUDIT LOG TEST
 * 1. Create a booking.
 * 2. Update status to CHECKED_IN.
 * 3. Update status to COMPLETED.
 * 4. Fetch audit logs for this booking and verify the history.
 */

async function runAuditTest() {
    const DAL_BASE_URL = 'http://localhost:3000';
    const chat_id = 444555666;
    const provider_id = 1;
    const service_id = 1;
    const start_time = '2026-11-10T14:00:00Z';

    console.log('📜 Starting Audit Log System Test...');

    try {
        // 1. Create booking
        console.log('📅 Step 1: Creating booking...');
        const res1 = await axios.post(`${DAL_BASE_URL}/create-booking`, {
            chat_id, provider_id, service_id, start_time,
            user_name: 'Audit Tester', user_email: 'audit@test.com'
        });
        const booking_id = res1.data.data.booking_id;
        console.log(`  ✅ SUCCESS: Booking ${booking_id} created.\n`);

        // 2. Update status
        console.log('🛂 Step 2: Updating status to CHECKED_IN...');
        await axios.post(`${DAL_BASE_URL}/update-booking-status`, {
            booking_id, status: 'CHECKED_IN', actor_id: 'admin_01', reason: 'Patient arrived'
        });

        // 3. Update status again
        console.log('🏁 Step 3: Updating status to COMPLETED...');
        await axios.post(`${DAL_BASE_URL}/update-booking-status`, {
            booking_id, status: 'COMPLETED', actor_id: 'doctor_01', reason: 'Treatment finished'
        });

        // 4. Verify Audit Logs
        console.log('🧐 Step 4: Verifying Audit Logs...');
        const res4 = await axios.get(`${DAL_BASE_URL}/audit-logs/booking/${booking_id}`);
        const logs = res4.data.data;

        console.log(`  🔍 Found ${logs.length} audit entries:`);
        logs.forEach((log: any, i: number) => {
            console.log(`    [${i}] Action: ${log.action} | Actor: ${log.actor_id} | Date: ${log.created_at}`);
        });

        if (logs.length >= 3) {
            console.log('\n  ✅ SUCCESS: Audit history is complete.\n');
        } else {
            throw new Error(`Audit logs incomplete. Expected at least 3, found ${logs.length}`);
        }

        console.log('🏆 ALL AUDIT LOG TESTS PASSED! 🏆');

    } catch (err: any) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
        if (err.response) console.error('Response:', err.response.data);
    }
}

runAuditTest().catch(console.error);
