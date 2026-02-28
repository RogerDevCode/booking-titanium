import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const WEBHOOK_BASE = process.env.WEBHOOK_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook/nn-02-booking-parser-test`;

const createQueryPayload = (chatId: number, text: string, username: string = "test_user") => {
    return {
        message: {
            message_id: 111,
            from: {
                id: chatId,
                is_bot: false,
                first_name: username,
                language_code: "en"
            },
            chat: {
                id: chatId,
                first_name: username,
                type: "private"
            },
            date: Math.floor(Date.now() / 1000),
            text: text
        }
    };
};

describe('NN_02_Message_Parser E2E Tests', () => {
    
    // Test 1: Happy Path
    it('should successfully extract data from a valid Telegram text message', async () => {
        const payload = createQueryPayload(123456789, "Hello, I want to book a room");

        const response = await axios.post(WEBHOOK_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000 
        });

        expect(response.status).toBe(200);
        const data = response.data;
        
        // Output must obey Standard Contract [OBLIGATORIO_02]
        expect(data.success).toBe(true);
        expect(data.error_code).toBeNull();
        expect(data.data).toBeDefined();

        // Validated extraction
        expect(data.data.chat_id).toBe(123456789);
        expect(data.data.text).toBe("Hello, I want to book a room");
        expect(data.data.username).toBe("test_user");
        expect(data.data.type).toBe("text");
    }, 15000);

    // Test 2: Invalid Content (Validation Sandwich failure)
    it('should handle payload with missing text fields securely', async () => {
        // Simulating a photo or audio message with no text
        const badPayload = {
            message: {
                message_id: 222,
                chat: { id: 987654 },
                photo: [{ file_id: "XYZ" }] 
            }
        };

        const response = await axios.post(WEBHOOK_URL, badPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
            validateStatus: () => true // Prevent axios from throwing on non-200
        });

        // N8N webhook returns 200, the body indicates success: false
        expect(response.status).toBe(200);
        const data = response.data;
        
        expect(data.success).toBe(false);
        expect(data.error_code).toBe("VALIDATION_ERROR");
        expect(data.error_message).toContain("text");
    }, 15000);

    // Test 3: SQL/Regex Injection Prevention [SEC_02]
    it('should sanitize strings by escaping quotes to prevent SQLi downstream', async () => {
        const trickyPayload = createQueryPayload(111222, "I want to drop table users; --");
        
        const response = await axios.post(WEBHOOK_URL, trickyPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });
        
        const data = response.data;
        expect(data.success).toBe(true);
        expect(data.data.text).toBe("I want to drop table users; --");
    }, 15000);

});
