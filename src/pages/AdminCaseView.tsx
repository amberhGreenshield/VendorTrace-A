import { useCallback, useState } from "react";
import Header from "../components/Header";
import DescriptionCard from "../components/DescriptionCard";
import AssessmentSection from "../components/AssessmentSection";
import CaseHierarchyBanner from "../components/CaseHierarchyBanner";
import HierarchyEditor from "../components/HierarchyEditor";
import RequiredAssessmentNotice from "../components/RequiredAssessmentNotice";
import { Case } from "../lib/schema";
import { ADMIN_STAGE_KEY } from "../lib/hierarchy";
import { ApiError, HierarchyEditStage } from "../lib/apiClient";
import { nextReviewTeam, onboardingDurationDays } from "../lib/caseEngine";

interface Props {
  case_: Case;
  onBack: () => void;
  onSaveHierarchy: (caseId: string, stages: HierarchyEditStage[], basedOnUpdatedAt?: string) => Promise<void>;
  /** Completes the Admin Review stage, which hands the case to step 1 of its (possibly edited) hierarchy. */
  onRelease: (caseId: string) => Promise<void>;
}

export default function AdminCaseView({ case_: c, onBack, onSaveHierarchy, onRelease }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [staleFromServer, setStaleFromServer] = useState(false);
  // Once the editor is back to a clean state (saved, undone or reloaded), any
  // earlier error about the old draft no longer applies.
  const handleDirtyChange = useCallback((d: boolean) => {
    setDirty(d);
    if (!d) {
      setError("");
      setStaleFromServer(false);
    }
  }, []);

  const adminStage = c.stages.find((s) => s.stageKey === ADMIN_STAGE_KEY);
  const inInbox = adminStage?.status === "active" || adminStage?.status === "inProgress";
  const completed = c.overallStatus === "completed";

  async function handleSave(stages: HierarchyEditStage[], basedOnUpdatedAt?: string) {
    setSaving(true);
    setError("");
    setSavedMsg("");
    try {
      await onSaveHierarchy(c.id, stages, basedOnUpdatedAt);
      setEditorResetKey((k) => k + 1);
      setSavedMsg(inInbox ? "Hierarchy saved. Release the case when you're ready." : "Hierarchy saved — the case will follow the new order from here.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "STALE_CASE") {
        // The editor shows its own "case changed — Load latest" banner for this.
        setStaleFromServer(true);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't save the hierarchy.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRelease() {
    setReleasing(true);
    setError("");
    try {
      await onRelease(c.id);
      setConfirmRelease(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't release the case.");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9", paddingBottom: 40 }}>
      <Header onBack={onBack} title={"Case: " + c.caseNumber} subtitle={"Vendor: " + c.vendorName + " · Admin"} />

      <CaseHierarchyBanner case_={c} />

      <div style={{ display: "flex", gap: 16, padding: "16px 32px 0", flexWrap: "wrap" }}>
        {[
          { label: "Business Owner", value: c.businessOwner },
          { label: "Business Sponsor", value: c.businessSponsor },
          { label: "Risk Tier", value: c.riskTier },
          { label: "Criticality", value: c.criticality },
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

      <RequiredAssessmentNotice case_={c} audience="team" />

      <div style={{ padding: "20px 32px 0" }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f4c3a" }}>Edit review hierarchy</h2>
            {inInbox && (
              <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                In your inbox — no team has been notified yet
              </span>
            )}
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#64748b", lineHeight: 1.6 }}>
            Steps run left to right; teams in the same step review in parallel. Drag stages between steps, drop a team from the
            palette to add it, or ✕ to remove one. 🔒 marks finished or started work, which can't move. A team dropped into the
            step marked <strong>IN REVIEW</strong> gets the case in their inbox as soon as you save. Adding Privacy requires a PIA,
            and adding Data or AI requires a DIA — the business owner is shown the requirement and the document link.
          </p>
          {completed ? (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>This case is complete — its hierarchy can no longer be changed.</div>
          ) : (
            <HierarchyEditor stages={c.stages} updatedAt={c.updatedAt} resetKey={editorResetKey} staleFromServer={staleFromServer} saving={saving} error={error} onSave={handleSave} onDirtyChange={handleDirtyChange} />
          )}
          {savedMsg && !error && (
            <div style={{ marginTop: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#166534" }}>
              {savedMsg}
            </div>
          )}
        </div>
      </div>

      {inInbox && (
        <div style={{ padding: "16px 32px 0" }}>
          <div
            style={{
              background: "#0f4c3a", color: "#fff", borderRadius: 12, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Release to review teams</div>
              <div style={{ fontSize: 12.5, opacity: 0.85 }}>
                {dirty
                  ? "You have unsaved hierarchy changes — save or undo them before releasing."
                  : <>Moves the case out of your inbox and notifies step 1 ({nextReviewTeam(c)}).</>}
              </div>
            </div>
            {confirmRelease ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleRelease}
                  disabled={releasing}
                  style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#fff", color: "#0f4c3a", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {releasing ? "Releasing…" : "Yes, release it"}
                </button>
                <button
                  onClick={() => setConfirmRelease(false)}
                  style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.5)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRelease(true)}
                disabled={dirty}
                title={dirty ? "Save or undo your hierarchy changes first" : undefined}
                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: dirty ? "#cbd5e1" : "#fff", color: "#0f4c3a", fontWeight: 700, fontSize: 13, cursor: dirty ? "not-allowed" : "pointer" }}
              >
                Release case →
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, padding: "20px 32px 0", alignItems: "flex-start", flexWrap: "wrap" }}>
        <DescriptionCard text={c.description} />
        <AssessmentSection title="Completed Forms" items={c.completedForms} columns={2} />
        <AssessmentSection
          title="Required Assessments"
          items={c.assessments.filter((a) => a.applicable).map((a) => ({ id: a.key, label: a.label, fileUrl: a.fileUrl, note: a.note }))}
          columns={2}
        />
      </div>
    </div>
  );
}
