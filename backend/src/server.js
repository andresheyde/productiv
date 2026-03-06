import "dotenv/config";
import express from "express";
import { google } from "googleapis";

const app = express();
const port = 3000;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

app.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_types: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send("Missing code parameter");
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const result = await calendar.calendarList.list();

  res.json(result.data);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
