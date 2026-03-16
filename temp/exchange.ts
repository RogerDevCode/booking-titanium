import { OAuth2Client } from "google-auth-library";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: "/home/manager/Sync/N8N_Projects/booking-titanium/.env" });

const clientId = process.env.GCALENDAR_CLIENT_ID || "";
const clientSecret = process.env.GCALENDAR_CLIENT_SECRET || "";
const redirectUri = "http://localhost:3000/oauth2callback";

const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
const code = "4/0AfrIepDiK74rH7PrIrm6yBphjsfssL6jZr4bO1_QqpHpsepiDUpxzNLMHatcOzOm1gCCnw";

async function run() {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));
    console.log("[OK] Token saved");
  } catch (e: any) {
    console.error("[ERROR]", e.message);
  }
}
run();
