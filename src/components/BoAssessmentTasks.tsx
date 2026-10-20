import { useState } from "react";
import { Case, CaseAssessment } from "../lib/schema";
import { daysOutstanding, outstandingAssessments } from "../lib/boViewHelpers";
import { ASSESSMENT_OWNER_TEAMS } from "../lib/caseEngine";
import { TEAM_LABELS } from "../lib/schema";

// The business owner's to-do list of assessments (PIA / DIA / UpGuard), each
// with "Mark complete". Marking one complete moves it to the completed
// section for every team on the case, stops reminders, and emails the
// owning team(s).

const TEMPLATES: Record<string, string> = {
  PIA: "/templates/PIA_Template.docx",
  DataAIImpactAssessment: "/templates/Data_AI_Impact_Assessment_Template.docx",
};

function ownerLabel(a: CaseAssessment): string {
  const owners = ASSESSMENT_OWNER_TEAMS[a.key] ?? [];
  return owners.map((t) => TEAM_LABELS[t]).join(" & ") || "the reviewing team";
}

interface Props {
  case_: Case;
  onMark: (key: string, action: "complete" | "reopen") => Promise<void>;
}

export default function BoAssessmentTasks({ case_: c, onMark }: Props) {
  const outstanding = outstandingAssessments(c);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function mark(key: string) {
    setBusyKey(key);
    setError("");
    try {
      await onMark(key, "complete");
      setConfirmKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the assessment.");
    } finally {
      setBusyKey(null);
    }
  }

  if (outstanding.length === 0) return null;

  return (
    <div style={{ flex: 1, minWidth: 320 }}>
      <div style={{ background: "#0f4c3a", color: "#fff", borderRadius: "8px 8px 0 0", padding: "10px 16px", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
        Assessments To Be Completed
      </div>
      <div style={{ background: "#f1f5f9", borderRadius: "0 0 8px 8px", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {outstanding.map((a) => {
          const days = daysOutstanding(a);
          const overdue = days !== undefined && days >= 7;
          const link = a.fileUrl ?? TEMPLATES[a.key];
          const confirming = confirmKey === a.key;
          return (
            <div key={a.key} style={{ background: "#fff", border: "1.5px solid #cbd5e1", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f4c3a", flex: 1 }}>{a.label}</span>
                {days !== undefined && (
                  <span
                    title={overdue ? "You'll get a reminder email every 7 days until this is marked complete." : undefined}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "2px 8px",
                      background: overdue ? "#fef3c7" : "#f1f5f9", color: overdue ? "#92400e" : "#64748b",
                    }}
                  >
                    {days === 0 ? "Assigned today" : `Assigned ${days} day${days === 1 ? "" : "s"} ago`}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {a.note ?? <>Reviewed by {ownerLabel(a)}.</>}
                {link && (
                  <>
                    {" "}
                    <a href={link} target="_blank" rel="noreferrer" style={{ color: "#0f4c3a", fontWeight: 600 }}>
                      {a.fileUrl ? "Open in SharePoint" : "Download template"}
                    </a>
                  </>
                )}
              </div>
              {confirming ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 10px" }}>
                  <span style={{ fontSize: 12, color: "#166534", flex: 1, minWidth: 180 }}>
                    Mark the {a.label} complete? {ownerLabel(a)} will be emailed that it's ready.
                  </span>
                  <button
                    onClick={() => mark(a.key)}
                    disabled={busyKey === a.key}
                    style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                  >
                    {busyKey === a.key ? "Saving…" : "Yes, mark complete"}
                  </button>
                  <button
                    onClick={() => setConfirmKey(null)}
                    style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmKey(a.key)}
                  style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 6, border: "1.5px solid #0f4c3a", background: "#fff", color: "#0f4c3a", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                >
                  ✓ Mark complete
                </button>
              )}
            </div>
          );
        })}
        {error && <div style={{ fontSize: 12, color: "#dc2626" }}>{error}</div>}
      </div>
    </div>
  );
}
