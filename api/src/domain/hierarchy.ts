import { CaseStage, StageDefinition, TeamKey, TEAM_LABELS } from "./schema.js";
import { RuleEvaluation } from "./rulesEngine.js";

// ─── Hierarchy ──────────────────────────────────────────────────────────────
// Order taken directly from the "Rules Engine" flow diagram, updated so the
// case opens with all three of its always-required first-line reviewers at
// once instead of routing through Risk afterwards:
//   1. PVM + Business Architecture + Risk (Initial Review) — parallel, always
//   2. Privacy (conditional)
//   3. Data + AI (parallel, conditional)
//   4. Security Governance (conditional — UpGuard questionnaire)
//   5. Security Architecture (conditional)
//   6. Enterprise Architecture (always)
//   7. Risk (Sign-off) — always. Completing this closes the case.
//
// The diagram's final row (Privacy/InfoSec/BCM, PVM, Legal → Accounts
// Payable) is intentionally NOT modeled here — per your note it isn't part
// of the web app. Risk sign-off is the last stage; completing it marks the
// case "completed".

export const STAGE_DEFINITIONS: StageDefinition[] = [
  { key: "pvm-intake", label: "PVM", team: "PVM", seqOrder: 1, alwaysRequired: true },
  { key: "business-architecture", label: "Business Architecture", team: "BusinessArchitecture", seqOrder: 1, alwaysRequired: true },
  { key: "risk-initial", label: "Risk (Initial Review)", team: "Risk", seqOrder: 1, alwaysRequired: true },
  { key: "privacy", label: "Privacy", team: "Privacy", seqOrder: 2, alwaysRequired: false },
  { key: "data", label: "Data", team: "Data", seqOrder: 3, alwaysRequired: false },
  { key: "ai", label: "AI", team: "AI", seqOrder: 3, alwaysRequired: false },
  { key: "security-governance", label: "Security Governance", team: "SecurityGovernance", seqOrder: 4, alwaysRequired: false },
  { key: "security-architecture", label: "Security Architecture", team: "SecurityArchitecture", seqOrder: 5, alwaysRequired: false },
  { key: "enterprise-architecture", label: "Enterprise Architecture", team: "EnterpriseArchitecture", seqOrder: 6, alwaysRequired: true },
  { key: "risk-signoff", label: "Risk (Sign-off)", team: "Risk", seqOrder: 7, alwaysRequired: true },
];

function isTriggered(def: StageDefinition, triggeredTeams: Set<TeamKey>): boolean {
  return def.alwaysRequired || triggeredTeams.has(def.team);
}

/** Builds the full stage list for a new case and activates seqOrder 1. */
export function buildCaseStages(evaluation: RuleEvaluation): CaseStage[] {
  const stages: CaseStage[] = STAGE_DEFINITIONS.map((def) => ({
    stageKey: def.key,
    label: def.label,
    team: def.team,
    seqOrder: def.seqOrder,
    status: isTriggered(def, evaluation.triggeredTeams) ? "pending" : "skipped",
  }));
  activateReadySeqOrders(stages);
  return stages;
}

/**
 * Activates any seqOrder whose predecessor seqOrder is fully resolved
 * (every stage in it is completed or skipped), cascading through
 * fully-skipped seqOrders until it finds one with real work to do, or the
 * end of the list.
 */
export function activateReadySeqOrders(stages: CaseStage[]): void {
  const seqOrders = Array.from(new Set(stages.map((s) => s.seqOrder))).sort((a, b) => a - b);

  for (const seq of seqOrders) {
    const stagesAtSeq = stages.filter((s) => s.seqOrder === seq);
    const priorSeqs = seqOrders.filter((s) => s < seq);
    const priorResolved = priorSeqs.every((priorSeq) =>
      stages.filter((s) => s.seqOrder === priorSeq).every((s) => s.status === "completed" || s.status === "skipped")
    );
    if (!priorResolved) continue;

    for (const stage of stagesAtSeq) {
      if (stage.status === "pending") {
        stage.status = "active";
        stage.activatedAt = new Date().toISOString();
      }
    }
  }
}

export function isCaseFullyComplete(stages: CaseStage[]): boolean {
  return stages.every((s) => s.status === "completed" || s.status === "skipped");
}

export function currentActiveStages(stages: CaseStage[]): CaseStage[] {
  return stages.filter((s) => s.status === "active" || s.status === "inProgress");
}

export { TEAM_LABELS };
