import { NotificationConfig } from "./notificationConfig.js";

export type DeliveryDisposition = "retry" | "failed" | "unknown";
export class MailDeliveryError extends Error {
  constructor(
    message: string,
    public disposition: DeliveryDisposition,
    public retryAfterMs?: number,
  ) { super(message); }
}

export interface MailJob {
  id: string;
  recipient: string;
  subject: string;
  body: string;
}
export interface MailTransport {
  send(job: MailJob): Promise<"accepted" | "previewed">;
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.max(1000, ms) : undefined;
}

export class GraphMailTransport implements MailTransport {
  private token?: { value: string; expiresAt: number };
  constructor(private config: NotificationConfig, private fetcher: typeof fetch = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const { tenantId, clientId, clientSecret } = this.config;
    if (!tenantId || !clientId || !clientSecret) throw new MailDeliveryError("Mail credentials are not configured", "failed");
    let response: Response;
    try {
      response = await this.fetcher(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // No sendMail request has been attempted, so token acquisition may be retried safely.
      throw new MailDeliveryError("Mail token request unavailable", "retry");
    }
    if (!response.ok) {
      throw new MailDeliveryError(`Mail token request rejected (${response.status})`, response.status === 429 || response.status >= 500 ? "retry" : "failed", retryAfter(response));
    }
    let payload: { access_token?: string; expires_in?: number };
    try { payload = await response.json() as typeof payload; }
    catch { throw new MailDeliveryError("Mail token response invalid", "retry"); }
    if (!payload.access_token) throw new MailDeliveryError("Mail token response missing token", "failed");
    this.token = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 300) * 1000 };
    return this.token.value;
  }

  async send(job: MailJob): Promise<"accepted" | "previewed"> {
    if (this.config.mode === "preview") return "previewed"; // Never touches the network.
    if (!this.config.sender) throw new MailDeliveryError("Approved sender is not configured", "failed");
    if (this.config.mode === "test" && job.recipient !== this.config.testEmail) {
      throw new MailDeliveryError("Recipient blocked by test allowlist", "failed");
    }
    const token = await this.accessToken();
    let response: Response;
    try {
      response = await this.fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.sender)}/sendMail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: job.subject,
            body: { contentType: "Text", content: job.body },
            // One request per recipient: one person's failure does not affect everyone else.
            toRecipients: [{ emailAddress: { address: job.recipient } }],
            internetMessageHeaders: [{ name: "x-vendortrace-notification-id", value: job.id }],
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // A timeout does NOT prove the message wasn't sent. Hold for operator review, never blindly resend.
      throw new MailDeliveryError("Mail submission outcome unknown", "unknown");
    }
    if (response.status === 202) return "accepted"; // Accepted by Graph, NOT proof of inbox delivery.
    if (response.status === 429) throw new MailDeliveryError("Mail provider throttled request", "retry", retryAfter(response));
    if (response.status >= 500 || response.ok) throw new MailDeliveryError(`Mail submission outcome unconfirmed (${response.status})`, "unknown");
    throw new MailDeliveryError(`Mail request rejected (${response.status})`, "failed");
  }
}
