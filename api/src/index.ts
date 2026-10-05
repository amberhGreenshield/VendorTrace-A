import "dotenv/config";
import express from "express";
import cors from "cors";
import { casesRouter } from "./routes/cases.js";
import { usersRouter } from "./routes/users.js";
import { prisma } from "./db.js";
import { getNotificationConfig } from "./domain/notificationConfig.js";
import { startNotificationWorker } from "./domain/notificationWorker.js";

const app = express();
const notificationConfig = getNotificationConfig();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/cases", casesRouter);
app.use("/api", usersRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Procurement Intake API listening on http://localhost:${port}`);
  startNotificationWorker(prisma, notificationConfig);
});
