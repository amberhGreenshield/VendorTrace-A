import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import * as XLSX from "xlsx";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { getNotificationConfig } from "../src/domain/notificationConfig.js";
import { enqueueNotifications } from "../src/domain/notificationService.js";
import { processNotificationBatch } from "../src/domain/notificationWorker.js";
import { MailDeliveryError, MailTransport } from "../src/domain/mailTransport.js";

// This suite refuses production/environment-provided DBs and never calls Graph.
if (process.env.DATABASE_URL) throw new Error("Refusing existing DATABASE_URL; use a disposable notification test database");
const databaseUrl = process.env.NOTIFICATION_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("NOTIFICATION_TEST_DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
    || database.pathname !== "/vendortrace_notification_test"
    || Array.from(database.searchParams.keys()).some((key) => key !== "schema")) {
  throw new Error("Only the dedicated loopback vendortrace_notification_test database is allowed");
}
process.env.DATABASE_URL = databaseUrl;
process.env.NOTIFICATION_MODE = "test";
process.env.NOTIFICATION_TEST_EMAIL = "synthetic.tester@example.com";
process.env.NOTIFICATION_SENDER = "synthetic.sender@example.com";
process.env.NOTIFICATION_APP_URL = "https://vendortrace.example.com";
process.env.GRAPH_TENANT_ID = "synthetic-tenant";
process.env.GRAPH_CLIENT_ID = "synthetic-client";
process.env.GRAPH_CLIENT_SECRET = "synthetic-test-value-not-a-credential";
delete process.env.SHAREPOINT_HOSTNAME;
delete process.env.SHAREPOINT_SITE_PATH;
const { prisma } = await import("../src/db.js");
const { casesRouter } = await import("../src/routes/cases.js");
const config = getNotificationConfig();
let server: Server;
let base: string;
const accepted: MailTransport = { send: async () => "accepted" };

before(async () => {
  await prisma.case.deleteMany();
  const app = express();
  app.use(express.json());
  app.use("/api/cases", casesRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  await prisma.case.deleteMany();
  await prisma.$disconnect();
});

async function createCase(upguard: boolean, allReviews = false) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Legal name of third-party", "Synthetic Vendor"],
    ["Third-party arrangement type", "Service"],
    ["Description of Services", "Synthetic test case"],
    ["Business lines impacted", "Test"],
    ["Contract owner", "Synthetic Sponsor"],
  ]), "00 Start Here");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["", "Risk Rating", "", "Tier 2"],
    ["", "IT Infrastructure Integration", "", upguard ? "Yes it will be an SSO integration only" : "No"],
    ["", "Artificial Intelligence", "", allReviews ? "Yes" : "No"],
    ["", "Data Protection", "", allReviews ? "Yes the third party will access PI" : "No"],
    ["", "Data Residency", "", allReviews ? "Yes" : "No"],
  ]), "02 TP Risk Assessment");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  const form = new FormData();
  form.append("tprmFile", new Blob([buffer]), "synthetic.xlsx");
  form.append("businessOwner", "Synthetic Owner");
  form.append("businessOwnerEmail", "synthetic.owner@example.com");
  const response = await fetch(`${base}/api/cases`, { method: "POST", body: form });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json() as Promise<{ id: string; caseNumber: string; vendorName: string }>;
}
async function complete(id: string, stage: string) {
  return fetch(`${base}/api/cases/${id}/stages/${stage}/complete`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completedBy: "Synthetic Reviewer" }),
  });
}

