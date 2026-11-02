// The browser never talks to SharePoint directly — folder creation, uploads
// and sharing all happen in the API (api/src/domain/sharepointService.ts),
// which holds the Graph credentials. All the frontend needs is the blank
// TPRM template that Business Owners download before starting a case.

const BLANK_TPRM_TEMPLATE_URL = "/templates/TPRM_Blank_Template.xlsx";

export function getBlankTprmTemplateUrl(): string {
  return BLANK_TPRM_TEMPLATE_URL;
}
