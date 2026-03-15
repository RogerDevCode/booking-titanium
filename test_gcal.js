const { google } = require('googleapis');
require('dotenv').config();

const calendar = google.calendar({
  version: 'v3',
  auth: process.env.GCALENDAR_API_KEY
});

calendar.events.list({
  calendarId: 'primary',
  timeMin: '2026-03-12T00:00:00Z',
  timeMax: '2026-03-15T23:59:59Z',
  singleEvents: true,
  orderBy: 'startTime',
}).then(res => {
  console.log(JSON.stringify(res.data.items, null, 2));
}).catch(err => {
  console.error('Error:', err.message);
});
