import { AssessmentKey, Case, TeamKey, TEAM_LABELS } from "./schema";
import { activateReadySeqOrders, isCaseFullyComplete } from "./hierarchy";

/** Which team(s) are responsible for each assessment, used to decide when it flips to "completed". */
const ASSESSMENT_OWNER_TEAMS: Record<AssessmentKey, TeamKey[]> = {
  PIA: ["Privacy"],
  DataAIImpactAssessment: ["Data", "AI"],
  UpguardAssessment: ["SecurityGovernance"],
};

function refreshAssessmentStatuses(caseRecord: Case): void {
  for (const assessment of caseRecord.assessments) {
    // Not required by this case's TPRM answers — leave it as a blank
    // reference link forever, never let a skipped owner stage flip it to
    // "completed".
    if (!assessment.applicable) continue;

    const ownerTeams = ASSESSMENT_OWNER_TEAMS[assessment.key];
    const ownerStages = caseRecord.stages.filter((s) => ownerTeams.includes(s.team));
    if (ownerStages.length === 0) continue;

    const anyInProgress = ownerStages.some((s) => s.status === "inProgress" || s.status === "active");
    const allResolved = ownerStages.every((s) => s.status === "completed" || s.status === "skipped");

    if (allResolved) assessment.status = "completed";
    else if (anyInProgress) assessment.status = "inProgress";
  }
}

function refreshOverallStatus(caseRecord: Case): void {
  if (isCaseFullyComplete(caseRecord.stages)) {
    caseRecord.overallStatus = "completed";
  } else {
    const anyStarted = caseRecord.stages.some((s) => s.status !== "pending" && s.status !== "skipped");
    caseRecord.overallStatus = anyStarted ? "inProgress" : "new";
  }
}

/** Team member clicks "Start" on a case that's their turn. */
export function startStage(caseRecord: Case, stageKey: string): Case {
  const updated: Case = structuredClone(caseRecord);
  const stage = updated.stages.find((s) => s.stageKey === stageKey);
  if (!stage || stage.status !== "active") return updated;
  stage.status = "inProgress";
  refreshAssessmentStatuses(updated);
  refreshOverallStatus(updated);
  return updated;
}

/**
 * Team member confirms completion (after the second-validation modal).
 * Marks the stage complete, then cascades: activates the next seqOrder
 * (skipping any team not triggered), and re-derives assessment/case status.
 *
 * Note: completing a stage only advances the *hierarchy* — it does not lock
 * anyone out of SharePoint. The case's assessment/document links stay live
 * on every case the team can still see (including their own Completed tab),
 * so a team can always go back and make changes in SharePoint after handing
 * a case off.
 */
export function completeStage(caseRecord: Case, stageKey: string, completedBy: string): Case {
  const updated: Case = structuredClone(caseRecord);
  const stage = updated.stages.find((s) => s.stageKey === stageKey);
  if (!stage || (stage.status !== "inProgress" && stage.status !== "active")) return updated;

  stage.status = "completed";
  stage.completedAt = new Date().toISOString();
  stage.completedBy = completedBy;

  activateReadySeqOrders(updated.stages);
  refreshAssessmentStatuses(updated);
  refreshOverallStatus(updated);
  return updated;
}

/** Cases where it's currently this team's turn (active) or they've started (inProgress). */
export function stagesForTeam(caseRecord: Case, team: TeamKey) {
  return caseRecord.stages.filter((s) => s.team === team);
}

export function currentTeamForCase(caseRecord: Case): TeamKey | undefined {
  const active = caseRecord.stages.find((s) => s.status === "active" || s.status === "inProgress");
  return active?.team;
}

/**
 * "Next Review" as a plain team name (e.g. "Risk", "Privacy") — this is the
 * team (or teams, if the next step runs in parallel) that will pick the
 * case up *after* whichever stage is currently active/in progress, i.e.
 * the next stop in the hierarchy sequence rather than the current one.
 */
export function nextReviewTeam(caseRecord: Case): string {
  if (isCaseFullyComplete(caseRecord.stages)) return "Completed";

  const seqOrders = Array.from(new Set(caseRecord.stages.map((s) => s.seqOrder))).sort((a, b) => a - b);

  // The seqOrder currently in play (active/inProgress), if any. Everything
  // at or before this seqOrder is either done, skipped, or already the
  // "current" stop — not the "next" one.
  const activeStage = caseRecord.stages.find((s) => s.status === "active" || s.status === "inProgress");
  const currentSeq = activeStage?.seqOrder;
  const upcomingSeqs = currentSeq !== undefined ? seqOrders.filter((seq) => seq > currentSeq) : seqOrders;

  for (const seq of upcomingSeqs) {
    const teamsAtSeq = Array.from(
      new Set(
        caseRecord.stages
          .filter((s) => s.seqOrder === seq && s.status !== "skipped" && s.status !== "completed")
          .map((s) => s.team)
      )
    );
    if (teamsAtSeq.length > 0) {
      return teamsAtSeq.map((t) => TEAM_LABELS[t]).join(" + ");
    }
  }

  return "—";
}

/** Days since the Business Owner uploaded the TPRM workbook and the case was created. */
export function onboardingDurationDays(caseRecord: Case): string {
  const createdMs = new Date(caseRecord.createdAt).getTime();
  if (Number.isNaN(createdMs)) return "—";
  const days = Math.max(0, Math.floor((Date.now() - createdMs) / (1000 * 60 * 60 * 24)));
  return `${days} day${days === 1 ? "" : "s"}`;
}
