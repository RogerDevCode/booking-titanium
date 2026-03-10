import axios from 'axios';

/**
 * USER IDENTITY & PERSISTENCE TEST
 * 1. GET /user/:chat_id (New user) -> registered: false
 * 2. POST /update-user (Register) -> success: true
 * 3. GET /user/:chat_id (Known user) -> registered: true, data match
 * 4. POST /update-user (Update) -> success: true
 * 5. GET /user/:chat_id (Check update) -> data match updated
 */

async function runUserTest() {
    const DAL_BASE_URL = 'http://localhost:3000';
    const chat_id = 999000111; // ID de test único
    const initial_name = 'Usuario de Prueba';
    const initial_email = 'test@example.com';
    const updated_name = 'Usuario Actualizado';
    const updated_email = 'updated@example.com';

    console.log('👤 Starting User Identity & Persistence Test...');
    console.log(`Target chat_id: ${chat_id}\n`);

    try {
        // 1. Check new user
        console.log('🔍 Step 1: Checking for new user...');
        const res1 = await axios.get(`${DAL_BASE_URL}/user/${chat_id}`);
        if (!res1.data.registered) {
            console.log('  ✅ SUCCESS: User is correctly identified as NOT registered.\n');
        } else {
            console.log('  ❌ FAILURE: User already exists. Cleanup manually before test.\n');
            // return;
        }

        // 2. Register user
        console.log('📝 Step 2: Registering user...');
        const res2 = await axios.post(`${DAL_BASE_URL}/update-user`, {
            chat_id,
            full_name: initial_name,
            email: initial_email
        });
        if (res2.data.success && res2.data.data.full_name === initial_name) {
            console.log('  ✅ SUCCESS: User registered.\n');
        } else {
            throw new Error('Failed to register user');
        }

        // 3. Verify identity
        console.log('🆔 Step 3: Verifying identity...');
        const res3 = await axios.get(`${DAL_BASE_URL}/user/${chat_id}`);
        if (res3.data.registered && res3.data.data.full_name === initial_name) {
            console.log(`  ✅ SUCCESS: Identity recognized as "${res3.data.data.full_name}".\n`);
        } else {
            throw new Error('Identity not recognized correctly');
        }

        // 4. Update profile
        console.log('🔄 Step 4: Updating user profile...');
        const res4 = await axios.post(`${DAL_BASE_URL}/update-user`, {
            chat_id,
            full_name: updated_name,
            email: updated_email
        });
        if (res4.data.success && res4.data.data.full_name === updated_name) {
            console.log('  ✅ SUCCESS: Profile updated.\n');
        } else {
            throw new Error('Failed to update profile');
        }

        // 5. Final check
        console.log('🧐 Step 5: Final verification...');
        const res5 = await axios.get(`${DAL_BASE_URL}/user/${chat_id}`);
        if (res5.data.registered && res5.data.data.full_name === updated_name && res5.data.data.email === updated_email) {
            console.log(`  ✅ SUCCESS: Final data is correct: ${res5.data.data.full_name} (${res5.data.data.email}).\n`);
        } else {
            throw new Error('Final data check failed');
        }

        console.log('🏆 ALL USER IDENTITY TESTS PASSED! 🏆');

    } catch (err: any) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
        if (err.response) console.error('Response:', err.response.data);
    }
}

runUserTest().catch(console.error);
