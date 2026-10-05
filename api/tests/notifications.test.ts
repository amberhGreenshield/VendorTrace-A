import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNotificationConfig, normalizeEmail, parseRecipientRoster, recipientsForTeam, toTeamKey, NotificationConfig } from "../src/domain/notificationConfig.js";
import { planNotifications } from "../src/domain/notificationService.js";
import { GraphMailTransport, MailDeliveryError } from "../src/domain/mailTransport.js";
import { TEAM_LABELS, TeamKey } from "../src/domain/schema.js";
import { evaluateRules } from "../src/domain/rulesEngine.js";
import { buildCaseStages } from "../src/domain/hierarchy.js";

const allTeams = Object.keys(TEAM_LABELS) as TeamKey[];
const testEmail = "synthetic.tester@example.com";
const sendingEnv = {
  NOTIFICATION_MODE: "test",
  NOTIFICATION_TEST_EMAIL: testEmail,
  NOTIFICATION_SENDER: "synthetic.sender@example.com",
  NOTIFICATION_APP_URL: "https://vendortrace.example.com",
  GRAPH_TENANT_ID: "synthetic-tenant",
  GRAPH_CLIENT_ID: "synthetic-client",
  GRAPH_CLIENT_SECRET: "synthetic-test-value-not-a-credential",
};
const preview: NotificationConfig = { mode: "preview", testEmail, recipients: {} };
const record = { id: "synthetic-case", caseNumber: "#TEST-1", vendorName: "Synthetic Vendor" };
const initial = [
  { stageKey: "pvm-intake", team: "PVM" },
  { stageKey: "business-architecture", team: "BusinessArchitecture" },
  { stageKey: "risk-initial", team: "Risk" },
];
const job = { id: "synthetic-mail-job", recipient: testEmail, subject: "Synthetic subject", body: "Synthetic body" };
const tokenResponse = () => new Response(JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }), { status: 200 });

