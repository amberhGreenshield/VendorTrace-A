import { Case } from "../lib/schema";

// Slim "you now need a PIA / DIA" notice. Only appears when an admin changed
// the case's review hierarchy AND that change is what made the assessment
// required (CaseAssessment.requiredByAdmin), and only until the assessment
// is complete. Assessments the rules engine required at intake don't trigger
// it — the business owner already sees those in "Assessments To Be Completed".

const DOC_ASSESSMENTS: Record<string, { short: string; team: string; template: string }> = {
  PIA: { short: "PIA", team: "Privacy", template: "/templates/PIA_Template.docx" },
  DataAIImpactAssessment: { short: "DIA", team: "Data / AI", template: "/templates/Data_AI_Impact_Assessment_Template.docx" },
};

interface Props {
  case_: Case;
  audience: "businessOwner" | "team";
}

export default function RequiredAssessmentNotice({ case_: c, audience }: Props) {
  if (!c.hierarchyEditedAt) return null;
  const outstanding = c.assessments.filter(
    (a) => a.requiredByAdmin && a.applicable && a.status !== "completed" && DOC_ASSESSMENTS[a.key]
  );
  if (outstanding.length === 0) return null;

  return (
    <div style={{ margin: "10px 32px 0", display: "flex", flexDirection: "column", gap: 6 }}>
      {outstanding.map((a) => {
        const meta = DOC_ASSESSMENTS[a.key];
        const link = a.fileUrl ?? meta.template;
        return (
          <div
            key={a.key}
            style={{
              background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 12px",
              display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#1e40af", lineHeight: 1.4,
            }}
          >
            <span aria-hidden>📄</span>
            <span style={{ flex: 1 }}>
              {audience === "businessOwner" ? (
                <>
                  {meta.team} was added to this case's review — please complete a <strong>{meta.short}</strong>.
                </>
              ) : (
                <>
                  {meta.team} was added to the hierarchy — <strong>{meta.short}</strong> now required from {c.businessOwner}.
                </>
              )}
            </span>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#1e40af", fontWeight: 600, textDecoration: "underline", whiteSpace: "nowrap" }}
            >
              {a.fileUrl ? `Open ${meta.short}` : `${meta.short} template`}
            </a>
          </div>
        );
      })}
    </div>
  );
}
