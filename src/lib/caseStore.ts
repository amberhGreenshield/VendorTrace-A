import { Case } from "./schema";
import * as api from "./apiClient";

// Talks to the real backend now — no more localStorage. Every function
// here returns the frontend's `Case` shape; the API-shape mapping lives in
// apiClient.ts so nothing else in the app needs to know about it.

export async function fetchAllCases(): Promise<Case[]> {
  const apiCases = await api.listCases();
  return apiCases.map(api.mapApiCaseToCase);
}

export async function createCaseViaApi(formData: FormData): Promise<Case> {
  const created = await api.createCase(formData);
  return api.mapApiCaseToCase(created);
}

export async function startCaseStage(caseId: string, stageKey: string): Promise<Case> {
  const updated = await api.startStage(caseId, stageKey);
  return api.mapApiCaseToCase(updated);
}

export async function completeCaseStage(caseId: string, stageKey: string, completedBy: string): Promise<Case> {
  const updated = await api.completeStage(caseId, stageKey, completedBy);
  return api.mapApiCaseToCase(updated);
}
