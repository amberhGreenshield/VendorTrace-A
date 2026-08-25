import { AssessmentKey, CaseAssessment } from "./schema.js";
import {
  loadGraphConfig,
  createFolder,
  copyItemToFolder,
  getItemByPath,
  shareItemWithUser,
  uploadFileToFolder,
} from "./graphClient.js";

// Real Microsoft Graph integration. When Graph is not configured yet, the
// service deliberately returns a SharePoint-pending result instead of fake
// URLs. This lets the case and its workflow be tested safely while Entra
// consent/site access is pending.
//
// Expects these to already exist on the real SharePoint site (see README):
//   Risk Assessments/VendorTrace/_Templates/PIA_Template.docx
//   Risk Assessments/VendorTrace/_Templates/Data_AI_Impact_Assessment_Template.docx
//
// UpGuard has NO template file — it's an external tool, not a SharePoint
// document, so there's nothing to copy for it; it just shows up in the
// case's assessment list with a note instead of a fileUrl.

const CASES_FOLDER_PATH = process.env.SHAREPOINT_ROOT_FOLDER ?? "Risk Assessments/VendorTrace";
const TEMPLATES_FOLDER_PATH = `${CASES_FOLDER_PATH}/_Templates`;

const ASSESSMENT_TEMPLATES: Record<AssessmentKey, { label: string; fileName?: string; localTemplate?: string; note?: string }> = {
  PIA: { label: "Privacy Impact Assessment (PIA)", fileName: "PIA_Template.docx", localTemplate: "/templates/PIA_Template.docx" },
  DataAIImpactAssessment: {
    label: "Data & AI Impact Assessment",
    fileName: "Data_AI_Impact_Assessment_Template.docx",
    localTemplate: "/templates/Data_AI_Impact_Assessment_Template.docx",
  },
  UpguardAssessment: {
    label: "UpGuard Security Assessment",
    note: "Sent directly through UpGuard by the Security Governance team — not a SharePoint document.",
  },
};
const ALL_ASSESSMENT_KEYS: AssessmentKey[] = ["PIA", "DataAIImpactAssessment", "UpguardAssessment"];

function slugify(legalName: string): string {
  return legalName.trim();
}

export interface CreatedCaseFolder {
  folderUrl: string | null;
  tprmFileUrl: string | null;
  assessments: CaseAssessment[];
}

export async function createCaseFolder(
  legalName: string,
  requiredAssessmentKeys: AssessmentKey[],
  businessOwnerEmail?: string,
  workbookBuffer?: Buffer
): Promise<CreatedCaseFolder> {
  const config = loadGraphConfig();

  if (!config) {
    return createSharePointPending(requiredAssessmentKeys);
  }

  const folderName = slugify(legalName);
  const folder = await createFolder(CASES_FOLDER_PATH, folderName);

  if (businessOwnerEmail) {
    // BOs should only be able to read their own case folder. Review teams
    // retain their existing site-level edit permissions. Do not silently
    // create a case the BO cannot access.
    await shareItemWithUser(folder.id, businessOwnerEmail, "read");
  }

  if (!workbookBuffer) {
    throw new Error("The submitted TPRM workbook is required for SharePoint upload");
  }
  const tprmItem = await uploadFileToFolder(
    folder.id,
    `${folderName} - TPRM.xlsx`,
    workbookBuffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  const assessments: CaseAssessment[] = [];
  for (const key of requiredAssessmentKeys) {
    const template = ASSESSMENT_TEMPLATES[key];
    if (!template.fileName) {
      assessments.push({ key, label: template.label, status: "pending", applicable: requiredAssessmentKeys.includes(key), note: template.note });
      continue;
    }
    await copyItemToFolder(`${TEMPLATES_FOLDER_PATH}/${template.fileName}`, folder.id, template.fileName);
    const item = await getItemByPath(`${CASES_FOLDER_PATH}/${folderName}/${template.fileName}`);
    assessments.push({
      key,
      label: template.label,
      status: "pending",
      fileUrl: item.webUrl,
      applicable: requiredAssessmentKeys.includes(key),
    });
  }

  return { folderUrl: folder.webUrl, tprmFileUrl: tprmItem.webUrl, assessments };
}

function createSharePointPending(requiredAssessmentKeys: AssessmentKey[]): CreatedCaseFolder {
  const assessments: CaseAssessment[] = ALL_ASSESSMENT_KEYS.map((key) => {
    const template = ASSESSMENT_TEMPLATES[key];
    return {
      key,
      label: template.label,
      status: "pending",
      fileUrl: undefined,
      applicable: requiredAssessmentKeys.includes(key),
      note: template.note,
    };
  });

  return { folderUrl: null, tprmFileUrl: null, assessments };
}
