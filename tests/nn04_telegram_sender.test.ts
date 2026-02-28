import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WEBHOOK_BASE = process.env.WEBHOOK_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook/nn-04-telegram-sender-test`;

describe('NN_04_Telegram_Sender E2E Tests', () => {
    it('should successfully handle a request to send a message (even if TG API fails)', async () => {
        // Mock payload representing what NN_03_AI_Agent would output
        const payload = {
            data: {
                chat_id: process.env.TEST_CHAT_ID || "123456789",
                ai_response: "Your booking is confirmed! Thank you for using our service."
            }
        };

        let response;
        try {
            response = await axios.post(WEBHOOK_URL, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            });
        } catch (error: any) {
            throw new Error(`Request failed: ${error.message}. Is the workflow active and Telegram credentials configured?`);
        }

        // 1. Verify HTTP Status (should be 200 OK)
        expect(response.status).toBe(200);

        // 2. Extract response body for Standard Contract validation
        const responseData = response.data;

        // 3. Validate Standard Contract [OBLIGATORIO_02]
        expect(responseData).toBeDefined();
        
        // Note: In real CI without a real chat_id, success might be false but it should handle it
        expect(responseData).toHaveProperty('data');
        expect(responseData.data).toHaveProperty('chat_id');
        
        if (responseData.success === true) {
            expect(responseData.data.delivery_status).toBe('SENT');
        } else {
            expect(responseData.data.delivery_status).toBe('FAILED');
            expect(responseData.error_code).toBe('TELEGRAM_API_ERROR');
        }

        // Meta information
        expect(responseData).toHaveProperty('_meta');
        expect(responseData._meta).toHaveProperty('source', 'NN_04_Telegram_Sender');
    }, 35000);

    it('should handle missing required fields gracefully (Validation Sandwich PRE-check)', async () => {
        // Missing the required 'chat_id' field
        const invalidPayload = {
            data: {
                ai_response: "This should fail"
            }
        };

        let response;
        try {
            response = await axios.post(WEBHOOK_URL, invalidPayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });
        } catch (error: any) {
            throw error;
        }

        const responseData = response.data;

        // Verify it returned a failed Standard Contract
        expect(responseData.success).toBe(false);
        expect(responseData.error_code).toBe('VALIDATION_ERROR');
        expect(responseData._meta.source).toBe('NN_04_Telegram_Sender');
    });

    it('should handle special characters in message (Telegram escaping)', async () => {
        const payload = {
            data: {
                chat_id: "123456789",
                ai_response: "Test *bold* _italic_ `code` [link](url) with special chars: - > ."
            }
        };

        const response = await axios.post(WEBHOOK_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const responseData = response.data;
        expect(responseData).toBeDefined();
        // Should not crash the workflow
        expect(response.status).toBe(200);
    });
});
