import { google } from "googleapis";
import * as dotenv from "dotenv";

dotenv.config({ path: "/home/manager/Sync/N8N_Projects/booking-titanium/.env" });

const API_KEY = process.env.GCALENDAR_API_KEY;
const CALENDAR_ID = "dev.n8n.stax@gmail.com";

async function run() {
  const calendar = google.calendar({ version: "v3", auth: API_KEY });
  console.log("Listing events for 2026-03-16...");
  try {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: "2026-03-16T00:00:00Z",
      timeMax: "2026-03-16T23:59:59Z",
      singleEvents: true,
    });
    const events = res.data.items || [];
    console.log(`Found ${events.length} events.`);
    for (const e of events) {
      console.log(`- ID: ${e.id} | Summary: ${e.summary} | Start: ${e.start?.dateTime}`);
    }
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
run();
