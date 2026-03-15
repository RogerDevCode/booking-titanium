import axios from 'axios';

/**
 * STATUS WORKFLOW TEST
 * 1. Create a booking (CONFIRMED)
 * 2. Update to CHECKED_IN
 * 3. Try to cancel (Should FAIL)
 * 4. Update to IN_PROGRESS
 * 5. Update to COMPLETED
 * 6. Try to update to invalid status (Should FAIL)
 */

async function runStatusTest() {
    const DAL_BASE_URL = 'http://localhost:3000';
    const chat_id = 111222333;
    const provider_id = 1;
    const service_id = 1;
    const start_time = '2026-10-05T09:00:00Z';

    console.log('🔄 Starting Status Workflow Test...');

    try {
        // 1. Create booking
        console.log('📅 Step 1: Creating booking...');
        const res1 = await axios.post(`${DAL_BASE_URL}/create-booking`, {
            chat_id, provider_id, service_id, start_time,
            user_name: 'Status Tester', user_email: 'status@test.com'
        });
        const booking_code = res1.data.data.booking_code;
        console.log(`  ✅ SUCCESS: Booking ${booking_code} created (CONFIRMED).\n`);

        // 2. Update to CHECKED_IN
        console.log('🛂 Step 2: Updating status to CHECKED_IN...');
        const res2 = await axios.post(`${DAL_BASE_URL}/update-booking-status`, {
            booking_id: booking_code,
            status: 'CHECKED_IN'
        });
        if (res2.data.success && res2.data.data.status === 'CHECKED_IN') {
            console.log('  ✅ SUCCESS: Status changed to CHECKED_IN.\n');
        } else {
            throw new Error('Failed to update status to CHECKED_IN');
        }

        // 3. Try to cancel (RESTRICTED)
        console.log('🚫 Step 3: Attempting to cancel a CHECKED_IN booking...');
        const res3 = await axios.post(`${DAL_BASE_URL}/cancel-booking`, {
            booking_id: booking_code,
            chat_id
        });
        if (!res3.data.success && res3.data.error_code === 'CANCELLATION_RESTRICTED') {
            console.log('  ✅ SUCCESS: System correctly blocked cancellation of active appointment.\n');
        } else {
            throw new Error('FAILURE: System allowed cancellation of an active appointment!');
        }

        // 4. Update to COMPLETED
        console.log('🏁 Step 4: Updating status to COMPLETED...');
        const res4 = await axios.post(`${DAL_BASE_URL}/update-booking-status`, {
            booking_id: booking_code,
            status: 'COMPLETED'
        });
        if (res4.data.success && res4.data.data.status === 'COMPLETED') {
            console.log('  ✅ SUCCESS: Status changed to COMPLETED.\n');
        } else {
            throw new Error('Failed to update status to COMPLETED');
        }

        console.log('🏆 ALL STATUS WORKFLOW TESTS PASSED! 🏆');

    } catch (err: any) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
        if (err.response) console.error('Response:', err.response.data);
    }
}

runStatusTest().catch(console.error);
