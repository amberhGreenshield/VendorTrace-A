CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'processing', 'accepted', 'retry', 'failed', 'unknown', 'previewed');

CREATE TABLE "EmailNotification" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "teamKey" TEXT NOT NULL,
    "stageKey" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailNotification_dedupeKey_key" ON "EmailNotification"("dedupeKey");
CREATE INDEX "EmailNotification_status_mode_nextAttemptAt_idx" ON "EmailNotification"("status", "mode", "nextAttemptAt");
ALTER TABLE "EmailNotification" ADD CONSTRAINT "EmailNotification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