test("safe default is preview without mail credentials", () => {
  assert.equal(getNotificationConfig({}).mode, "preview");
});
test("unknown notification modes fail closed", () => {
  assert.throws(() => getNotificationConfig({ NOTIFICATION_MODE: "production" }));
});
test("test mode refuses missing recipient or approved sender", () => {
  assert.throws(() => getNotificationConfig({ ...sendingEnv, NOTIFICATION_TEST_EMAIL: undefined }));
  assert.throws(() => getNotificationConfig({ ...sendingEnv, NOTIFICATION_SENDER: undefined }));
});
test("sending modes require HTTPS application links", () => {
  assert.throws(() => getNotificationConfig({ ...sendingEnv, NOTIFICATION_APP_URL: "http://vendortrace.example.com" }));
});
test("address validation and normalization", () => {
  assert.equal(normalizeEmail("  Reviewer@Example.com "), "reviewer@example.com");
  assert.throws(() => normalizeEmail("person@example.com\nbcc: another@example.com"));
});
test("team key and display label resolve to the same team", () => {
  for (const key of allTeams) assert.equal(toTeamKey(TEAM_LABELS[key]), key);
  assert.throws(() => toTeamKey("not-a-team"));
});
test("full-line commented addresses are inactive and case-insensitive duplicates collapse", () => {
  const roster = parseRecipientRoster('{\n"Business Architecture": ["REVIEWER@example.com", "reviewer@example.com"]\n// , "inactive@example.com"\n}');
  assert.deepEqual(roster.BusinessArchitecture, ["reviewer@example.com"]);
});
test("roster rejects unknown teams, non-address values, and invalid addresses", () => {
  assert.throws(() => parseRecipientRoster('{"Other": ["reviewer@example.com"]}'));
  assert.throws(() => parseRecipientRoster('{"PVM": [123]}'));
  assert.throws(() => parseRecipientRoster('{"PVM": ["not-an-email"]}'));
});
test("test override applies to all nine teams even if roster contains staff", () => {
  const config = getNotificationConfig(sendingEnv, () => { throw new Error("Test mode must not read live roster"); });
  config.recipients = Object.fromEntries(allTeams.map((key) => [key, ["inactive.staff@example.com"]]));
  for (const key of allTeams) assert.deepEqual(recipientsForTeam(config, key), [testEmail]);
});
test("live mode requires explicit confirmation and all nine populated teams", () => {
  const env = { ...sendingEnv, NOTIFICATION_MODE: "live", NOTIFICATION_RECIPIENTS_FILE: "private.jsonc" };
  assert.throws(() => getNotificationConfig(env));
  assert.throws(() => getNotificationConfig({ ...env, NOTIFICATION_LIVE_CONFIRMED: "yes" }, () => '{"PVM":["one@example.com"]}'));
  const config = getNotificationConfig({ ...env, NOTIFICATION_LIVE_CONFIRMED: "yes" }, () => JSON.stringify(Object.fromEntries(allTeams.map((key) => [key, ["one@example.com", "two@example.com"]]))));
  assert.deepEqual(recipientsForTeam(config, "PVM"), ["one@example.com", "two@example.com"]);
});
test("new case notifies initial three teams plus immediate UpGuard setup", () => {
  const plans = planNotifications(record, initial, true, preview);
  assert.equal(plans.length, 4);
  assert.deepEqual(plans.map((p) => p.kind), ["teamInbox", "teamInbox", "teamInbox", "upguardSetup"]);
  assert.equal(plans[3].teamKey, "SecurityGovernance");
  assert.equal(plans[3].stageKey, null);
  assert(plans.every((p) => p.recipient === testEmail && p.status === "previewed"));
});
test("UpGuard request only follows TPRM requirement, not every case", () => {
  assert.equal(planNotifications(record, initial, false, preview).length, 3);
  const rules = evaluateRules({
    legalName: "Synthetic", description: "", arrangementType: "", businessLines: "", contractOwner: "",
    q2_itInfrastructure: "Yes it will be an SSO integration only",
  });
  assert(rules.requiredAssessments.has("UpguardAssessment"));
  const stages = buildCaseStages(rules).filter((s) => s.status === "active");
  assert.equal(planNotifications(record, stages, true, preview).length, 4);
});
test("UpGuard request is distinct from later Security Governance inbox notification", () => {
  const setup = planNotifications(record, [], true, preview)[0];
  const review = planNotifications(record, [{ stageKey: "security-governance", team: "SecurityGovernance" }], false, preview)[0];
  assert.notEqual(setup.dedupeKey, review.dedupeKey);
  assert.match(setup.body, /does not mean.*active yet/);
});
test("Risk initial and final sign-off are separate events", () => {
  const first = planNotifications(record, [{ stageKey: "risk-initial", team: "Risk" }], false, preview)[0];
  const last = planNotifications(record, [{ stageKey: "risk-signoff", team: "Risk" }], false, preview)[0];
  assert.notEqual(first.dedupeKey, last.dedupeKey);
});
test("separate mail job for each individual; duplicate events removed", () => {
  const config: NotificationConfig = { mode: "live", recipients: { PVM: ["one@example.com", "two@example.com", "one@example.com"] } };
  const plans = planNotifications(record, [initial[0], initial[0]], false, config);
  assert.equal(plans.length, 2);
  assert.equal(plans[0].recipient, "one@example.com");
  assert.equal(plans[1].recipient, "two@example.com");
});
test("test emails are labelled; unsafe vendor control characters do not reach subjects", () => {
  const plans = planNotifications({ ...record, vendorName: "Synthetic\nInjected\rVendor" }, initial, true, preview);
  assert(plans.every((p) => p.subject.startsWith("[TEST] ") && !/[\r\n]/.test(p.subject)));
  assert(plans.every((p) => !p.body.includes("businessOwnerEmail")));
});
test("link opens homepage with case instructions, not an invented deep link", () => {
  const plan = planNotifications(record, [initial[0]], false, { ...preview, appUrl: "https://vendortrace.example.com/" })[0];
  assert.match(plan.body, /https:\/\/vendortrace.example.com\//);
  assert.match(plan.body, /Find case #TEST-1/);
  assert(!plan.body.includes("/cases/"));
});
test("preview never makes a network call", async () => {
  const transport = new GraphMailTransport(preview, (() => { throw new Error("Network forbidden"); }) as typeof fetch);
  assert.equal(await transport.send(job), "previewed");
});
test("mail transport independently blocks non-allowlisted test recipients", async () => {
  let calls = 0;
  const transport = new GraphMailTransport(getNotificationConfig(sendingEnv), (async () => { calls++; return tokenResponse(); }) as typeof fetch);
  await assert.rejects(transport.send({ ...job, recipient: "inactive.staff@example.com" }), (err) => err instanceof MailDeliveryError && err.disposition === "failed");
  assert.equal(calls, 0);
});
test("Graph submissions use individual recipient, no attachments, correct endpoint and cached token", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const transport = new GraphMailTransport(getNotificationConfig(sendingEnv), (async (url, init) => {
    requests.push({ url: String(url), init });
    return requests.length === 1 ? tokenResponse() : new Response(null, { status: 202 });
  }) as typeof fetch);
  assert.equal(await transport.send(job), "accepted");
  assert.equal(await transport.send({ ...job, id: "another-job" }), "accepted");
  assert.equal(requests.length, 3);
  assert.match(requests[1].url, /users\/synthetic.sender%40example.com\/sendMail$/);
  const body = JSON.parse(String(requests[1].init?.body));
  assert.equal(body.message.toRecipients.length, 1);
  assert.equal(body.message.toRecipients[0].emailAddress.address, testEmail);
  assert.equal(body.message.attachments, undefined);
  assert.equal(body.saveToSentItems, true);
});
test("Graph throttling is safe to retry and preserves Retry-After", async () => {
  let calls = 0;
  const transport = new GraphMailTransport(getNotificationConfig(sendingEnv), (async () => ++calls === 1 ? tokenResponse() : new Response(null, { status: 429, headers: { "retry-after": "120" } })) as typeof fetch);
  await assert.rejects(transport.send(job), (err) => err instanceof MailDeliveryError && err.disposition === "retry" && err.retryAfterMs === 120_000);
});
test("permission rejection is permanent, not silently accepted", async () => {
  let calls = 0;
  const transport = new GraphMailTransport(getNotificationConfig(sendingEnv), (async () => ++calls === 1 ? tokenResponse() : new Response(null, { status: 403 })) as typeof fetch);
  await assert.rejects(transport.send(job), (err) => err instanceof MailDeliveryError && err.disposition === "failed");
});
test("ambiguous send timeout or 5xx is held for manual review", async () => {
  for (const errorType of ["timeout", "5xx"]) {
    let calls = 0;
    const transport = new GraphMailTransport(getNotificationConfig(sendingEnv), (async () => {
      if (++calls === 1) return tokenResponse();
      if (errorType === "timeout") throw new Error("Synthetic timeout");
      return new Response(null, { status: 503 });
    }) as typeof fetch);
    await assert.rejects(transport.send(job), (err) => err instanceof MailDeliveryError && err.disposition === "unknown");
  }
});
test("token outage is retryable because mail has not been submitted", async () => {
  const transport = new GraphMailTransport(getNotificationConfig(sendingEnv), (async () => new Response(null, { status: 503 })) as typeof fetch);
  await assert.rejects(transport.send(job), (err) => err instanceof MailDeliveryError && err.disposition === "retry");
});
test("public recipient example contains only placeholders", () => {
  const roster = parseRecipientRoster(readFileSync(new URL("../notification-recipients.example.jsonc", import.meta.url), "utf8"));
  assert.equal(Object.keys(roster).length, 9);
  assert(Object.values(roster).flat().every((email) => email.endsWith("@example.com")));
});
