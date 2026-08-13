import * as XLSX from "xlsx";
import { CaseFacts } from "./schema";

// ─── TPRM workbook parser ───────────────────────────────────────────────────
// Reads the real .xlsx a Business Owner uploads, entirely in the browser
// (no server needed for this). Looks up values by matching the label text
// GreenShield uses in the workbook rather than hardcoded cell refs, so it
// keeps working even if a row shifts by a line or two.
//
// Sheets read:
//   "00 Start Here"            → legal name, arrangement type, description,
//                                 business lines, contract owner
//   "01 Criticality Assessment" → criticality rating
//   "02 TP Risk Assessment"     → risk tier + Q2–Q5 answers

export class TprmParseError extends Error {}

type SheetGrid = (string | number | undefined)[][];

function sheetToGrid(workbook: XLSX.WorkBook, sheetName: string): SheetGrid {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new TprmParseError(`Sheet "${sheetName}" not found in workbook.`);
  return XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, { header: 1, defval: undefined });
}

function normalize(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Finds the row containing `labelSubstring` anywhere in it, then returns the first non-empty cell to the right of the match. */
function findValueByLabel(grid: SheetGrid, labelSubstring: string): string | undefined {
  const needle = normalize(labelSubstring);
  for (const row of grid) {
    const matchIndex = row.findIndex((cell) => cell !== undefined && normalize(cell).includes(needle));
    if (matchIndex === -1) continue;
    for (let i = matchIndex + 1; i < row.length; i++) {
      const candidate = row[i];
      if (candidate !== undefined && String(candidate).trim() !== "") {
        return String(candidate).trim();
      }
    }
  }
  return undefined;
}

/** Finds a Risk-Assessment-style question row by its category label (column B) and returns the Response cell (column D) on that row. */
function findResponseByCategory(grid: SheetGrid, categorySubstring: string): string | undefined {
  const needle = normalize(categorySubstring);
  for (const row of grid) {
    // Category is typically column index 1 (B), Response is column index 3 (D).
    const categoryCell = row[1];
    if (categoryCell !== undefined && normalize(categoryCell).includes(needle)) {
      const response = row[3];
      return response !== undefined && String(response).trim() !== "" ? String(response).trim() : undefined;
    }
  }
  return undefined;
}

function normalizeRiskTier(raw: string | undefined): CaseFacts["riskTier"] | undefined {
  if (!raw) return undefined;
  const n = normalize(raw);
  if (n.includes("tier i") && !n.includes("tier ii")) return "Tier 1";
  if (n.includes("tier ii") && !n.includes("tier iii")) return "Tier 2";
  if (n.includes("tier iii")) return "Tier 3";
  if (n.includes("1")) return "Tier 1";
  if (n.includes("2")) return "Tier 2";
  if (n.includes("3")) return "Tier 3";
  return undefined;
}

export async function parseTprmWorkbook(file: File): Promise<CaseFacts> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const startHere = sheetToGrid(workbook, "00 Start Here");
  const legalName = findValueByLabel(startHere, "Legal name of third-party");
  const arrangementType = findValueByLabel(startHere, "Third-party arrangement type");
  const description = findValueByLabel(startHere, "Description of Services");
  const businessLines = findValueByLabel(startHere, "Business lines impacted");
  const contractOwner = findValueByLabel(startHere, "Contract owner");

  if (!legalName) {
    throw new TprmParseError(
      'Could not find "Legal name of third-party" in the "00 Start Here" tab. Please check this is the standard TPRM workbook template.'
    );
  }

  let criticality: string | undefined;
  try {
    const criticalitySheet = sheetToGrid(workbook, "01 Criticality Assessment");
    criticality = findValueByLabel(criticalitySheet, "Criticality Rating");
  } catch {
    // Sheet missing/renamed — non-fatal, criticality is informational only.
  }

  const riskSheet = sheetToGrid(workbook, "02 TP Risk Assessment");
  const riskTierRaw = findValueByLabel(riskSheet, "Risk Rating");
  const q2 = findResponseByCategory(riskSheet, "IT Infrastructure Integration");
  const q3 = findResponseByCategory(riskSheet, "Use of Artifical Intelligence") ?? findResponseByCategory(riskSheet, "Artificial Intelligence");
  const q4 = findResponseByCategory(riskSheet, "Data Protection");
  const q5 = findResponseByCategory(riskSheet, "Data Residency");

  return {
    legalName,
    arrangementType: arrangementType ?? "",
    description: description ?? "",
    businessLines: businessLines ?? "",
    contractOwner: contractOwner ?? "",
    criticality,
    riskTier: normalizeRiskTier(riskTierRaw),
    q2_itInfrastructure: q2,
    q3_aiMl: q3,
    q4_dataProtection: q4,
    q5_dataResidency: q5,
  };
}
