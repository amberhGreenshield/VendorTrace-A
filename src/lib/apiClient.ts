import { Case, CaseStage, TeamKey } from "./schema";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface ApiCaseStage {
  stageKey: string;
  label: string;
  team: string;
  seqOrder: number;
  status: CaseStage["status"];
  activatedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

export interface ApiCaseAssessment {
  key: string;
  label: string;
  status: "pending" | "inProgress" | "completed";
  fileUrl: string | null;
  applicable: boolean;
}

export interface ApiCase {
  id: string;
  caseNumber: string;
  vendorName: string;
  description: string;
  businessOwner: string;
  businessSponsor: string;
  supplier: string;
  arrangementType: string;
  businessLines: string;
  riskTier: string | null;
  criticality: string | null;
  facts: unknown;
  sharepointFolderUrl: string | null;
  tprmFileUrl: string | null;
  overallStatus: "new" | "inProgress" | "completed";
  createdAt: string;
  stages: ApiCaseStage[];
  assessments: ApiCaseAssessment[];
}

class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(`Couldn't reach the API at ${API_BASE}. Is it running?`);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new ApiError(message);
  }
  return (await res.json()) as T;
}

export function listCases(): Promise<ApiCase[]> {
  return request<ApiCase[]>("/api/cases");
}

export function createCase(formData: FormData): Promise<ApiCase> {
  return request<ApiCase>("/api/cases", { method: "POST", body: formData });
}

export function startStage(caseId: string, stageKey: string): Promise<ApiCase> {
  return request<ApiCase>(`/api/cases/${caseId}/stages/${stageKey}/start`, { method: "POST" });
}

export function completeStage(caseId: string, stageKey: string, completedBy: string): Promise<ApiCase> {
  return request<ApiCase>(`/api/cases/${caseId}/stages/${stageKey}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completedBy }),
  });
}

/** Converts the API's raw (Prisma-shaped) case into the frontend's Case type. */
export function mapApiCaseToCase(a: ApiCase): Case {
  return {
    id: a.id,
    caseNumber: a.caseNumber,
    vendorName: a.vendorName,
    description: a.description,
    businessOwner: a.businessOwner,
    businessSponsor: a.businessSponsor,
    supplier: a.supplier,
    arrangementType: a.arrangementType,
    businessLines: a.businessLines,
    riskTier: (a.riskTier ?? undefined) as Case["riskTier"],
    criticality: a.criticality ?? undefined,
    createdAt: a.createdAt,
    facts: a.facts as Case["facts"],
    stages: a.stages.map((s) => ({
      stageKey: s.stageKey,
      label: s.label,
      team: s.team as TeamKey,
      seqOrder: s.seqOrder,
      status: s.status,
      activatedAt: s.activatedAt ?? undefined,
      completedAt: s.completedAt ?? undefined,
      completedBy: s.completedBy ?? undefined,
    })),
    assessments: a.assessments.map((asm) => ({
      key: asm.key as Case["assessments"][number]["key"],
      label: asm.label,
      status: asm.status,
      fileUrl: asm.fileUrl ?? undefined,
      applicable: asm.applicable,
    })),
    // The API doesn't store a separate "completed forms" table — the TPRM
    // intake form is just the case's own tprmFileUrl, shown the same way.
    completedForms: a.tprmFileUrl ? [{ id: "tprm-intake", label: "TPRM Intake Form", fileUrl: a.tprmFileUrl }] : [],
    sharepointFolderUrl: a.sharepointFolderUrl ?? undefined,
    tprmFileUrl: a.tprmFileUrl ?? undefined,
    overallStatus: a.overallStatus,
  };
}
