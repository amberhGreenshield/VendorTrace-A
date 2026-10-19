import { Case } from "../lib/schema";
import StageProgressTracker from "./StageProgressTracker";

// Shown at the very top of every case page (team, BO and admin views) so
// everyone sees the case's CURRENT review hierarchy — including any changes
// an admin made — before anything else.

interface Props {
  case_: Case;
}

export default function CaseHierarchyBanner({ case_: c }: Props) {
  const edited = !!c.hierarchyEditedAt;
  return (
    <div style={{ padding: "20px 32px 0" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: "12px 16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          borderLeft: edited ? "4px solid #6366f1" : "4px solid #0f4c3a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 0.4 }}>REVIEW HIERARCHY</span>
          {edited && (
            <span
              title={`Updated ${new Date(c.hierarchyEditedAt!).toLocaleString()}`}
              style={{ background: "#eef2ff", color: "#4338ca", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}
            >
              ✎ Customized by {c.hierarchyEditedBy ?? "an admin"} · {new Date(c.hierarchyEditedAt!).toLocaleDateString()}
            </span>
          )}
        </div>
        <StageProgressTracker stages={c.stages} />
      </div>
    </div>
  );
}
