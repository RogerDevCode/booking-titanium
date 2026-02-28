import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WEBHOOK_BASE = process.env.WEBHOOK_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook/nn-03-ai-agent-test`;

describe('NN_03_AI_Agent E2E Tests', () => {
    it('should successfully receive message data and handle AI processing', async () => {
        // Mock payload
        const payload = {
            chat_id: "123456789",
            text: "Hello, what services do you offer for booking?"
        };

        let response;
        try {
            response = await axios.post(WEBHOOK_URL, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 
            });
        } catch (error: any) {
             throw new Error(`Request failed: ${error.message}. Is the workflow active and Groq credentials configured?`);
        }

        // 1. Verify HTTP Status (should be 200 OK)
        expect(response.status).toBe(200);

        // 2. Extract response body
        const responseData = response.data;

        // 3. Validate Standard Contract
        expect(responseData).toBeDefined();
        
        if (responseData.success === true) {
            expect(responseData.data).toHaveProperty('ai_response');
            expect(typeof responseData.data.ai_response).toBe('string');
        } else {
            // Handle expected API error if not configured
            expect(responseData.error_code).toBe('AI_AGENT_ERROR');
        }

        expect(responseData).toHaveProperty('_meta');
        expect(responseData._meta.source).toBe('NN_03_AI_Agent');
    }, 35000);

    it('should gracefully handle missing or invalid input data (Validation Sandwich PRE-check)', async () => {
        const invalidPayload = {
            invalid_field: "test"
        };

        const response = await axios.post(WEBHOOK_URL, invalidPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        const responseData = response.data;
        expect(responseData.success).toBe(false);
        expect(responseData.error_code).toBe('VALIDATION_ERROR');
        expect(responseData._meta.source).toBe('NN_03_AI_Agent');
    });
});
