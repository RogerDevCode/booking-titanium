import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WEBHOOK_BASE = process.env.WEBHOOK_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
// Append the webhook path for the specific workflow (for manual testing via webhook)
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook/nn-01-booking-gateway-v3`;

// Helper to generate a simulated Telegram message payload
const createTelegramPayload = (text: string = "I want to book a room for tomorrow") => {
    return {
        update_id: 123456789,
        message: {
            message_id: 1,
            from: {
                id: 12345678,
                is_bot: false,
                first_name: "Test",
                username: "testuser",
                language_code: "en"
            },
            chat: {
                id: 12345678,
                first_name: "Test",
                username: "testuser",
                type: "private"
            },
            date: Math.floor(Date.now() / 1000),
            text: text
        }
    };
};

describe('NN_01_Booking_Gateway E2E Tests', () => {
    it('should successfully receive a valid booking request and return a Standard Contract', async () => {
        const payload = createTelegramPayload("Hello AI Agent");

        let response;
        try {
            response = await axios.post(WEBHOOK_URL, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            });
        } catch (error: any) {
             throw new Error(`Request failed: ${error.message}. Is the workflow active and the webhook URL correct?`);
        }

        // 1. Verify HTTP Status (should be 200 OK)
        expect(response.status).toBe(200);

        // 2. Extract response body for Standard Contract validation
        const responseData = response.data;

        // 3. Validate Standard Contract [OBLIGATORIO_02]
        expect(responseData).toBeDefined();
        
        // Note: Success depends on all sub-workflows (NN_02, NN_03, NN_04)
        // If credentials for AI or TG are not set, it might return success: false
        // But the structure MUST match Standard Contract
        expect(responseData).toHaveProperty('success');
        expect(responseData).toHaveProperty('error_code');
        expect(responseData).toHaveProperty('data');
        
        // Meta information
        expect(responseData).toHaveProperty('_meta');
        expect(responseData._meta).toHaveProperty('source', 'NN_01_Booking_Gateway');
        expect(responseData._meta).toHaveProperty('timestamp');
        expect(responseData._meta).toHaveProperty('workflow_id', 'NN_01');
    }, 35000);

    it('should correctly handle a non-Telegram payload (graceful failure)', async () => {
        const invalidPayload = {
            unexpected_field: "This is not a Telegram message"
        };

        const response = await axios.post(WEBHOOK_URL, invalidPayload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        const responseData = response.data;

        // Should return a failed Standard Contract via NN_01 Format Input Error node
        expect(responseData.success).toBe(false);
        expect(responseData.error_code).toBe('VALIDATION_ERROR');
        expect(responseData.data).toBeNull();
        expect(responseData._meta.source).toBe('NN_01_Booking_Gateway');
    }, 15000);
});
