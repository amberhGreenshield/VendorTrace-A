import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { parseTprmWorkbookBuffer, TprmParseError } from "../domain/tprmParser.js";
import { evaluateRules } from "../domain/rulesEngine.js";
import { activateReadySeqOrders, buildCaseStages, isCaseFullyComplete } from "../domain/hierarchy.js";
import { createCaseFolder } from "../domain/sharepointService.js";
import { enqueueNotifications } from "../domain/notificationService.js";
import { getNotificationConfig, toTeamKey } from "../domain/notificationConfig.js";
import { AssessmentKey } from "../domain/schema.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
export const casesRouter = Router();

async function nextCaseNumber(): Promise<string> {
  const latest = await prisma.case.findFirst({
    orderBy: { createdAt: "desc" },
    select: { caseNumber: true },
  });
  if (!latest?.caseNumber) return "#3000";
  const num = parseInt(latest.caseNumber.replace(/\D/g, ""), 10);
  return `#${(isNaN(num) ? 3000 : num) + 1}`;
}

casesRouter.get("/", async (req, res) => {
  const { team, businessOwner } = req.query;
  const cases = await prisma.case.findMany({
    where: businessOwner ? { businessOwner: String(businessOwner) } : undefined,
    include: { stages: true, assessments: true },
    orderBy: { createdAt: "desc" },
  });
  const filtered = team
    ? cases.filter((c) => c.stages.some((s) => s.team === team))
    : cases;
  res.json(filtered);
});

casesRouter.get("/:id", async (req, res) => {
  const c = await prisma.case.findUnique({
    where: { id: req.params.id },
    include: { stages: true, assessments: true },
  });
  if (!c) return res.status(404).json({ error: "Case not found" });
  res.json(c);
});

/** Server re-parses the workbook and runs authoritative routing rules. */
casesRouter.post("/", upload.single("tprmFile"), async (req, res) => {
  const file = req.file;
  const businessOwner = req.body.businessOwner as string | undefined;
  const businessOwnerEmail = req.body.businessOwnerEmail as string | undefined;
  if (!file) return res.status(400).json({ error: "tprmFile is required (multipart/form-data)" });
  if (!businessOwner) return res.status(400).json({ error: "businessOwner is required" });

  try {
    const config = getNotificationConfig();
    const facts = parseTprmWorkbookBuffer(file.buffer);
    const evaluation = evaluateRules(facts);
    const stages = buildCaseStages(evaluation);
    const folder = await createCaseFolder(
      facts.legalName,
      Array.from(evaluation.requiredAssessments) as AssessmentKey[],
      businessOwnerEmail,
      file.buffer,
    );
    const firstActive = stages.find((s) => s.status === "active");
    const caseNumber = await nextCaseNumber();
    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.case.create({
        data: {
          caseNumber,
          vendorName: facts.legalName,
          description: facts.description,
          businessOwner,
          businessSponsor: facts.contractOwner,
          supplier: facts.legalName,
          arrangementType: facts.arrangementType,
          businessLines: facts.businessLines,
          riskTier: facts.riskTier ?? null,
          criticality: facts.criticality ?? null,
          facts: facts as any,
          sharepointFolderUrl: folder.folderUrl,
          tprmFileUrl: folder.tprmFileUrl,
          overallStatus: firstActive ? "inProgress" : "new",
          stages: {
            create: stages.map((s) => ({
              stageKey: s.stageKey,
              label: s.label,
              team: s.team,
              seqOrder: s.seqOrder,
              status: s.status,
              activatedAt: s.activatedAt ? new Date(s.activatedAt) : null,
            })),
          },
          assessments: {
            create: folder.assessments.map((a) => ({
              key: a.key,
              label: a.label,
              status: a.status,
              fileUrl: a.fileUrl,
              applicable: a.applicable,
            })),
          },
        },
        include: { stages: true, assessments: true },
      });
      await enqueueNotifications(
        tx, record, record.stages.filter((s) => s.status === "active"),
        evaluation.requiredAssessments.has("UpguardAssessment"), config,
      );
      return record;
    });
    // Durable jobs are already committed; email provider outages cannot break this response.
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof TprmParseError) return res.status(422).json({ error: err.message });
    console.error("Failed to create case:", err instanceof Error ? err.name : "Unknown error");
    res.status(500).json({ error: "Failed to create case" });
  }
});

casesRouter.post("/:id/stages/:stageKey/start", async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const stage = await tx.caseStage.findFirst({
        where: { caseId: req.params.id, stageKey: req.params.stageKey },
      });
      if (!stage) return { error: "Stage not found", status: 404 } as const;
      if (stage.status !== "active") return { error: `Stage is "${stage.status}", not active`, status: 409 } as const;
      await tx.caseStage.update({ where: { id: stage.id }, data: { status: "inProgress" } });
      const updated = await tx.case.update({
        where: { id: req.params.id },
        data: { overallStatus: "inProgress" },
        include: { stages: true, assessments: true },
      });
      return { updated } as const;
    });
    if (result.status !== undefined) return res.status(result.status).json({ error: result.error });
    res.json(result.updated);
  } catch {
    res.status(500).json({ error: "Failed to start stage" });
  }
});

casesRouter.post("/:id/stages/:stageKey/complete", async (req, res) => {
  const { completedBy } = req.body as { completedBy?: string };
  if (!completedBy) return res.status(400).json({ error: "completedBy is required" });
  try {
    const config = getNotificationConfig();
    const result = await prisma.$transaction(async (tx) => {
      // Serialize transitions for one case so parallel reviewers activate/notify the next stage only once.
      await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${req.params.id} FOR UPDATE`;
      const stage = await tx.caseStage.findFirst({
        where: { caseId: req.params.id, stageKey: req.params.stageKey },
      });
      if (!stage) return { error: "Stage not found", status: 404 } as const;
      if (stage.status !== "inProgress" && stage.status !== "active") {
        return { error: `Stage is "${stage.status}", can't be completed`, status: 409 } as const;
      }
      await tx.caseStage.update({
        where: { id: stage.id },
        data: { status: "completed", completedAt: new Date(), completedBy },
      });
      const allStages = await tx.caseStage.findMany({ where: { caseId: req.params.id } });
      const stageObjs = allStages.map((s) => ({
        ...s,
        team: toTeamKey(s.team),
        activatedAt: s.activatedAt?.toISOString(),
        completedAt: s.completedAt?.toISOString(),
        completedBy: s.completedBy ?? undefined,
      }));
      const statusesBefore = new Map(stageObjs.map((s) => [s.stageKey, s.status]));
      activateReadySeqOrders(stageObjs);
      const newlyActivated = stageObjs.filter((s) => statusesBefore.get(s.stageKey) === "pending" && s.status === "active");
      for (const s of newlyActivated) {
        await tx.caseStage.update({
          where: { id: s.id },
          data: { status: s.status, activatedAt: s.activatedAt ? new Date(s.activatedAt) : undefined },
        });
      }
      const updated = await tx.case.update({
        where: { id: req.params.id },
        data: { overallStatus: isCaseFullyComplete(stageObjs) ? "completed" : "inProgress" },
        include: { stages: true, assessments: true },
      });
      // UpGuard setup is a creation-only event, never repeated on normal handoffs.
      await enqueueNotifications(tx, updated, newlyActivated, false, config);
      return { updated } as const;
    });
    if (result.status !== undefined) return res.status(result.status).json({ error: result.error });
    res.json(result.updated);
  } catch {
    console.error("Case transition failed; transaction rolled back.");
    res.status(500).json({ error: "Failed to complete stage" });
  }
});
