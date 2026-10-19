-- AlterTable: record when/by whom an admin customized a case's review hierarchy.
ALTER TABLE "Case" ADD COLUMN     "hierarchyEditedAt" TIMESTAMP(3),
ADD COLUMN     "hierarchyEditedBy" TEXT;

-- AlterTable: flag assessments that became required because an admin changed the hierarchy.
ALTER TABLE "CaseAssessment" ADD COLUMN     "requiredByAdmin" BOOLEAN NOT NULL DEFAULT false;

-- The "Admin" review team (first stop for every new case). Idempotent so it
-- is safe whether or not prisma/seed.ts has already run.
INSERT INTO "Team" ("name") VALUES ('Admin') ON CONFLICT ("name") DO NOTHING;
