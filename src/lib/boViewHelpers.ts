import { Case, CompletedForm, TEAM_LABELS } from "./schema";
import { currentTeamForCase } from "./caseEngine";

export function currentStateLabel(c: Case): string {
  if (c.overallStatus === "completed") return "Completed";
  const team = currentTeamForCase(c);
  return team ? `With ${TEAM_LABELS[team]}` : "Submitted";
}

/** Only assessments that are actually required for this case and not yet done. */
export function assessmentsToCompleteList(c: Case): CompletedForm[] {
  return c.assessments
    .filter((a) => a.applicable && a.status !== "completed")
    .map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl }));
}

/**
 * @deprecated Returns [] — non-applicable assessments are now hidden entirely.
 * Kept for backward compatibility while older files are being replaced.
 */
export function notApplicableAssessments(_c: Case): CompletedForm[] {
  return [];
}

export function completedFormsAndAssessments(c: Case): CompletedForm[] {
  const completedAssessments = c.assessments
    .filter((a) => a.applicable && a.status === "completed")
    .map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl }));
  return [...c.completedForms, ...completedAssessments];
}

/** Returns true if this case requires a Security Governance / UpGuard assessment. */
export function requiresUpGuard(c: Case): boolean {
  return c.stages.some((s) => s.team === "SecurityGovernance");
}
