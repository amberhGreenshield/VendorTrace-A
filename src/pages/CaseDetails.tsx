import { useState } from "react";
import Header from "../components/Header";
import DescriptionCard from "../components/DescriptionCard";
import AssessmentSection from "../components/AssessmentSection";
import StageProgressTracker from "../components/StageProgressTracker";
import ConfirmCompleteModal from "../components/ConfirmCompleteModal";
import { TeamViewCase } from "../lib/viewAdapters";

interface CaseDetailsProps {
  viewCase: TeamViewCase;
  teamName: string;
  onBack: () => void;
  onStart: (caseId: string, stageKey: string) => void;
  onComplete: (caseId: string, stageKey: string) => void;
}

export default function CaseDetails({ viewCase: c, teamName, onBack, onStart, onComplete }: CaseDetailsProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header onBack={onBack} title={"Case: " + c.caseNumber} subtitle={"Vendor: " + c.vendorName} />
      <div style={{ padding: "20px 32px 0" }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 6 }}>REVIEW HIERARCHY</div>
        <StageProgressTracker stages={c.raw.stages} />
      </div>
      <div style={{ display: "flex", gap: 24, padding: "20px 32px 0", flexWrap: "wrap" }}>
        {[
          { label: "Business Owner", value: c.businessOwner },
          { label: "Business Sponsor", value: c.businessSponsor },
          { label: "Supplier", value: c.supplier },
          { label: "Risk Tier", value: c.riskTier },
          { label: "Onboarding Duration", value: c.onboardingDuration },
          { label: "Next Review", value: c.nextReview },
        ].map(({ label, value }) =>
          value ? (
            <div key={label} style={{ background: "#fff", borderRadius: 8, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>{value}</div>
            </div>
          ) : null
        )}
      </div>
      <div style={{ display: "flex", gap: 24, padding: "20px 32px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <DescriptionCard text={c.description} />
        <AssessmentSection title="Completed Forms/Assessments" items={c.completedForms} columns={2} />
        <AssessmentSection title="Data, AI & Privacy Assessments" items={c.ourAssessments} columns={2} />
      </div>
      {(c.stage === "new" || c.stage === "inProgress") && (
        <div style={{ padding: "0 32px 24px" }}>
          {c.stage === "new" ? (
            <button
              onClick={() => onStart(c.id, c.stageKey)}
              style={{ padding: "10px 22px", border: "none", borderRadius: 8, background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              Start Review
            </button>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              style={{ padding: "10px 22px", border: "none", borderRadius: 8, background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              Mark Complete
            </button>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmCompleteModal
          vendorName={c.vendorName}
          teamLabel={teamName}
          onConfirm={() => { onComplete(c.id, c.stageKey); setConfirming(false); }}
          onCancel={() => setConfirming(false)}
        />
      )}
      <div style={{ position: "fixed", bottom: 24, right: 24 }}>
        <button style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #0f4c3a", background: "#fff", color: "#0f4c3a", fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>?</button>
      </div>
    </div>
  );
}
