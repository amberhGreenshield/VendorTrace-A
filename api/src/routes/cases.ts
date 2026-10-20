import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { parseTprmWorkbookBuffer, TprmParseError } from "../domain/tprmParser.js";
import { evaluateRules } from "../domain/rulesEngine.js";
import {
  activateReadySeqOrders,
  applyHierarchyEdit,
  buildCaseStages,
  cascadeAfterEdit,
  HierarchyEditError,
  HierarchyEditStage,
  isAdminAddedStage,
  isCaseFullyComplete,
} from "../domain/hierarchy.js";
import { assessmentChangesForHierarchyEdit, assessmentStatusChanges } from "../domain/caseEngine.js";
import { isCaseAdminEmail } from "../domain/adminAccess.js";
import { assessmentLabel, assessmentNote, createCaseFolder, ensureAssessmentDocument } from "../domain/sharepointService.js";
import { notifyCaseReadyForTeam } from "../domain/notificationService.js";
import { AssessmentKey, CaseStage, TEAM_LABELS, TeamKey } from "../domain/schema.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
export const casesRouter = Router();

/**
 * Emails every member of each team whose stage just became active. Teams are
 * stored under their display name ("Business Architecture"), while stages
 * carry the TeamKey ("BusinessArchitecture"), so this maps through
 * TEAM_LABELS. Failures are logged, never thrown — the stage transition
 * that triggered this has already been saved.
 */
async function notifyTeams(teamKeys: TeamKey[], caseNumber: string, vendorName: string): Promise<void> {
  await Promise.all(
    Array.from(new Set(teamKeys)).map(async (teamKey) => {
      try {
        const team = await prisma.team.findUnique({
          where: { name: TEAM_LABELS[teamKey] },
          include: { members: { include: { user: true } } },
        });
        const emails = team?.members.map((m: any) => m.user.email) ?? [];
        await notifyCaseReadyForTeam({ teamName: TEAM_LABELS[teamKey], teamMemberEmails: emails, caseNumber, vendorName });
      } catch (err) {
        console.error(`Failed to send notification for team ${teamKey}:`, err);
      }
    })
  );
}

/**
 * Brings each required assessment's status (PIA, DIA, UpGuard) in line with
 * where its owner team's review is — called after anything that moves stages.
 * This is what makes the business owner's "please complete a PIA" notice and
 * "Assessments To Be Completed" list clear once the review is done.
 */
async function syncAssessmentStatuses(caseId: string): Promise<void> {
  const [stages, assessments] = await Promise.all([
    prisma.caseStage.findMany({ where: { caseId } }),
    prisma.caseAssessment.findMany({ where: { caseId } }),
  ]);
  const changes = assessmentStatusChanges(stages as any, assessments as any);
  for (const ch of changes) {
    await prisma.caseAssessment.update({ where: { caseId_key: { caseId, key: ch.key } }, data: { status: ch.status } });
  }
}

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
      Array.from(evaluation.requiredAssessments) as AssessmentKey[],
      businessOwnerEmail,
      file.buffer
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

    // Notify whichever team(s) the case opens with (the admin inbox — fire-and-forget).
    const activeTeams = created.stages.filter((s: any) => s.status === "active").map((s: any) => s.team as TeamKey);
    await notifyTeams(activeTeams, created.caseNumber, created.vendorName);
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
  await syncAssessmentStatuses(req.params.id);
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

  await syncAssessmentStatuses(req.params.id);

  const overallStatus = isCaseFullyComplete(stageObjs as any) ? "completed" : "inProgress";
  const updated = await prisma.case.update({
    where: { id: req.params.id },
    data: { overallStatus },
    include: { stages: true, assessments: true },
  });

  // Email whichever team(s) the case just landed with. Failures here
  // shouldn't fail the request — the stage transition already succeeded.
  await notifyTeams(newlyActivatedTeams, updated.caseNumber, updated.vendorName);

  res.json(updated);
});

/**
 * PUT /api/cases/:id/hierarchy — an admin rearranges the review hierarchy.
 *
 * Body: {
 *   actingAdminEmail: string,
 *   stages: [{ stageKey?: string, team: TeamKey, label?: string, seqOrder: number }, ...]
 * }
 *
 * `stages` is the complete list of NOT-yet-started stages as the admin wants
 * them. Anything already active / in progress / completed is frozen and
 * carried over untouched. Editable stages left out of the list are removed
 * (rules-engine stages become "skipped"; admin-added ones are deleted).
 * Stages without a `stageKey` are new additions.
 *
 * Side effects, in order:
 *  1. Stages are rewritten and the cascade re-run — so if the case is past
 *     the admin inbox and a team is added to the current step, that team
 *     becomes active immediately and gets notified.
 *  2. Assessments follow their teams: adding Privacy makes the PIA required
 *     (and copies the PIA template into the case's SharePoint folder if Graph
 *     is configured); adding Data or AI does the same for the Data & AI
 *     Impact Assessment; removing the last owning team un-requires it.
 *  3. `hierarchyEditedAt/By` is stamped on the case so every view can show
 *     that the hierarchy was customized.
 */
