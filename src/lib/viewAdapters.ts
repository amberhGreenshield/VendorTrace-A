import { Case, CompletedForm, TeamKey, TEAM_LABELS } from "./schema";
import { nextReviewTeam, onboardingDurationDays } from "./caseEngine";
import { assessmentsToCompleteList, completedFormsAndAssessments, requiresUpGuard } from "./boViewHelpers";

/**
 * Which tab of a team's dashboard a case belongs in:
 *  - new / inProgress — it's this team's turn (not started / started)
 *  - upcoming         — this team is in the hierarchy but it hasn't reached them yet
 *  - completed        — this team's part is done
 *  - other            — open case this team isn't part of (view only, for visibility)
 * Re-derived from the live hierarchy every time, so when an admin adds a
 * team to a case it moves out of "other" on the next refresh by itself.
 */
export type LegacyStage = "new" | "inProgress" | "upcoming" | "completed" | "other";

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
  /** Team(s) holding the case right now, e.g. "PVM + Risk". */
  currentlyWith: string;
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

/** Team(s) the case is sitting with right now, e.g. "PVM + Business Architecture". */
export function currentlyWithLabel(c: Case): string {
  if (c.overallStatus === "completed") return "Completed";
  const teams = Array.from(new Set(c.stages.filter((s) => s.status === "active" || s.status === "inProgress").map((s) => TEAM_LABELS[s.team])));
  return teams.length ? teams.join(" + ") : "—";
}

/** True while the case is still waiting in the admin inbox (not released to any review team yet). */
export function isInAdminInbox(c: Case): boolean {
  return c.stages.some((s) => s.team === "Admin" && (s.status === "active" || s.status === "inProgress"));
}

/**
 * Every case a team should see on its dashboard, each tagged with the one
 * tab it belongs in. Cases still in the admin inbox are left out entirely —
 * the admin hasn't settled their hierarchy yet.
 */
export function casesForTeam(cases: Case[], team: TeamKey): TeamViewCase[] {
  const results: TeamViewCase[] = [];
  for (const c of cases) {
    if (isInAdminInbox(c)) continue;

    // A team can appear more than once if an admin added an extra review
    // (e.g. "Data (Additional Review)"). Precedence: the one in play now →
    // one still to come → the most recently finished one.
    const teamStages = c.stages.filter((s) => s.team === team && s.status !== "skipped");
    const current = teamStages.find((s) => s.status === "active" || s.status === "inProgress");
    const upcoming = teamStages.filter((s) => s.status === "pending").sort((a, b) => a.seqOrder - b.seqOrder)[0];
    const done = teamStages.filter((s) => s.status === "completed").sort((a, b) => b.seqOrder - a.seqOrder)[0];
    const stage = current ?? upcoming ?? done;

    let tab: LegacyStage;
    if (current) tab = current.status === "inProgress" ? "inProgress" : "new";
    else if (upcoming) tab = "upcoming";
    else if (done) tab = "completed";
    else if (c.overallStatus !== "completed") tab = "other";
    else continue; // finished case this team was never part of

    // Required assessments the BO still owes → "Required Assessments";
    // once the BO marks one complete (or its owning team finishes) it moves
    // to "Completed Forms / Assessments" for every team viewing the case.
    const ourAssessments = assessmentsToCompleteList(c);

    results.push({
      id: c.id,
      caseNumber: c.caseNumber,
      vendorName: c.vendorName,
      stage: tab,
      stageKey: stage?.stageKey ?? "",
      teamName: TEAM_LABELS[team],
      description: c.description,
      completedForms: completedFormsAndAssessments(c),
      ourAssessments,
      requiresUpGuard: requiresUpGuard(c),
      businessOwner: c.businessOwner,
      businessSponsor: c.businessSponsor,
      supplier: c.supplier,
      riskTier: c.riskTier,
      nextReview: nextReviewTeam(c),
      currentlyWith: currentlyWithLabel(c),
      onboardingDuration: onboardingDurationDays(c),
      raw: c,
    });
  }
  return results;
}
