-- AlterTable: where to send business-owner reminders.
ALTER TABLE "Case" ADD COLUMN     "businessOwnerEmail" TEXT;

-- AlterTable: BO completion + reminder tracking on assessments.
ALTER TABLE "CaseAssessment" ADD COLUMN     "requiredSince" TIMESTAMP(3),
ADD COLUMN     "boCompletedAt" TIMESTAMP(3),
ADD COLUMN     "boCompletedBy" TEXT,
ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: start the 7-day reminder clock for already-required assessments
-- at deploy time (not at case creation), so existing business owners aren't
-- all emailed the moment this ships.
UPDATE "CaseAssessment" SET "requiredSince" = NOW() WHERE "applicable" = true;

-- Backfill BO emails for existing cases, only where exactly one user has
-- that name (names aren't unique, so ambiguous matches are left empty).
UPDATE "Case" c
SET "businessOwnerEmail" = (SELECT u."email" FROM "User" u WHERE u."name" = c."businessOwner")
WHERE c."businessOwnerEmail" IS NULL
  AND (SELECT COUNT(*) FROM "User" u WHERE u."name" = c."businessOwner") = 1;
