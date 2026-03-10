import axios from 'axios';

/**
 * WAITLIST SYSTEM TEST
 * 1. Create a booking (to occupy a slot).
 * 2. Join waitlist for that same date/provider.
 * 3. Fetch candidates for that booking (simulating a cancellation).
 */

async function runWaitlistTest() {
    const DAL_BASE_URL = 'http://localhost:3000';
    const chat_id_booked = 888777666;
    const chat_id_waitlist = 555444333;
    const provider_id = 1;
    const service_id = 1;
    const start_time = '2026-12-05T10:00:00Z';
    const date = '2026-12-05';

    console.log('⏳ Starting Waitlist System Test...');

    try {
        // 1. Create booking to occupy the slot
        console.log('📅 Step 1: Occupying slot with a booking...');
        const res1 = await axios.post(`${DAL_BASE_URL}/create-booking`, {
            chat_id: chat_id_booked, provider_id, service_id, start_time,
            user_name: 'Occupier', user_email: 'occupier@test.com'
        });
        const booking_id = res1.data.data.booking_id;
        console.log(`  ✅ SUCCESS: Slot occupied (Booking ${booking_id}).\n`);

        // 1.5 Register user for waitlist
        console.log('👤 Step 1.5: Registering waitlist user...');
        await axios.post(`${DAL_BASE_URL}/update-user`, {
            chat_id: chat_id_waitlist,
            full_name: 'Waitlist Candidate',
            email: 'waitlist@test.com'
        });

        // 2. Join waitlist
        console.log('📝 Step 2: Joining waitlist for the same provider and date...');
        const res2 = await axios.post(`${DAL_BASE_URL}/waitlist/join`, {
            chat_id: chat_id_waitlist, provider_id, service_id, preferred_date: date
        });
        if (res2.data.success) {
            console.log('  ✅ SUCCESS: User joined waitlist.\n');
        } else {
            throw new Error(`Failed to join waitlist: ${res2.data.error_message}`);
        }

        // 3. Find candidates (Simulate cancellation logic)
        console.log('🔍 Step 3: Finding waitlist candidates for the occupied slot...');
        const res3 = await axios.get(`${DAL_BASE_URL}/waitlist/candidates/${booking_id}`);
        const candidates = res3.data.data;

        console.log(`  🔍 Found ${candidates.length} candidate(s):`);
        candidates.forEach((c: any) => console.log(`    - ${c.full_name} (ID: ${c.user_id})`));

        if (candidates.some((c: any) => String(c.user_id) === String(chat_id_waitlist))) {
            console.log('\n  ✅ SUCCESS: Waitlist candidate correctly identified.\n');
        } else {
            throw new Error('Waitlist candidate not found in results');
        }

        console.log('🏆 ALL WAITLIST TESTS PASSED! 🏆');

    } catch (err: any) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
        if (err.response) console.error('Response:', err.response.data);
    }
}

runWaitlistTest().catch(console.error);
