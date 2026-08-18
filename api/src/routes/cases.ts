import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { parseTprmWorkbookBuffer, TprmParseError } from "../domain/tprmParser.js";
import { evaluateRules } from "../domain/rulesEngine.js";
import { buildCaseStages } from "../domain/hierarchy.js";
import { createCaseFolder } from "../domain/sharepointService.js";
import { notifyCaseReadyForTeam } from "../domain/notificationService.js";
import { AssessmentKey, TEAM_LABELS, TeamKey } from "../domain/schema.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
export const casesRouter = Router();

/** Always reads the DB to find the next safe case number — no in-memory counter that resets on restart. */
async function nextCaseNumber(): Promise<string> {
  const latest = await prisma.case.findFirst({
    orderBy: { createdAt: "desc" },
    select: { caseNumber: true },
  });
  if (!latest?.caseNumber) return "#3000";
  const num = parseInt(latest.caseNumber.replace(/\D/g, ""), 10);
  return `#${(isNaN(num) ? 3000 : num) + 1}`;
}

// GET /api/cases — all cases (optionally filter by team or businessOwner)
casesRouter.get("/", async (req, res) => {
  const { team, businessOwner } = req.query;
  const cases = await prisma.case.findMany({
    where: businessOwner ? { businessOwner: String(businessOwner) } : undefined,
    include: { stages: true, assessments: true },
    orderBy: { createdAt: "desc" },
  });

  const filtered = team
    ? cases.filter((c: (typeof cases)[number]) => c.stages.some((s: (typeof cases)[number]["stages"][number]) => s.team === team))
    : cases;

  res.json(filtered);
});

// GET /api/cases/:id
casesRouter.get("/:id", async (req, res) => {
  const c = await prisma.case.findUnique({
    where: { id: req.params.id },
    include: { stages: true, assessments: true },
  });
  if (!c) return res.status(404).json({ error: "Case not found" });
  res.json(c);
});

/**
 * POST /api/cases — create a case from an uploaded TPRM workbook.
 * This is the AUTHORITATIVE creation path: even though the frontend runs
 * its own copy of the parser/rules for instant preview, we re-run
 * everything here so a tampered client request can't create a bogus case.
 */
casesRouter.post("/", upload.single("tprmFile"), async (req, res) => {
  const file = req.file;
  const businessOwner = req.body.businessOwner as string | undefined;
  const businessOwnerEmail = req.body.businessOwnerEmail as string | undefined;
  if (!file) return res.status(400).json({ error: "tprmFile is required (multipart/form-data)" });
  if (!businessOwner) return res.status(400).json({ error: "businessOwner is required" });

  try {
    const facts = parseTprmWorkbookBuffer(file.buffer);
    const evaluation = evaluateRules(facts);
    const stages = buildCaseStages(evaluation);
    const folder = await createCaseFolder(
      facts.legalName,
      file.originalname,
      Array.from(evaluation.requiredAssessments) as AssessmentKey[],
      businessOwnerEmail
    );

    const firstActive = stages.find((s) => s.status === "active");
    const caseNumber = await nextCaseNumber();

    const created = await prisma.case.create({
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

    res.status(201).json(created);

    // Notify whichever team(s) the case opens with (PVM, Business Architecture, Risk — fire-and-forget).
    const activeStages = created.stages.filter((s: any) => s.status === "active");
    await Promise.all(
      activeStages.map(async (s: any) => {
        try {
          const team = await prisma.team.findUnique({
            where: { name: s.team },
            include: { members: { include: { user: true } } },
          });
          const emails = team?.members.map((m: any) => m.user.email) ?? [];
          await notifyCaseReadyForTeam({
            teamName: s.team,
            teamMemberEmails: emails,
            caseNumber: created.caseNumber,
            vendorName: created.vendorName,
          });
        } catch (err) {
          console.error(`Failed to send notification for team ${s.team}:`, err);
        }
      })
    );
  } catch (err) {
    if (err instanceof TprmParseError) return res.status(422).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Failed to create case" });
  }
});

// POST /api/cases/:id/stages/:stageKey/start
casesRouter.post("/:id/stages/:stageKey/start", async (req, res) => {
  const stage = await prisma.caseStage.findFirst({
    where: { caseId: req.params.id, stageKey: req.params.stageKey },
  });
  if (!stage) return res.status(404).json({ error: "Stage not found" });
  if (stage.status !== "active") return res.status(409).json({ error: `Stage is "${stage.status}", not active` });

  await prisma.caseStage.update({ where: { id: stage.id }, data: { status: "inProgress" } });
  const updated = await prisma.case.update({
    where: { id: req.params.id },
    data: { overallStatus: "inProgress" },
    include: { stages: true, assessments: true },
  });
  res.json(updated);
});

// POST /api/cases/:id/stages/:stageKey/complete  { completedBy: string }
casesRouter.post("/:id/stages/:stageKey/complete", async (req, res) => {
  const { completedBy } = req.body as { completedBy?: string };
  if (!completedBy) return res.status(400).json({ error: "completedBy is required" });

  const stage = await prisma.caseStage.findFirst({
    where: { caseId: req.params.id, stageKey: req.params.stageKey },
  });
  if (!stage) return res.status(404).json({ error: "Stage not found" });
  if (stage.status !== "inProgress" && stage.status !== "active") {
    return res.status(409).json({ error: `Stage is "${stage.status}", can't be completed` });
  }

  await prisma.caseStage.update({
    where: { id: stage.id },
    data: { status: "completed", completedAt: new Date(), completedBy },
  });

  // Re-run the cascade: activate whatever seqOrder is ready next.
  const allStages = await prisma.caseStage.findMany({ where: { caseId: req.params.id } });
  const { activateReadySeqOrders, isCaseFullyComplete } = await import("../domain/hierarchy.js");
  const stageObjs = allStages.map((s: (typeof allStages)[number]) => ({ ...s, status: s.status as any }));
  const statusesBefore = new Map(stageObjs.map((s: any) => [s.stageKey, s.status]));
  activateReadySeqOrders(stageObjs as any);
  const newlyActivatedTeams = stageObjs
    .filter((s: any) => statusesBefore.get(s.stageKey) === "pending" && s.status === "active")
    .map((s: any) => s.team as TeamKey);

  await Promise.all(
    stageObjs.map((s: (typeof stageObjs)[number]) =>
      prisma.caseStage.update({
        where: { id: (s as any).id },
        data: { status: s.status, activatedAt: s.activatedAt ? new Date(s.activatedAt as any) : undefined },
      })
    )
  );

  const overallStatus = isCaseFullyComplete(stageObjs as any) ? "completed" : "inProgress";
  const updated = await prisma.case.update({
    where: { id: req.params.id },
    data: { overallStatus },
    include: { stages: true, assessments: true },
  });

  // Email whichever team(s) the case just landed with. Failures here
  // shouldn't fail the request — the stage transition already succeeded.
  await Promise.all(
    newlyActivatedTeams.map(async (teamKey: TeamKey) => {
      try {
        const team = await prisma.team.findUnique({
          where: { name: TEAM_LABELS[teamKey] },
          include: { members: { include: { user: true } } },
        });
        const emails = team?.members.map((m: any) => m.user.email) ?? [];
        await notifyCaseReadyForTeam({
          teamName: TEAM_LABELS[teamKey],
          teamMemberEmails: emails,
          caseNumber: updated.caseNumber,
          vendorName: updated.vendorName,
        });
      } catch (err) {
        console.error(`Failed to send notification for team ${teamKey}:`, err);
      }
    })
  );

  res.json(updated);
});
