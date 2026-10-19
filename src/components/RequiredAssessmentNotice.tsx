import { Case } from "../lib/schema";

// Prominent "you need to complete a PIA / DIA" call-out. Shown to the
// business owner (and reviewers) whenever the case requires an assessment
// that isn't finished yet — whether the rules engine required it at intake
// or an admin added Privacy / Data / AI to the hierarchy later. Each one
// links straight to the case's copy of the document in SharePoint.

const DOC_ASSESSMENTS: Record<string, { short: string; team: string; contact?: string }> = {
  PIA: { short: "PIA", team: "Privacy" },
  DataAIImpactAssessment: { short: "DIA", team: "Data & AI", contact: "data.ai.governance@greenshield.ca" },
};

interface Props {
  case_: Case;
  audience: "businessOwner" | "team";
}

export default function RequiredAssessmentNotice({ case_: c, audience }: Props) {
  const outstanding = c.assessments.filter((a) => a.applicable && a.status !== "completed" && DOC_ASSESSMENTS[a.key]);
  if (outstanding.length === 0) return null;

  return (
    <div style={{ margin: "16px 32px 0", display: "flex", flexDirection: "column", gap: 10 }}>
      {outstanding.map((a) => {
        const meta = DOC_ASSESSMENTS[a.key];
        return (
          <div
            key={a.key}
            style={{
              background: "#eff6ff", border: "1.5px solid #3b82f6", borderRadius: 10, padding: "14px 18px",
              display: "flex", gap: 12, alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>📄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", marginBottom: 4 }}>
                {a.label} required ({meta.short})
              </div>
              <div style={{ fontSize: 13, color: "#1e40af", lineHeight: 1.6 }}>
                {audience === "businessOwner" ? (
                  <>
                    The {meta.team} team is part of this case's review, so you need to complete a{" "}
                    <strong>{meta.short}</strong> for this vendor. It's linked to your case below — open it, fill it in, and the{" "}
                    {meta.team} team will review it when the case reaches them.
                  </>
                ) : (
                  <>
                    This case requires a <strong>{meta.short}</strong> from the business owner ({c.businessOwner}). It's linked to the
                    case below.
                  </>
                )}
                {meta.contact && audience === "businessOwner" && (
                  <>
                    {" "}Questions? Contact <a href={`mailto:${meta.contact}`} style={{ color: "#1e3a8a" }}>{meta.contact}</a>.
                  </>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                {a.fileUrl ? (
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, background: "#1e40af", color: "#fff", borderRadius: 7,
                      padding: "7px 14px", fontSize: 12.5, fontWeight: 600, textDecoration: "none",
                    }}
                  >
                    🔗 Open {meta.short} in SharePoint
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
                    The {meta.short} document link will appear here once the case's SharePoint folder is provisioned. Blank template:{" "}
                    <a
                      href={a.key === "PIA" ? "/templates/PIA_Template.docx" : "/templates/Data_AI_Impact_Assessment_Template.docx"}
                      style={{ color: "#1e40af" }}
                    >
                      download
                    </a>
                    .
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
