import axios from 'axios';

/**
 * USER COLLISION TEST
 * 1. Book Doctor A at 10:00 AM for User 1. (Success)
 * 2. Book Doctor B at 10:00 AM for User 1. (Failure: USER_COLLISION)
 * 3. Book Doctor B at 11:30 AM for User 1. (Success: No overlap)
 */

async function runCollisionTest() {
    const DAL_BASE_URL = 'http://localhost:3000';
    const chat_id = 777666555;
    const time_slot = '2026-09-20T10:00:00Z';
    const clean_slot = '2026-09-20T12:00:00Z';

    console.log('⚔️ Starting User Collision Test...');

    try {
        // 1. First booking
        console.log('👨‍⚕️ Step 1: Booking Doctor 1 at 10:00 AM...');
        const res1 = await axios.post(`${DAL_BASE_URL}/create-booking`, {
            chat_id,
            provider_id: 1,
            service_id: 1,
            start_time: time_slot,
            user_name: 'Collision Tester',
            user_email: 'collision@test.com'
        });
        if (res1.data.success) {
            console.log('  ✅ SUCCESS: First booking created.\n');
        } else {
            throw new Error(`Failed first booking: ${res1.data.error_message}`);
        }

        // 2. Second booking (Same time, different doctor)
        console.log('👨‍⚕️ Step 2: Attempting to book Doctor 2 at THE SAME TIME (10:00 AM)...');
        const res2 = await axios.post(`${DAL_BASE_URL}/create-booking`, {
            chat_id,
            provider_id: 2, // Different doctor
            service_id: 1,
            start_time: time_slot,
            user_name: 'Collision Tester',
            user_email: 'collision@test.com'
        });

        if (!res2.data.success && res2.data.error_code === 'USER_COLLISION') {
            console.log('  ✅ SUCCESS: System correctly blocked user collision.\n');
        } else if (res2.data.success) {
            throw new Error('FAILURE: System allowed overlapping bookings for the same user!');
        } else {
            throw new Error(`Unexpected error: ${res2.data.error_message}`);
        }

        // 3. Third booking (Different time)
        console.log('👨‍⚕️ Step 3: Booking Doctor 2 at 12:00 PM (No overlap)...');
        const res3 = await axios.post(`${DAL_BASE_URL}/create-booking`, {
            chat_id,
            provider_id: 2,
            service_id: 1,
            start_time: clean_slot,
            user_name: 'Collision Tester',
            user_email: 'collision@test.com'
        });

        if (res3.data.success) {
            console.log('  ✅ SUCCESS: Second non-overlapping booking created.\n');
        } else {
            throw new Error(`Failed third booking: ${res3.data.error_message}`);
        }

        console.log('🏆 ALL USER COLLISION TESTS PASSED! 🏆');

    } catch (err: any) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
        if (err.response) console.error('Response:', err.response.data);
    }
}

runCollisionTest().catch(console.error);
