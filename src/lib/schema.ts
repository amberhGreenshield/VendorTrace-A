// ─── Core domain types ──────────────────────────────────────────────────────
// These mirror the DB schema (teams, stage_definitions, case_stages,
// assessment_definitions, case_assessments, case_facts, rules) so the mock
// engine here can be swapped for a real backend later with minimal changes.

export type TeamKey =
  | "PVM"
  | "BusinessArchitecture"
  | "Risk"
  | "Privacy"
  | "Data"
  | "AI"
  | "SecurityGovernance"
  | "SecurityArchitecture"
  | "EnterpriseArchitecture";

export const TEAM_LABELS: Record<TeamKey, string> = {
  PVM: "PVM",
  BusinessArchitecture: "Business Architecture",
  Risk: "Risk",
  Privacy: "Privacy",
  Data: "Data",
  AI: "AI",
  SecurityGovernance: "Security Governance",
  SecurityArchitecture: "Security Architecture",
  EnterpriseArchitecture: "Enterprise Architecture",
};

export type StageStatus = "skipped" | "pending" | "active" | "inProgress" | "completed";

export interface StageDefinition {
  /** Unique key for this step. Risk appears twice (initial + sign-off), so it needs two keys. */
  key: string;
  label: string;
  team: TeamKey;
  /** Cases advance one seqOrder at a time. Stages sharing a seqOrder run in parallel. */
  seqOrder: number;
  /** Always runs regardless of TPRM answers (BA, PVM, Risk p1, EA, Risk sign-off). */
  alwaysRequired: boolean;
}

export interface CaseStage {
  stageKey: string;
  label: string;
  team: TeamKey;
  seqOrder: number;
  status: StageStatus;
  activatedAt?: string;
  completedAt?: string;
  completedBy?: string;
}

export type AssessmentKey = "PIA" | "DataAIImpactAssessment";

export interface AssessmentDefinition {
  key: AssessmentKey;
  label: string;
  templateFileUrl: string; // blank template served from /templates
}

export type AssessmentStatus = "pending" | "inProgress" | "completed";

export interface CaseAssessment {
  key: AssessmentKey;
  label: string;
  status: AssessmentStatus;
  /** Populated once the case's SharePoint folder is created (mocked for now). */
  fileUrl?: string;
  /**
   * Whether the TPRM answers actually require this assessment for this case.
   * Every case gets a PIA and a Data & AI Impact Assessment entry (so the
   * blank SharePoint links are always visible to reviewers), but only the
   * applicable ones ever move past "pending".
   */
  applicable: boolean;
}

/** Answers pulled out of the TPRM workbook. Mirrors the `case_facts` table (fact_key/fact_value). */
export interface CaseFacts {
  legalName: string;
  arrangementType: string;
  description: string;
  businessLines: string;
  contractOwner: string;
  criticality?: string;
  riskTier?: "Tier 1" | "Tier 2" | "Tier 3";
  q2_itInfrastructure?: string; // "02 TP Risk Assessment" Q2
  q3_aiMl?: string; // Q3
  q4_dataProtection?: string; // Q4
  q5_dataResidency?: string; // Q5
}

export interface CompletedForm {
  id: string;
  label: string;
  fileUrl?: string;
  /** Small secondary line, e.g. "Not required for this case — shown for visibility". */
  note?: string;
}

export interface Case {
  id: string;
  /** Human-facing display ID, e.g. "#3001" — the real `id` above is an opaque DB key used for API calls. */
  caseNumber: string;
  vendorName: string;
  description: string;
  businessOwner: string;
  businessSponsor: string;
  supplier: string;
  arrangementType: string;
  businessLines: string;
  riskTier?: "Tier 1" | "Tier 2" | "Tier 3";
  criticality?: string;
  /** ISO timestamp of when the BO uploaded the TPRM workbook and the case was created — used to derive "Onboarding Duration". */
  createdAt: string;

  facts: CaseFacts;
  stages: CaseStage[];
  assessments: CaseAssessment[];
  completedForms: CompletedForm[];

  sharepointFolderUrl?: string;
  tprmFileUrl?: string;

  /** Overall case status derived from stages: "new" until first stage starts, "completed" once the last stage completes. */
  overallStatus: "new" | "inProgress" | "completed";
}