test("creation atomically queues initial teams and immediate UpGuard, each to test recipient", async () => {
  const c = await createCase(true);
  const jobs = await prisma.emailNotification.findMany({ where: { caseId: c.id } });
  assert.equal(jobs.length, 4);
  assert(jobs.every((job) => job.recipient === config.testEmail && job.status === "pending"));
  assert.equal(jobs.filter((job) => job.kind === "upguardSetup").length, 1);
  assert.equal(jobs.filter((job) => job.kind === "teamInbox" && job.teamKey === "BusinessArchitecture").length, 1);
  assert.equal(jobs.filter((job) => job.kind === "teamInbox" && job.teamKey === "SecurityGovernance").length, 0);
});
test("no UpGuard alert for non-triggering workbook; concurrent first-line completions notify EA exactly once", async () => {
  const c = await createCase(false);
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id } }), 3);
  const responses = await Promise.all(["pvm-intake", "business-architecture", "risk-initial"].map((stage) => complete(c.id, stage)));
  assert(responses.every((r) => r.status === 200));
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id, teamKey: "EnterpriseArchitecture" } }), 1);
  assert.equal((await complete(c.id, "risk-initial")).status, 409);
  assert.equal((await complete(c.id, "enterprise-architecture")).status, 200);
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id, teamKey: "Risk" } }), 2);
  assert.equal((await complete(c.id, "risk-signoff")).status, 200);
  assert.equal((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).overallStatus, "completed");
});
test("UpGuard remains creation-only when later Security Governance review activates", async () => {
  const c = await createCase(true);
  for (const stage of ["pvm-intake", "business-architecture", "risk-initial"]) assert.equal((await complete(c.id, stage)).status, 200);
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id, kind: "upguardSetup" } }), 1);
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id, kind: "teamInbox", teamKey: "SecurityGovernance" } }), 1);
  assert.equal((await complete(c.id, "security-governance")).status, 200);
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id, kind: "teamInbox", teamKey: "SecurityArchitecture" } }), 1);
});
test("all nine team inboxes receive their correct activation events; parallel Data/AI activate once", async () => {
  const c = await createCase(true, true);
  for (const stage of ["pvm-intake", "business-architecture", "risk-initial", "privacy"]) {
    assert.equal((await complete(c.id, stage)).status, 200);
  }
  const responses = await Promise.all(["data", "ai"].map((stage) => complete(c.id, stage)));
  assert(responses.every((response) => response.status === 200));
  for (const stage of ["security-governance", "security-architecture", "enterprise-architecture", "risk-signoff"]) {
    assert.equal((await complete(c.id, stage)).status, 200);
  }
  const jobs = await prisma.emailNotification.findMany({ where: { caseId: c.id } });
  assert.equal(jobs.length, 11); // 10 stage inbox events (Risk twice) + one UpGuard setup request.
  assert.equal(new Set(jobs.filter((job) => job.kind === "teamInbox").map((job) => job.teamKey)).size, 9);
  assert(jobs.every((job) => job.recipient === config.testEmail));
});
test("starting a stage sends nothing extra; concurrent start cannot reopen a completed stage", async () => {
  const c = await createCase(false);
  const start = () => fetch(`${base}/api/cases/${c.id}/stages/pvm-intake/start`, { method: "POST" });
  const responses = await Promise.all([start(), complete(c.id, "pvm-intake")]);
  assert([200, 409].includes(responses[0].status));
  assert.equal(responses[1].status, 200);
  const stage = await prisma.caseStage.findFirstOrThrow({ where: { caseId: c.id, stageKey: "pvm-intake" } });
  assert.equal(stage.status, "completed");
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id } }), 3);
});
test("duplicate enqueue is idempotent and rollback does not leave email jobs", async () => {
  const c = await createCase(false);
  await prisma.$transaction(async (tx) => {
    await enqueueNotifications(tx, c, [{ stageKey: "pvm-intake", team: "PVM" }], false, config);
  });
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id } }), 3);
  await assert.rejects(prisma.$transaction(async (tx) => {
    await enqueueNotifications(tx, c, [{ stageKey: "rollback-only", team: "Privacy" }], false, config);
    throw new Error("Synthetic rollback");
  }));
  assert.equal(await prisma.emailNotification.count({ where: { caseId: c.id, stageKey: "rollback-only" } }), 0);
});
test("parallel workers never submit an individual job twice", async () => {
  await prisma.emailNotification.deleteMany();
  await createCase(false);
  const submitted: string[] = [];
  const transport: MailTransport = { send: async (job) => { submitted.push(job.id); await new Promise((r) => setTimeout(r, 10)); return "accepted"; } };
  await Promise.all([processNotificationBatch(prisma, config, transport), processNotificationBatch(prisma, config, transport)]);
  assert.equal(submitted.length, 3);
  assert.equal(new Set(submitted).size, 3);
  assert.equal(await prisma.emailNotification.count({ where: { status: "accepted" } }), 3);
});
test("throttled jobs survive as retries then become accepted", async () => {
  await prisma.emailNotification.deleteMany();
  await createCase(false);
  await processNotificationBatch(prisma, config, { send: async () => { throw new MailDeliveryError("Synthetic throttle", "retry", 120_000); } }, 1);
  const retry = await prisma.emailNotification.findFirstOrThrow({ where: { status: "retry" } });
  assert.equal(retry.attempts, 1);
  assert(retry.nextAttemptAt.getTime() > Date.now() + 100_000);
  await processNotificationBatch(prisma, config, accepted, 20, new Date(Date.now() + 180_000));
  assert.equal(await prisma.emailNotification.count({ where: { status: "accepted" } }), 3);
});
test("sixth safe retry fails instead of looping indefinitely", async () => {
  await prisma.emailNotification.deleteMany();
  await createCase(false);
  const first = await prisma.emailNotification.findFirstOrThrow({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  await prisma.emailNotification.update({ where: { id: first.id }, data: { attempts: 5 } });
  await processNotificationBatch(prisma, config, { send: async () => { throw new MailDeliveryError("Synthetic throttle", "retry"); } }, 1);
  assert.equal((await prisma.emailNotification.findUniqueOrThrow({ where: { id: first.id } })).status, "failed");
});
test("ambiguous sends and expired claims are held, not automatically retried", async () => {
  await prisma.emailNotification.deleteMany();
  await createCase(false);
  await processNotificationBatch(prisma, config, { send: async () => { throw new MailDeliveryError("Synthetic unknown outcome", "unknown"); } }, 1);
  const pending = await prisma.emailNotification.findFirstOrThrow({ where: { status: "pending" } });
  await prisma.emailNotification.update({ where: { id: pending.id }, data: { status: "processing", lockedAt: new Date(Date.now() - 360_000) } });
  await processNotificationBatch(prisma, config, accepted);
  assert.equal(await prisma.emailNotification.count({ where: { status: "unknown" } }), 2);
  assert.equal(await prisma.emailNotification.count({ where: { status: "accepted" } }), 1);
});
test("preview rows and other-mode rows cannot be promoted by a live worker", async () => {
  await prisma.emailNotification.deleteMany();
  const c = await createCase(false);
  await prisma.$transaction(async (tx) => {
    await enqueueNotifications(tx, c, [{ stageKey: "preview-only", team: "Privacy" }], false, { ...config, mode: "preview" });
  });
  let sends = 0;
  await processNotificationBatch(prisma, { ...config, mode: "live" }, { send: async () => { sends++; return "accepted"; } });
  assert.equal(sends, 0);
  assert.equal(await prisma.emailNotification.count({ where: { status: "previewed" } }), 1);
  assert.equal(await prisma.emailNotification.count({ where: { status: "pending", mode: "test" } }), 3);
});
test("a recipient removed from a team's live roster cannot receive a queued snapshot", async () => {
  await prisma.emailNotification.deleteMany();
  const c = await createCase(false);
  await prisma.$transaction(async (tx) => {
    await enqueueNotifications(tx, c, [{ stageKey: "live-privacy", team: "Privacy" }], false, { ...config, mode: "live", recipients: { Privacy: ["removed.reviewer@example.com"] } });
  });
  let sends = 0;
  await processNotificationBatch(prisma, { ...config, mode: "live", recipients: { Privacy: ["current.reviewer@example.com"] } }, { send: async () => { sends++; return "accepted"; } });
  assert.equal(sends, 0);
  assert.equal(await prisma.emailNotification.count({ where: { status: "failed", mode: "live" } }), 1);
});
