import { AssessmentKey, CaseAssessment } from "./schema.js";
import { loadGraphConfig, createFolder, copyItemToFolder, getItemByPath, shareItemWithUser } from "./graphClient.js";

// Real Microsoft Graph integration, with an automatic fallback to the mock
// behavior if GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET /
// SHAREPOINT_HOSTNAME / SHAREPOINT_SITE_PATH aren't set in the environment
// yet — so local dev and early deploys keep working before admin consent
// comes through. See graphClient.ts for the auth + low-level Graph calls.
//
// Expects these to already exist on the real SharePoint site (see README):
//   TPRM Cases/_Templates/TPRM_Blank_Template.xlsx
//   TPRM Cases/_Templates/PIA_Template.docx
//   TPRM Cases/_Templates/Data_AI_Impact_Assessment_Template.docx
//
// UpGuard has NO template file — it's an external tool, not a SharePoint
// document, so there's nothing to copy for it; it just shows up in the
// case's assessment list with a note instead of a fileUrl.

const CASES_FOLDER_PATH = "TPRM Cases";
const TEMPLATES_FOLDER_PATH = "TPRM Cases/_Templates";

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
const TPRM_TEMPLATE_FILE_NAME = "TPRM_Blank_Template.xlsx";

function slugify(legalName: string): string {
  return legalName.trim();
}

export interface CreatedCaseFolder {
  folderUrl: string;
  tprmFileUrl: string;
  assessments: CaseAssessment[];
}

export async function createCaseFolder(
  legalName: string,
  tprmFileName: string,
  requiredAssessmentKeys: AssessmentKey[],
  businessOwnerEmail?: string
): Promise<CreatedCaseFolder> {
  const config = loadGraphConfig();

  if (!config) {
    return createCaseFolderMocked(legalName, tprmFileName, requiredAssessmentKeys);
  }

  const folderName = slugify(legalName);
  const folder = await createFolder(CASES_FOLDER_PATH, folderName);

  if (businessOwnerEmail) {
    try {
      await shareItemWithUser(folder.id, businessOwnerEmail, "write");
    } catch (err) {
      console.error(`Failed to share case folder with ${businessOwnerEmail} — case still created:`, err);
    }
  }

  await copyItemToFolder(`${TEMPLATES_FOLDER_PATH}/${TPRM_TEMPLATE_FILE_NAME}`, folder.id, `${folderName} - TPRM.xlsx`);
  const tprmItem = await getItemByPath(`${CASES_FOLDER_PATH}/${folderName}/${folderName} - TPRM.xlsx`);

  const assessments: CaseAssessment[] = [];
  for (const key of ALL_ASSESSMENT_KEYS) {
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

async function createCaseFolderMocked(
  legalName: string,
  tprmFileName: string,
  requiredAssessmentKeys: AssessmentKey[]
): Promise<CreatedCaseFolder> {
  const SHAREPOINT_SITE_BASE = "https://gsccloud.sharepoint.com/sites/PVMActivities/Shared%20Documents/TPRM%20Cases";
  const folderSlug = encodeURIComponent(legalName.trim());
  const folderUrl = `${SHAREPOINT_SITE_BASE}/${folderSlug}`;
  const tprmFileUrl = `${folderUrl}/${encodeURIComponent(tprmFileName)}`;

  const assessments: CaseAssessment[] = ALL_ASSESSMENT_KEYS.map((key) => {
    const template = ASSESSMENT_TEMPLATES[key];
    return {
      key,
      label: template.label,
      status: "pending",
      fileUrl: template.localTemplate,
      applicable: requiredAssessmentKeys.includes(key),
      note: template.note,
    };
  });

  return { folderUrl, tprmFileUrl, assessments };
}
