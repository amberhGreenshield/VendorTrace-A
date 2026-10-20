import { Case, CaseAssessment, CompletedForm, TEAM_LABELS } from "./schema";
import { currentTeamForCase, isAssessmentComplete } from "./caseEngine";

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
  return team ? `With ${TEAM_LABELS[team]}` : "Submitted";
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
