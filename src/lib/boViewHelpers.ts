import { Case, CompletedForm, TEAM_LABELS } from "./schema";
import { currentTeamForCase } from "./caseEngine";

export function currentStateLabel(c: Case): string {
  if (c.overallStatus === "completed") return "Completed";
  const team = currentTeamForCase(c);
  return team ? `With ${TEAM_LABELS[team]}` : "Submitted";
}

export function assessmentsToCompleteList(c: Case): CompletedForm[] {
  return c.assessments
    .filter((a) => a.applicable && a.status !== "completed")
    .map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl }));
}

export function completedFormsAndAssessments(c: Case): CompletedForm[] {
  const completedAssessments = c.assessments
    .filter((a) => a.status === "completed")
    .map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl }));
  return [...c.completedForms, ...completedAssessments];
}

/** PIA / Data & AI links that aren't required for this case — kept visible as reference links rather than hidden. */
export function notApplicableAssessments(c: Case): CompletedForm[] {
  return c.assessments
    .filter((a) => !a.applicable)
    .map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl, note: "Not required for this case — shown for visibility" }));
}