casesRouter.put("/:id/hierarchy", async (req, res) => {
  const { actingAdminEmail, stages: edit, expectedUpdatedAt } = req.body as {
    actingAdminEmail?: string;
    stages?: HierarchyEditStage[];
    /** The case's updatedAt as the editor saw it. If it's changed since, the edit is rejected so it can't be applied to a hierarchy the admin hasn't seen. */
    expectedUpdatedAt?: string;
  };
  if (!actingAdminEmail) return res.status(400).json({ error: "actingAdminEmail is required" });
  if (!Array.isArray(edit)) return res.status(400).json({ error: "stages must be an array" });
  if (!(await isCaseAdminEmail(actingAdminEmail))) {
    return res.status(403).json({ error: "Only a case admin can change a review hierarchy." });
  }

  const existing = await prisma.case.findUnique({
    where: { id: req.params.id },
    include: { stages: true, assessments: true },
  });
  if (!existing) return res.status(404).json({ error: "Case not found" });
  if (existing.overallStatus === "completed") {
    return res.status(409).json({ error: "This case is already complete — its hierarchy can't be changed." });
  }
  if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
    return res.status(409).json({
      error: "This case changed while you were editing (a team may have started or finished a review). Load the latest version, then make your change again.",
      code: "STALE_CASE",
    });
  }

  const currentStages: CaseStage[] = existing.stages.map((s: (typeof existing.stages)[number]) => ({
    stageKey: s.stageKey,
    label: s.label,
    team: s.team as TeamKey,
    seqOrder: s.seqOrder,
    status: s.status as CaseStage["status"],
    activatedAt: s.activatedAt?.toISOString(),
    completedAt: s.completedAt?.toISOString(),
    completedBy: s.completedBy ?? undefined,
  }));

  let result;
  try {
    result = applyHierarchyEdit(currentStages, edit);
  } catch (err) {
    if (err instanceof HierarchyEditError) return res.status(422).json({ error: err.message });
    throw err;
  }

  // Re-run the cascade on the new shape. For a case still in the admin
  // inbox nothing changes (seq 0 is still active); for a case further along,
  // a team dropped into the current step becomes active right away, and if
  // the edit cleared the current step the case moves on to the next one.
  const newlyActivatedTeams = cascadeAfterEdit(currentStages, result.stages);

  const addedTeams = result.addedStageKeys
    .map((k) => result.stages.find((s) => s.stageKey === k)?.team)
    .filter((t): t is TeamKey => !!t);
  const removedTeams = result.removedStageKeys
    .map((k) => currentStages.find((s) => s.stageKey === k)?.team)
    .filter((t): t is TeamKey => !!t);
  const assessmentChanges = assessmentChangesForHierarchyEdit(result.stages, addedTeams, removedTeams);

  // Pull template documents into SharePoint for newly-required assessments
  // before the transaction, since Graph calls are slow and can fail.
  const newFileUrls = new Map<AssessmentKey, string | null>();
  for (const change of assessmentChanges) {
    if (!change.applicable) continue;
    const row = existing.assessments.find((a: any) => a.key === change.key);
    if (row?.fileUrl) continue;
    try {
      newFileUrls.set(change.key, await ensureAssessmentDocument(existing.vendorName, change.key));
    } catch (err) {
      console.error(`Could not copy the ${change.key} template into SharePoint for ${existing.caseNumber}:`, err);
      newFileUrls.set(change.key, null);
    }
  }

  const admin = await prisma.user.findUnique({ where: { email: actingAdminEmail.trim().toLowerCase() } });
  const keysAfter = new Set(result.stages.map((s) => s.stageKey));
  const deletedKeys = existing.stages
    .map((s: any) => s.stageKey as string)
    .filter((k: string) => !keysAfter.has(k) && isAdminAddedStage(k));

  await prisma.$transaction(async (tx: any) => {
    if (deletedKeys.length > 0) {
      await tx.caseStage.deleteMany({ where: { caseId: existing.id, stageKey: { in: deletedKeys } } });
    }
    for (const s of result.stages) {
      await tx.caseStage.upsert({
        where: { caseId_stageKey: { caseId: existing.id, stageKey: s.stageKey } },
        update: {
          label: s.label,
          seqOrder: s.seqOrder,
          status: s.status,
          activatedAt: s.activatedAt ? new Date(s.activatedAt) : null,
        },
        create: {
          caseId: existing.id,
          stageKey: s.stageKey,
          label: s.label,
          team: s.team,
          seqOrder: s.seqOrder,
          status: s.status,
          activatedAt: s.activatedAt ? new Date(s.activatedAt) : null,
        },
      });
    }
    for (const change of assessmentChanges) {
      const fileUrl = newFileUrls.get(change.key);
      const before = existing.assessments.find((a: any) => a.key === change.key);
      // Flag it only when the edit is what made it required. If the rules
      // engine already required it at intake, the BO knew from day one.
      const requiredByAdmin = change.applicable ? (before?.applicable ? !!before.requiredByAdmin : true) : false;
      await tx.caseAssessment.upsert({
        where: { caseId_key: { caseId: existing.id, key: change.key } },
        update: {
          applicable: change.applicable,
          requiredByAdmin,
          ...(fileUrl ? { fileUrl } : {}),
          ...(change.applicable ? { status: "pending" } : {}),
        },
        create: {
          caseId: existing.id,
          key: change.key,
          label: assessmentLabel(change.key),
          status: "pending",
          applicable: change.applicable,
          requiredByAdmin,
          fileUrl: fileUrl ?? null,
          note: assessmentNote(change.key) ?? null,
        },
      });
    }
    await tx.case.update({
      where: { id: existing.id },
      data: {
        overallStatus: isCaseFullyComplete(result.stages) ? "completed" : "inProgress",
        hierarchyEditedAt: new Date(),
        hierarchyEditedBy: admin?.name ?? actingAdminEmail,
      },
    });
    // Azure Postgres round-trips add up across ~15 upserts; the 5s default is too tight.
  }, { timeout: 20000, maxWait: 10000 });

  await syncAssessmentStatuses(existing.id);

  const updated = await prisma.case.findUnique({
    where: { id: existing.id },
    include: { stages: true, assessments: true },
  });
  res.json(updated);

  await notifyTeams(newlyActivatedTeams, existing.caseNumber, existing.vendorName);
});
