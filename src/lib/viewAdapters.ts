import { Case, CompletedForm, TeamKey, TEAM_LABELS } from "./schema";
import { nextReviewTeam, onboardingDurationDays } from "./caseEngine";

export type LegacyStage = "new" | "inProgress" | "completed";

export interface TeamViewCase {
  id: string;
  caseNumber: string;
  vendorName: string;
  /** This team's own stage status, mapped onto the legacy new/inProgress/completed labels used by the dashboard tabs. */
  stage: LegacyStage;
  stageKey: string;
  teamName: string;
  description?: string;
  completedForms: CompletedForm[];
  /**
   * Only assessments that are actually required (applicable) for this case.
   * Non-applicable assessments are hidden — they are not required and showing
   * them as links causes confusion.
   */
  ourAssessments: CompletedForm[];
  /** True if the case triggered the Security Governance team (UpGuard required). */
  requiresUpGuard: boolean;
  businessOwner?: string;
  businessSponsor?: string;
  supplier?: string;
  riskTier?: string;
  nextReview?: string;
  onboardingDuration?: string;
  raw: Case;
}

/** Maps the display name stored on the logged-in user's team (from mockApi) to a TeamKey. */
const LABEL_TO_TEAM_KEY: Record<string, TeamKey> = Object.fromEntries(
  Object.entries(TEAM_LABELS).map(([key, label]) => [label, key as TeamKey])
) as Record<string, TeamKey>;

export function teamKeyFromLabel(label?: string): TeamKey | undefined {
  if (!label) return undefined;
  return LABEL_TO_TEAM_KEY[label];
}

/** Cases relevant to a team right now: their stage is active, in progress, or already completed (for the Completed tab). Pending/skipped stages aren't this team's concern yet. */
export function casesForTeam(cases: Case[], team: TeamKey): TeamViewCase[] {
  const results: TeamViewCase[] = [];
  for (const c of cases) {
    const stage = c.stages.find((s) => s.team === team);
    if (!stage) continue;
    if (stage.status === "pending" || stage.status === "skipped") continue;

    const legacyStage: LegacyStage =
      stage.status === "completed" ? "completed" : stage.status === "inProgress" ? "inProgress" : "new";

    // Only show assessments that are actually required for this case.
    // Non-applicable assessments are hidden to avoid confusion.
    const ourAssessments = c.assessments
      .filter((a) => a.applicable)
      .map((a) => ({
        id: a.key,
        label: a.label,
        fileUrl: a.fileUrl,
      }));

    results.push({
      id: c.id,
      caseNumber: c.caseNumber,
      vendorName: c.vendorName,
      stage: legacyStage,
      stageKey: stage.stageKey,
      teamName: TEAM_LABELS[team],
      description: c.description,
      completedForms: c.completedForms,
      ourAssessments,
      requiresUpGuard: c.stages.some((s) => s.team === "SecurityGovernance"),
      businessOwner: c.businessOwner,
      businessSponsor: c.businessSponsor,
      supplier: c.supplier,
      riskTier: c.riskTier,
      nextReview: nextReviewTeam(c),
      onboardingDuration: onboardingDurationDays(c),
      raw: c,
    });
  }
  return results;
}
