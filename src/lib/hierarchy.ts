import { ASSESSOR_TEAMS, CaseStage, StageDefinition, StageStatus, TeamKey, TEAM_LABELS } from "./schema";
import { RuleEvaluation } from "./rulesEngine";

// ─── Hierarchy ──────────────────────────────────────────────────────────────
// Order taken directly from the "Rules Engine" flow diagram, updated so the
// case opens with all three of its always-required first-line reviewers at
// once instead of routing through Risk afterwards:
//   0. Admin Review — always. The case sits in the admin inbox first so an
//      admin can look over (and, if needed, rearrange) the hierarchy the
//      rules engine produced before any review team is notified.
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

export const ADMIN_STAGE_KEY = "admin-review";

export const STAGE_DEFINITIONS: StageDefinition[] = [
  { key: ADMIN_STAGE_KEY, label: "Admin Review", team: "Admin", seqOrder: 0, alwaysRequired: true },
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

const DEFINITIONS_BY_KEY = new Map(STAGE_DEFINITIONS.map((d) => [d.key, d]));

function isTriggered(def: StageDefinition, triggeredTeams: Set<TeamKey>): boolean {
  return def.alwaysRequired || triggeredTeams.has(def.team);
}

/** Builds the full stage list for a new case and activates seqOrder 0 (the admin inbox). */
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

// ─── Admin hierarchy editing ────────────────────────────────────────────────
// An admin can rearrange the part of the hierarchy that hasn't happened yet:
// move stages between steps, add any assessor team (even one the rules
// engine didn't trigger, or a second pass of a team), or drop a team that
// isn't always-required. Anything already active, in progress or completed
// is frozen — the edit only applies from the "frontier" forward.

/** One stage as the admin wants it to end up. `stageKey` is omitted for brand-new stages. */
export interface HierarchyEditStage {
  stageKey?: string;
  team: TeamKey;
  label?: string;
  /** Step number as shown in the editor. Will be renumbered to be consecutive after the frontier. */
  seqOrder: number;
}

export interface HierarchyEditResult {
  /** The full new stage list (frozen stages untouched, editable ones replaced). */
  stages: CaseStage[];
  /** Stage keys that existed before and are no longer in the hierarchy (set to skipped, or deleted if admin-added). */
  removedStageKeys: string[];
  /** Stage keys that are newly part of the hierarchy (added by the admin, or un-skipped). */
  addedStageKeys: string[];
}

export class HierarchyEditError extends Error {}

/** A stage the admin isn't allowed to touch: it's happening now or already happened. */
export function isFrozenStage(stage: CaseStage): boolean {
  return stage.status === "active" || stage.status === "inProgress" || stage.status === "completed";
}

/** The highest seqOrder that has already started. Edits may only place stages after this. */
export function hierarchyFrontier(stages: CaseStage[]): number {
  return stages.filter(isFrozenStage).reduce((max, s) => Math.max(max, s.seqOrder), -1);
}

export function isAdminAddedStage(stageKey: string): boolean {
  return !DEFINITIONS_BY_KEY.has(stageKey);
}

function slugTeam(team: TeamKey): string {
  return team.replace(/[A-Z]/g, (ch, i) => (i === 0 ? ch.toLowerCase() : `-${ch.toLowerCase()}`));
}

/**
 * Applies an admin's edit to an existing stage list and returns the new
 * list. Pure — nothing here touches the database.
 *
 * Rules enforced:
 *  - Frozen stages (active / inProgress / completed) can't be moved, removed or re-teamed.
 *  - Every editable stage must land on a step after the frontier.
 *  - Always-required stages (PVM, BA, Risk initial, EA, Risk sign-off, Admin Review) can't be removed.
 *  - Only assessor teams can be added (not "Admin").
 *  - Steps are renumbered to be consecutive so the cascade logic stays simple.
 */
export function applyHierarchyEdit(current: CaseStage[], edit: HierarchyEditStage[]): HierarchyEditResult {
  const frontier = hierarchyFrontier(current);
  const frozen = current.filter(isFrozenStage);
  const editableBefore = current.filter((s) => !isFrozenStage(s));
  const editableByKey = new Map(editableBefore.map((s) => [s.stageKey, s]));

  const seenKeys = new Set<string>();
  const usedKeys = new Set(current.map((s) => s.stageKey));
  const placed: { stage: CaseStage; requestedSeq: number }[] = [];

  for (const item of edit) {
    if (item.stageKey) {
      if (seenKeys.has(item.stageKey)) throw new HierarchyEditError(`Stage "${item.stageKey}" appears twice.`);
      seenKeys.add(item.stageKey);
      if (frozen.some((s) => s.stageKey === item.stageKey)) {
        // Frozen stages are carried over as-is below; ignore whatever the client sent for them.
        continue;
      }
    }

    if (!ASSESSOR_TEAMS.includes(item.team)) {
      throw new HierarchyEditError(`"${item.team}" isn't a team that can be placed in the review hierarchy.`);
    }
    if (!Number.isInteger(item.seqOrder)) {
      throw new HierarchyEditError("Every stage needs a whole-number step.");
    }

    if (item.stageKey) {
      const existing = editableByKey.get(item.stageKey);
      if (!existing) throw new HierarchyEditError(`Stage "${item.stageKey}" doesn't exist on this case.`);
      if (existing.team !== item.team) {
        throw new HierarchyEditError(`Stage "${existing.label}" belongs to ${TEAM_LABELS[existing.team]} and can't be reassigned — remove it and add a new stage instead.`);
      }
      placed.push({
        stage: { ...existing, status: "pending", label: item.label?.trim() || existing.label },
        requestedSeq: item.seqOrder,
      });
    } else {
      // If the rules engine skipped this team, revive its original stage
      // (e.g. "privacy") rather than minting "privacy-2" — keeps stage keys
      // canonical for reporting and for the PIA/DIA owner logic.
      const dormant = editableBefore.find(
        (s) => s.team === item.team && s.status === "skipped" && !seenKeys.has(s.stageKey) && DEFINITIONS_BY_KEY.has(s.stageKey)
      );
      if (dormant) {
        seenKeys.add(dormant.stageKey);
        placed.push({
          stage: { ...dormant, status: "pending", label: item.label?.trim() || dormant.label },
          requestedSeq: item.seqOrder,
        });
        continue;
      }
      // Brand-new stage added by the admin. Give it a stable, unique key.
      let n = 2;
      let key = `${slugTeam(item.team)}-${n}`;
      while (usedKeys.has(key)) key = `${slugTeam(item.team)}-${++n}`;
      usedKeys.add(key);
      placed.push({
        stage: {
          stageKey: key,
          label: item.label?.trim() || `${TEAM_LABELS[item.team]} (Additional Review)`,
          team: item.team,
          seqOrder: item.seqOrder,
          status: "pending",
        },
        requestedSeq: item.seqOrder,
      });
    }
  }

  // Everything editable that the admin left out of the edit is removed.
  const removedStageKeys: string[] = [];
  const skippedCarryover: CaseStage[] = [];
  for (const s of editableBefore) {
    if (seenKeys.has(s.stageKey)) continue;
    const def = DEFINITIONS_BY_KEY.get(s.stageKey);
    if (def?.alwaysRequired && s.status !== "skipped") {
      throw new HierarchyEditError(`"${s.label}" is always required and can't be removed from the hierarchy.`);
    }
    if (s.status === "pending") removedStageKeys.push(s.stageKey);
    if (def) {
      // Rules-engine stages stay as skipped rows so the case keeps its full shape.
      skippedCarryover.push({ ...s, status: "skipped" as StageStatus });
    } else {
      // Admin-added stages that were later removed just go away.
      removedStageKeys.push(s.stageKey);
    }
  }

  // Renumber requested steps so they're consecutive and all after the frontier.
  const distinctSeqs = Array.from(new Set(placed.map((p) => p.requestedSeq))).sort((a, b) => a - b);
  const seqMap = new Map(distinctSeqs.map((seq, i) => [seq, frontier + 1 + i]));
  for (const p of placed) p.stage.seqOrder = seqMap.get(p.requestedSeq)!;

  const addedStageKeys = placed
    .filter((p) => {
      const before = editableByKey.get(p.stage.stageKey);
      return !before || before.status === "skipped";
    })
    .map((p) => p.stage.stageKey);

  // Skipped rows get parked after everything else so they never block a step.
  const maxSeq = Math.max(frontier, ...placed.map((p) => p.stage.seqOrder));
  for (const s of skippedCarryover) s.seqOrder = maxSeq + 1;

  const stages = [...frozen, ...placed.map((p) => p.stage), ...skippedCarryover].sort(
    (a, b) => a.seqOrder - b.seqOrder || a.stageKey.localeCompare(b.stageKey)
  );

  return { stages, removedStageKeys, addedStageKeys };
}

export { TEAM_LABELS };
