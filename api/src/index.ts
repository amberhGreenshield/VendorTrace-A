import "dotenv/config";
import express from "express";
import cors from "cors";
import { casesRouter } from "./routes/cases.js";
import { usersRouter } from "./routes/users.js";
import { runAssessmentReminders, startReminderScheduler } from "./jobs/assessmentReminders.js";
import { migrateOnStart } from "./jobs/migrateOnStart.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/cases", casesRouter);
app.use("/api", usersRouter);

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

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
// Bring the database schema up to date first, then start serving.
await migrateOnStart();
app.listen(port, () => {
  startReminderScheduler();
  console.log(`Procurement Intake API listening on http://localhost:${port}`);
});
