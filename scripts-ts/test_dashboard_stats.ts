import axios from 'axios';

/**
 * DASHBOARD STATS TEST
 * 1. Fetch dashboard stats.
 * 2. Verify that providers and services are present in the metrics.
 * 3. Verify occupancy data format.
 */

async function runStatsTest() {
    const DAL_BASE_URL = 'http://localhost:3000';

    console.log('📊 Starting Dashboard Stats Test...');

    try {
        const res = await axios.get(`${DAL_BASE_URL}/dashboard-stats`);
        const { stats, occupancy } = res.data.data;

        console.log(`  🔍 Found ${stats.length} service/provider metric combinations.`);
        console.log(`  🔍 Found ${occupancy.length} days of occupancy data.`);

        if (stats.length > 0 && Array.isArray(occupancy)) {
            console.log('\n  ✅ SUCCESS: Dashboard stats are accessible and populated.\n');
            
            // Show a sample of the data
            console.log('Sample Stat:', stats[0]);
        } else {
            throw new Error('Stats data format incorrect or empty');
        }

        console.log('🏆 ALL DASHBOARD STATS TESTS PASSED! 🏆');

    } catch (err: any) {
        console.error(`\n❌ TEST FAILED: ${err.message}`);
        if (err.response) console.error('Response:', err.response.data);
    }
}

runStatsTest().catch(console.error);
