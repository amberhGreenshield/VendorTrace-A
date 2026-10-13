import type { PrismaClient } from "@prisma/client";
import { NotificationConfig, recipientsForTeam, toTeamKey } from "./notificationConfig.js";
import { GraphMailTransport, MailDeliveryError, MailTransport } from "./mailTransport.js";

export async function processNotificationBatch(
  db: PrismaClient,
  config: NotificationConfig,
  transport: MailTransport,
  limit = 20,
  now = new Date(),
): Promise<number> {
  if (config.mode === "preview") return 0;
  // A crashed worker may have submitted mail before its DB acknowledgement.
  // Do not re-send expired claims automatically.
  await db.emailNotification.updateMany({
    where: { status: "processing", lockedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
    data: { status: "unknown", lockedAt: null, lastError: "Worker claim expired; check sender Sent Items before replay" },
  });
  let count = 0;
  for (let index = 0; index < limit; index++) {
    const job = await db.emailNotification.findFirst({
      where: { mode: config.mode, status: { in: ["pending", "retry"] }, nextAttemptAt: { lte: now } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!job) break;
    const claim = await db.emailNotification.updateMany({
      where: { id: job.id, status: job.status, attempts: job.attempts },
      data: { status: "processing", attempts: { increment: 1 }, lockedAt: new Date() },
    });
    if (!claim.count) continue; // Another worker won the claim.
    count++;
    try {
      if (!recipientsForTeam(config, toTeamKey(job.teamKey)).includes(job.recipient)) {
        throw new MailDeliveryError("Queued recipient is no longer approved for this team/mode", "failed");
      }
      const status = await transport.send(job);
      await db.emailNotification.update({
        where: { id: job.id },
        data: { status, acceptedAt: status === "accepted" ? new Date() : null, lockedAt: null, lastError: null },
      });
    } catch (error) {
      const failure = error instanceof MailDeliveryError ? error : new MailDeliveryError("Unexpected mail submission error", "unknown");
      const attempts = job.attempts + 1;
      const shouldRetry = failure.disposition === "retry" && attempts < 6;
      const status = shouldRetry ? "retry" : failure.disposition === "retry" ? "failed" : failure.disposition;
      await db.emailNotification.update({
        where: { id: job.id },
        data: {
          status,
          lockedAt: null,
          lastError: failure.message,
          nextAttemptAt: new Date(Date.now() + (failure.retryAfterMs ?? Math.min(3_600_000, 30_000 * 2 ** (attempts - 1)))),
        },
      });
      console.warn(`[notification] ${job.id}: ${status}`); // No recipient addresses, vendor details, secrets, or email bodies in logs.
    }
  }
  return count;
}

export function startNotificationWorker(db: PrismaClient, config: NotificationConfig): () => void {
  if (config.mode === "preview") {
    console.info("[notification] Preview mode: no emails will be sent.");
    return () => {};
  }
  const transport = new GraphMailTransport(config);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processNotificationBatch(db, config, transport); }
    catch { console.error("[notification] Queue processing unavailable; persisted jobs remain for inspection."); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 10_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
