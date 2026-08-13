import Header from "../components/Header";
import DescriptionCard from "../components/DescriptionCard";
import AssessmentSection from "../components/AssessmentSection";
import StageProgressTracker from "../components/StageProgressTracker";
import { Case } from "../lib/schema";
import { currentStateLabel, assessmentsToCompleteList, completedFormsAndAssessments, notApplicableAssessments } from "../lib/boViewHelpers";
import { nextReviewTeam, onboardingDurationDays } from "../lib/caseEngine";

interface BusinessOwnerCaseDetailsProps {
  case: Case;
  onBack: () => void;
}

export default function BusinessOwnerCaseDetails({ case: c, onBack }: BusinessOwnerCaseDetailsProps) {
  const assessmentsToComplete = [...assessmentsToCompleteList(c), ...notApplicableAssessments(c)];

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header onBack={onBack} title={"Case: " + c.caseNumber} subtitle={"Vendor: " + c.vendorName} />
      <div style={{ padding: "20px 32px 0" }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 6 }}>REVIEW HIERARCHY</div>
        <StageProgressTracker stages={c.stages} />
      </div>
      <div style={{ display: "flex", gap: 24, padding: "20px 32px 0", flexWrap: "wrap" }}>
        {[
          { label: "Business Sponsor", value: c.businessSponsor },
          { label: "Supplier", value: c.supplier },
          { label: "Risk Tier", value: c.riskTier },
          { label: "Criticality", value: c.criticality },
          { label: "Arrangement Type", value: c.arrangementType },
          { label: "Business Lines", value: c.businessLines },
          { label: "Current State", value: currentStateLabel(c) },
          { label: "Onboarding Duration", value: onboardingDurationDays(c) },
          { label: "Next Review", value: nextReviewTeam(c) },
        ].map(({ label, value }) =>
          value ? (
            <div key={label} style={{ background: "#fff", borderRadius: 8, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>{value}</div>
            </div>
          ) : null
        )}
      </div>
      {c.tprmFileUrl && (
        <div style={{ padding: "0 32px 12px", marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={c.tprmFileUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#0f4c3a",
              color: "#fff",
              borderRadius: 8,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
            }}
          >
            📋 Open TPRM Workbook in SharePoint
          </a>
        </div>
      )}
      <div style={{ display: "flex", gap: 24, padding: "8px 32px 0", alignItems: "flex-start", flexWrap: "wrap" }}>
        <DescriptionCard text={c.description} />
        <AssessmentSection title="Completed Forms / Assessments" items={completedFormsAndAssessments(c)} columns={2} />
        <AssessmentSection title="Assessments To Be Completed" items={assessmentsToComplete} columns={2} />
      </div>
      {assessmentsToComplete.length > 0 && (
        <div style={{ padding: "8px 32px 24px", fontSize: 12, color: "#64748b" }}>
          📎 Click any assessment card above to open the document in SharePoint. Contact{" "}
          <a href="mailto:data.ai.governance@greenshield.ca" style={{ color: "#0f4c3a" }}>
            data.ai.governance@greenshield.ca
          </a>{" "}
          for Data &amp; AI Impact Assessment guidance.
        </div>
      )}
      <div style={{ position: "fixed", bottom: 24, right: 24 }}>
        <button style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #0f4c3a", background: "#fff", color: "#0f4c3a", fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>?</button>
      </div>
    </div>
  );
}
