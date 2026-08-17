-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('skipped', 'pending', 'active', 'inProgress', 'completed');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('pending', 'inProgress', 'completed');

-- CreateEnum
CREATE TYPE "OverallStatus" AS ENUM ('new', 'inProgress', 'completed');

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "azureObjectId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'team_member',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "businessOwner" TEXT NOT NULL,
    "businessSponsor" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "arrangementType" TEXT NOT NULL,
    "businessLines" TEXT NOT NULL,
    "riskTier" TEXT,
    "criticality" TEXT,
    "facts" JSONB NOT NULL,
    "sharepointFolderUrl" TEXT,
    "tprmFileUrl" TEXT,
    "overallStatus" "OverallStatus" NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStage" (
    "id" SERIAL NOT NULL,
    "caseId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "seqOrder" INTEGER NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'pending',
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,

    CONSTRAINT "CaseStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAssessment" (
    "id" SERIAL NOT NULL,
    "caseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'pending',
    "fileUrl" TEXT,
    "applicable" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "CaseAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_teamId_key" ON "TeamMember"("userId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_azureObjectId_key" ON "User"("azureObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_caseNumber_key" ON "Case"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CaseStage_caseId_stageKey_key" ON "CaseStage"("caseId", "stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAssessment_caseId_key_key" ON "CaseAssessment"("caseId", "key");

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStage" ADD CONSTRAINT "CaseStage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssessment" ADD CONSTRAINT "CaseAssessment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
