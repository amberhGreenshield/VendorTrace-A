import { CaseFacts, TeamKey, AssessmentKey } from "./schema.js";

// ─── Trigger rules ──────────────────────────────────────────────────────────
// Modeled after the `rules` table in the schema (rules_key, version,
// conditions jsonb, effects jsonb, active). Each rule is one condition on a
// single TPRM fact; a team is triggered if ANY of its rules fire (OR logic
// across rules). This is intentionally data, not if/else spaghetti, so new
// rules/versions can be added without touching the engine.
//
// NOTE ON "Data =" TRIGGER: the source instructions listed "Question 4:
// Privacy will be triggered..." under the Data heading, which reads like a
// copy/paste leftover from the Privacy section above it. This engine treats
// it as "Data will be triggered" (i.e. Data triggers on Q3 AI/ML=Yes OR the
// same Q4 PI/confidential answers as Privacy). Flag to confirm if wrong —
// easy one-line change in DATA_RULES below.

export interface Rule {
  key: string;
  version: number;
  active: boolean;
  factKey: keyof CaseFacts;
  op: "equals" | "in";
  value: string | string[];
  triggerTeam: TeamKey;
  requireAssessment?: AssessmentKey;
}

const PI_OR_CONFIDENTIAL_ANSWERS = [
  "Yes the third party will access PI",
  "Yes the third party will access PI and confidential business information",
  "Yes GS customers or employees will provide PI to this third party",
];

const CONFIDENTIAL_OR_PI_ANSWERS = [
  "Yes the third party will access business confidential information",
  "Yes the third party will access PI",
  "Yes the third party will access PI and confidential business information",
];

const ALL_DATA_PROTECTION_YES_ANSWERS = [
  "Yes the third party will access business confidential information",
  "Yes the third party will access PI",
  "Yes the third party will access PI and confidential business information",
  "Yes GS customers or employees will provide PI to this third party",
];

const INFRA_INTEGRATION_ANSWERS = [
  "Yes the third party will integrate into GS's infrastructure",
  "Yes it will be an SSO integration only",
];

export const RULES: Rule[] = [
  // Privacy
  { key: "privacy.q4.pi", version: 1, active: true, factKey: "q4_dataProtection", op: "in", value: PI_OR_CONFIDENTIAL_ANSWERS, triggerTeam: "Privacy", requireAssessment: "PIA" },
  { key: "privacy.q5.residency", version: 1, active: true, factKey: "q5_dataResidency", op: "equals", value: "Yes", triggerTeam: "Privacy" },

  // Data
  { key: "data.q3.aiml", version: 1, active: true, factKey: "q3_aiMl", op: "equals", value: "Yes", triggerTeam: "Data", requireAssessment: "DataAIImpactAssessment" },
  { key: "data.q4.confidentialOrPi", version: 1, active: true, factKey: "q4_dataProtection", op: "in", value: CONFIDENTIAL_OR_PI_ANSWERS, triggerTeam: "Data", requireAssessment: "DataAIImpactAssessment" },

  // AI
  { key: "ai.q3.aiml", version: 1, active: true, factKey: "q3_aiMl", op: "equals", value: "Yes", triggerTeam: "AI", requireAssessment: "DataAIImpactAssessment" },

  // Security Governance (UpGuard assessment)
  { key: "secgov.q2.infra", version: 1, active: true, factKey: "q2_itInfrastructure", op: "in", value: INFRA_INTEGRATION_ANSWERS, triggerTeam: "SecurityGovernance" },
  { key: "secgov.q4.dataProtection", version: 1, active: true, factKey: "q4_dataProtection", op: "in", value: ALL_DATA_PROTECTION_YES_ANSWERS, triggerTeam: "SecurityGovernance" },

  // Security Architecture
  { key: "secarch.q2.infra", version: 1, active: true, factKey: "q2_itInfrastructure", op: "in", value: INFRA_INTEGRATION_ANSWERS, triggerTeam: "SecurityArchitecture" },
];

function ruleMatches(rule: Rule, facts: CaseFacts): boolean {
  const factValue = facts[rule.factKey];
  if (!factValue) return false;
  if (rule.op === "equals") return factValue === rule.value;
  return Array.isArray(rule.value) && rule.value.includes(factValue as string);
}

export interface RuleEvaluation {
  triggeredTeams: Set<TeamKey>;
  requiredAssessments: Set<AssessmentKey>;
  /** Which rule keys fired, for audit/debugging. */
  firedRules: string[];
}

export function evaluateRules(facts: CaseFacts): RuleEvaluation {
  const triggeredTeams = new Set<TeamKey>();
  const requiredAssessments = new Set<AssessmentKey>();
  const firedRules: string[] = [];

  for (const rule of RULES) {
    if (!rule.active) continue;
    if (ruleMatches(rule, facts)) {
      triggeredTeams.add(rule.triggerTeam);
      if (rule.requireAssessment) requiredAssessments.add(rule.requireAssessment);
      firedRules.push(rule.key);
    }
  }

  return { triggeredTeams, requiredAssessments, firedRules };
}
