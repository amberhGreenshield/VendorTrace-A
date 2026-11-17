import { Case, CaseAssessment, CompletedForm, TEAM_LABELS } from "./schema";
import { currentTeamForCase, isAssessmentComplete } from "./caseEngine";
import { ADMIN_STAGE_KEY } from "./hierarchy";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the business owner was asked to complete it, if known. */
export function daysOutstanding(a: CaseAssessment, now = Date.now()): number | undefined {
  if (!a.requiredSince) return undefined;
  const t = new Date(a.requiredSince).getTime();
  return Number.isNaN(t) ? undefined : Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** Small line under a completed assessment, e.g. "Marked complete by Jordan Blake · Oct 20". */
export function completionNote(a: CaseAssessment): string | undefined {
  if (a.boCompletedAt) {
    const when = new Date(a.boCompletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `Marked complete by ${a.boCompletedBy ?? "the business owner"} · ${when}`;
  }
  if (a.status === "completed") return "Review completed by the owning team";
  return undefined;
}

/** Required assessments that are done (BO marked complete, or the owning team finished) — shown in every view's completed section. */
export function completedAssessments(c: Case): CompletedForm[] {
  return c.assessments
    .filter((a) => a.applicable && isAssessmentComplete(a))
    .map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl, note: completionNote(a) }));
}

/** Required assessments still waiting on the business owner. */
export function outstandingAssessments(c: Case): CaseAssessment[] {
  return c.assessments.filter((a) => a.applicable && !isAssessmentComplete(a));
}

export function currentStateLabel(c: Case): string {
  if (c.overallStatus === "completed") return "Completed";
  const team = currentTeamForCase(c);
  if (!team) return "Submitted";
  // Teams in the same step review in parallel — name all of them that still have it.
  const current = c.stages.find((s) => s.status === "active" || s.status === "inProgress")!;
  const together = c.stages
    .filter((s) => s.seqOrder === current.seqOrder && (s.status === "active" || s.status === "inProgress"))
    .map((s) => TEAM_LABELS[s.team]);
  return `With ${Array.from(new Set(together)).join(" + ")}`;
}

/** Only assessments that are actually required for this case and not yet done. */
export function assessmentsToCompleteList(c: Case): CompletedForm[] {
  return outstandingAssessments(c).map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl, note: a.note }));
}

/**
 * @deprecated Returns [] — non-applicable assessments are now hidden entirely.
 * Kept for backward compatibility while older files are being replaced.
 */
export function notApplicableAssessments(_c: Case): CompletedForm[] {
  return [];
}

export function completedFormsAndAssessments(c: Case): CompletedForm[] {
  return [...c.completedForms, ...completedAssessments(c)];
}

/** True while this case needs an UpGuard assessment that isn't done yet (drives the "contact Security Governance" notice). */
export function requiresUpGuard(c: Case): boolean {
  if (!c.stages.some((s) => s.team === "SecurityGovernance" && s.status !== "skipped")) return false;
  const upguard = c.assessments.find((a) => a.key === "UpguardAssessment");
  return !upguard || !isAssessmentComplete(upguard);
}

/**
 * Which Business Owner tab a case belongs in. "New" = submitted and still
 * waiting for the case admin's check (no review team has it yet), so a case
 * the BO has just created shows up there instead of disappearing.
 */
export function boCaseBucket(c: Case): "new" | "inProgress" | "completed" {
  if (c.overallStatus === "completed") return "completed";
  if (c.overallStatus === "new") return "new";
  const admin = c.stages.find((s) => s.stageKey === ADMIN_STAGE_KEY);
  return admin && (admin.status === "active" || admin.status === "inProgress") ? "new" : "inProgress";
}
