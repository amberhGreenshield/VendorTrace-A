import Header from "../components/Header";
import { TeamViewCase } from "../lib/viewAdapters";

interface TeamSnapshotProps {
  teamName?: string;
  cases: TeamViewCase[];
  onOpenDashboard: () => void;
  onLogout?: () => void;
  /** True if the database says this person is an admin (see api/README.md). */
  isAdmin?: boolean;
  onOpenAdminPanel?: () => void;
}

export default function TeamSnapshot({ teamName = "Your Team", cases, onOpenDashboard, onLogout, isAdmin, onOpenAdminPanel }: TeamSnapshotProps) {
  const openCases = cases.filter((c) => c.stage !== "completed").length;
  const newCases = cases.filter((c) => c.stage === "new").length;
  const closed = cases.filter((c) => c.stage === "completed").length;
  const recentlyCompleted = cases.filter((c) => c.stage === "completed").slice(0, 3);
  const overviewCases = cases.slice(0, 4);

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header
        title={"Welcome Back, " + teamName + " 👋"}
        rightContent={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isAdmin && (
              <span style={{ background: "rgba(255,255,255,0.18)", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                Admin
              </span>
            )}
            <span style={{ fontSize: 14, opacity: 0.85 }}>Team View</span>
            {onOpenAdminPanel && (
              <button
                onClick={onOpenAdminPanel}
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Add Team Member
              </button>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Sign Out
              </button>
            )}
          </div>
        }
      />
      <div style={{ display: "flex", gap: 20, padding: "28px 32px 0", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ background: "#5f9ea0", color: "#fff", borderRadius: "8px 8px 0 0", padding: "8px 16px", fontSize: 13, fontWeight: 600 }}>📷 Team Snapshot</div>
          <div style={{ background: "#e8ecee", borderRadius: "0 0 8px 8px", padding: "16px", fontSize: 13, color: "#334155", lineHeight: 1.8 }}>
            <div>Open Cases: <strong>{openCases}</strong></div>
            <div>New Cases: <strong>{newCases}</strong></div>
            <div>Closed: <strong>{closed}</strong></div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ background: "#5f9ea0", color: "#fff", borderRadius: "8px 8px 0 0", padding: "8px 16px", fontSize: 13, fontWeight: 600, textAlign: "center" }}>Recently Completed</div>
          <div style={{ background: "#e8ecee", borderRadius: "0 0 8px 8px", padding: "16px", fontSize: 13, color: "#334155", lineHeight: 1.9 }}>
            {recentlyCompleted.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>No completed cases yet.</div>
            ) : (
              recentlyCompleted.map((c) => <div key={c.id}>• {c.caseNumber} – {c.vendorName}</div>)
            )}
          </div>
        </div>
        <div style={{ paddingTop: 4 }}>
          <button onClick={onOpenDashboard} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", border: "2px solid #0f4c3a", borderRadius: 8, background: "#fff", color: "#0f4c3a", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            📋 Team Dashboard
          </button>
        </div>
      </div>
      <div style={{ padding: "24px 32px 0" }}>
        <div style={{ background: "#5f9ea0", color: "#fff", borderRadius: "8px 8px 0 0", padding: "8px 16px", fontSize: 13, fontWeight: 600 }}>📁 Case Overview</div>
        <div style={{ background: "#e8ecee", borderRadius: "0 0 8px 8px", padding: "16px 20px" }}>
          {overviewCases.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "#334155", padding: "8px 0", borderBottom: "1px solid #d7dde0" }}>
              <span style={{ fontWeight: 700, color: "#0f4c3a", minWidth: 60 }}>{c.caseNumber}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{c.vendorName}</span>
              <span style={{ color: "#64748b" }}>{c.stage === "completed" ? "Complete" : c.teamName ?? "In Review"}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "fixed", bottom: 24, right: 24 }}>
        <button style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #0f4c3a", background: "#fff", color: "#0f4c3a", fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>?</button>
      </div>
    </div>
  );
}
