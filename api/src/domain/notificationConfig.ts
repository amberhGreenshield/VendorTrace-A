import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TEAM_LABELS, TeamKey } from "./schema.js";

export type NotificationMode = "preview" | "test" | "live";
export interface NotificationConfig {
  mode: NotificationMode;
  testEmail?: string;
  recipients: Partial<Record<TeamKey, string[]>>;
  appUrl?: string;
  sender?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export function normalizeEmail(value: string): string {
  const address = value.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(address)) {
    throw new Error("Invalid notification email address");
  }
  return address;
}

/** Accept both persisted stage keys and the human-readable team names. */
export function toTeamKey(value: string): TeamKey {
  for (const [key, label] of Object.entries(TEAM_LABELS)) {
    if (value === key || value === label) return key as TeamKey;
  }
  throw new Error("Unknown notification team");
}

/** JSON plus full-line // comments. Never use eval to read private recipient files. */
export function parseRecipientRoster(text: string): Partial<Record<TeamKey, string[]>> {
  const parsed: unknown = JSON.parse(text.split(/\r?\n/).filter((line) => !line.trim().startsWith("//")).join("\n"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid recipient roster");
  const roster: Partial<Record<TeamKey, string[]>> = {};
  for (const [name, entries] of Object.entries(parsed)) {
    const key = toTeamKey(name);
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
      throw new Error("Recipient roster entries must be arrays of email addresses");
    }
    roster[key] = Array.from(new Set([...(roster[key] ?? []), ...entries.map(normalizeEmail)]));
  }
  return roster;
}

export function getNotificationConfig(
  env: NodeJS.ProcessEnv = process.env,
  readRoster: (path: string) => string = (path) => readFileSync(path, "utf8"),
): NotificationConfig {
  const mode = env.NOTIFICATION_MODE ?? "preview";
  if (mode !== "preview" && mode !== "test" && mode !== "live") throw new Error("Invalid NOTIFICATION_MODE");
  const config: NotificationConfig = {
    mode,
    testEmail: env.NOTIFICATION_TEST_EMAIL ? normalizeEmail(env.NOTIFICATION_TEST_EMAIL) : undefined,
    recipients: {},
    sender: env.NOTIFICATION_SENDER ? normalizeEmail(env.NOTIFICATION_SENDER) : undefined,
    tenantId: env.GRAPH_TENANT_ID,
    clientId: env.GRAPH_CLIENT_ID,
    clientSecret: env.GRAPH_CLIENT_SECRET,
  };
  if (env.NOTIFICATION_APP_URL) {
    const url = new URL(env.NOTIFICATION_APP_URL);
    if (url.protocol !== "https:" && !(mode === "preview" && url.hostname === "localhost")) {
      throw new Error("NOTIFICATION_APP_URL must use HTTPS");
    }
    if (url.username || url.password) throw new Error("Application URL must not contain credentials");
    config.appUrl = url.toString();
  }
  if (mode === "test" && !config.testEmail) throw new Error("Test mode requires NOTIFICATION_TEST_EMAIL");
  if (mode !== "preview" && (!config.sender || !config.tenantId || !config.clientId || !config.clientSecret || !config.appUrl)) {
    throw new Error("Sending requires an approved sender, Graph credentials, and NOTIFICATION_APP_URL");
  }
  if (mode === "live") {
    if (env.NOTIFICATION_LIVE_CONFIRMED !== "yes") throw new Error("Live notification sending must be explicitly confirmed");
    if (!env.NOTIFICATION_RECIPIENTS_FILE) throw new Error("Live mode requires a private recipient roster");
    config.recipients = parseRecipientRoster(readRoster(resolve(env.NOTIFICATION_RECIPIENTS_FILE)));
    for (const key of Object.keys(TEAM_LABELS) as TeamKey[]) {
      if (!config.recipients[key]?.length) throw new Error(`Missing live recipients for ${TEAM_LABELS[key]}`);
    }
  }
  return config;
}

export function recipientsForTeam(config: NotificationConfig, team: TeamKey): string[] {
  // A single allowlisted test address overrides ALL team rosters and database memberships.
  if (config.mode !== "live") return config.testEmail ? [normalizeEmail(config.testEmail)] : [];
  return Array.from(new Set((config.recipients[team] ?? []).map(normalizeEmail)));
}
