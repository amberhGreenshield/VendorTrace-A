import { AssessmentKey, CaseAssessment } from "./schema";

// ─── SharePoint integration (MOCKED) ────────────────────────────────────────
// TODO(Azure): once the Azure AD app registration + Graph API permissions
// are ready, replace the body of `createCaseFolder` with real calls:
//   1. POST /sites/{siteId}/drive/root:/TPRM Cases/{legalName}:/  (create folder)
//   2. Copy the blank TPRM workbook into it
//   3. Copy each assessment template (PIA / Data & AI Impact Assessment)
//      into it — always copy both, even ones this case doesn't strictly
//      require, so reviewers always have a live SharePoint link to check.
//   4. Return the real webUrl for the folder + each file
// The function signatures below are designed to not need to change when
// that happens — callers don't know or care that this is mocked.

const SHAREPOINT_SITE_BASE =
  "https://gsccloud.sharepoint.com/sites/PVMActivities/Shared%20Documents/TPRM%20Cases";

const BLANK_TPRM_TEMPLATE_URL = "/templates/TPRM_Blank_Template.xlsx";

const ASSESSMENT_TEMPLATES: Record<AssessmentKey, { label: string; localTemplate: string }> = {
  PIA: { label: "Privacy Impact Assessment (PIA)", localTemplate: "/templates/PIA_Template.docx" },
  DataAIImpactAssessment: { label: "Data & AI Impact Assessment", localTemplate: "/templates/Data_AI_Impact_Assessment_Template.docx" },
};

const ALL_ASSESSMENT_KEYS: AssessmentKey[] = ["PIA", "DataAIImpactAssessment"];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugifyFolderName(legalName: string): string {
  return encodeURIComponent(legalName.trim());
}

/**
 * The blank TPRM workbook a Business Owner downloads from SharePoint before
 * starting a new vendor assessment. Currently served from this app's own
 * /templates folder (mocked) until Graph API access exists; once it does,
 * point this at the real SharePoint file's download URL.
 */
export function getBlankTprmTemplateUrl(): string {
  return BLANK_TPRM_TEMPLATE_URL;
}

export interface CreatedCaseFolder {
  folderUrl: string;
  tprmFileUrl: string;
  assessments: CaseAssessment[];
}

/**
 * Simulates creating a SharePoint case folder named after the vendor's legal
 * name, copying in a blank TPRM workbook and BOTH assessment templates
 * (PIA + Data & AI Impact Assessment). Every case gets links to both so any
 * reviewer can open them in SharePoint in real time, even if this case's
 * TPRM answers don't actually require one of them — those are simply marked
 * `applicable: false` and stay pending/blank instead of ever showing as
 * "complete". Currently returns local template files (the real blank docs
 * you supplied) so "Open in SharePoint" behaves like the real thing in a demo.
 */
export async function createCaseFolder(
  legalName: string,
  tprmFile: File,
  requiredAssessmentKeys: AssessmentKey[]
): Promise<CreatedCaseFolder> {
  await delay(700); // simulated network latency

  const folderSlug = slugifyFolderName(legalName);
  const folderUrl = `${SHAREPOINT_SITE_BASE}/${folderSlug}`;
  const tprmFileUrl = `${folderUrl}/${encodeURIComponent(tprmFile.name)}`;

  const assessments: CaseAssessment[] = ALL_ASSESSMENT_KEYS.map((key) => {
    const template = ASSESSMENT_TEMPLATES[key];
    return {
      key,
      label: template.label,
      status: "pending",
      // Mocked: served from this app's own /templates folder rather than a
      // real SharePoint copy, until Graph API access exists.
      fileUrl: template.localTemplate,
      applicable: requiredAssessmentKeys.includes(key),
    };
  });

  return { folderUrl, tprmFileUrl, assessments };
}
