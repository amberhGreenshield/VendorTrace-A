-- AlterTable: record when/by whom an admin customized a case's review hierarchy.
ALTER TABLE "Case" ADD COLUMN     "hierarchyEditedAt" TIMESTAMP(3),
ADD COLUMN     "hierarchyEditedBy" TEXT;

-- The "Admin" review team (first stop for every new case). Idempotent so it
-- is safe whether or not prisma/seed.ts has already run.
INSERT INTO "Team" ("name") VALUES ('Admin') ON CONFLICT ("name") DO NOTHING;
