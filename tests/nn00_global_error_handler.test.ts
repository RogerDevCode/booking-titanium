import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WEBHOOK_BASE = process.env.WEBHOOK_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
// Append the webhook path for the specific workflow (for manual testing via webhook)
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook/nn-00-global-error-test`;

// Helper to generate a simulated n8n execution error payload
const createErrorPayload = (errorMessage: string = "Validation failed in gateway") => {
    return {
        execution: {
            id: "123456",
            url: `${WEBHOOK_BASE}/execution/123456`,
            error: {
                message: errorMessage,
                name: "NodeApiError",
                stack: "Error: " + errorMessage + "\n    at Object.execute (/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/nodes/HttpRequest.js:20:11)"
            },
            lastNodeExecuted: "Format Output",
            mode: "webhook"
        },
        workflow: {
            id: "e0p2xL9RtkT8PjzW",
            name: "NN_01_Booking_Gateway"
        }
    };
};

describe('NN_00_Global_Error_Handler E2E Tests', () => {
    it('should successfully receive an error payload and process it', async () => {
        const payload = createErrorPayload("TDD execution failure test");

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

        // 2. Extract out the response body for Standard Contract validation
        const responseData = response.data;

        // 3. Validate Standard Contract [OBLIGATORIO_02]
        // Since this is the error handler completing its own job successfully (logging the error),
        // we expect the handler itself to return success: true.
        expect(responseData).toBeDefined();
        expect(responseData.success).toBe(true);
        expect(responseData.error_code).toBeNull();
        expect(responseData.error_message).toBeNull();
        
        expect(responseData).toHaveProperty('data');
        expect(responseData.data).toHaveProperty('log_id');
        expect(responseData.data).toHaveProperty('telegram_sent');
        expect(responseData.data).toHaveProperty('gmail_sent');
        
        // Meta information
        expect(responseData).toHaveProperty('_meta');
        expect(responseData._meta).toHaveProperty('source');
        expect(responseData._meta).toHaveProperty('timestamp');
        expect(responseData._meta).toHaveProperty('workflow_id');
    }, 15000);
});
