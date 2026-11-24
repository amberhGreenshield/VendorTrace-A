import "dotenv/config";
import express from "express";
import cors from "cors";
import { casesRouter } from "./routes/cases.js";
import { usersRouter } from "./routes/users.js";
import { runAssessmentReminders, startReminderScheduler } from "./jobs/assessmentReminders.js";
import { migrateOnStart } from "./jobs/migrateOnStart.js";
import { allowedOrigins, entraAuth } from "./auth/entraAuth.js";

const app = express();
// Don't advertise the framework, and send baseline security headers on every
// response.
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Cache-Control", "no-store");
  next();
});
// Only the VendorTrace website (and local dev) may call the API from a browser.
app.use(cors({ origin: allowedOrigins(), allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Manual / external trigger for the reminder job (e.g. an Azure Logic App or
// GitHub Actions schedule, if the API isn't set to "Always On"). Protected by
// JOB_SECRET; disabled entirely when JOB_SECRET isn't set.
app.post("/api/jobs/assessment-reminders", async (req, res) => {
  const secret = process.env.JOB_SECRET;
  if (!secret || req.get("x-job-secret") !== secret) return res.status(404).json({ error: "Not found" });
  try {
    res.json(await runAssessmentReminders());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reminder run failed" });
  }
});

// Everything below needs a valid Microsoft sign-in token (see auth/entraAuth.ts).
app.use("/api", entraAuth());
app.use("/api/cases", casesRouter);
app.use("/api", usersRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
// Bring the database schema up to date first, then start serving.
await migrateOnStart();
app.listen(port, () => {
  startReminderScheduler();
  console.log(`Procurement Intake API listening on http://localhost:${port}`);
});
