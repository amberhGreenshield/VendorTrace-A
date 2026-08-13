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
   * PIA + Data & AI Impact Assessment links for this case, always present
   * (even when not applicable/required) so any team can open the live
   * SharePoint document, not just the team that owns it.
   */
  ourAssessments: CompletedForm[];
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

    // Every team gets links to both assessments, whether or not they own
    // them, so anyone reviewing a case can see the PIA / Data & AI Impact
    // Assessment status in real time — even if it's still blank because
    // this case doesn't require it.
    const ourAssessments = c.assessments.map((a) => ({
      id: a.key,
      label: a.label,
      fileUrl: a.fileUrl,
      note: a.applicable ? undefined : "Not required for this case — shown for visibility",
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
