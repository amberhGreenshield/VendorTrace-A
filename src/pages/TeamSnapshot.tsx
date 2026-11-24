import type { ReactNode } from "react";
import Header from "../components/Header";
import { TeamViewCase } from "../lib/viewAdapters";
import HelpButton from "../components/HelpButton";

interface TeamSnapshotProps {
  teamName?: string;
  userName?: string;
  cases: TeamViewCase[];
  onOpenDashboard: () => void;
  onLogout?: () => void;
  /** True if the database says this person is an admin (see api/README.md). */
  isCaseAdmin?: boolean;
  /** "View as" picker for people with several VendorTrace roles. */
  viewSwitcher?: ReactNode;
  /** Case admins only — opens the Admin Inbox / hierarchy editor. */
  onOpenAdminInbox?: () => void;
  adminInboxCount?: number;
}

export default function TeamSnapshot({ teamName = "Your Team", userName, cases, onOpenDashboard, onLogout, isCaseAdmin, viewSwitcher, onOpenAdminInbox, adminInboxCount }: TeamSnapshotProps) {
  // "Other" cases (not this team's) are visibility-only — they don't count
  // toward the team's workload or show in its overview.
  const ours = cases.filter((c) => c.stage !== "other");
  const openCases = ours.filter((c) => c.stage === "new" || c.stage === "inProgress").length;
  const newCases = ours.filter((c) => c.stage === "new").length;
  const upcoming = ours.filter((c) => c.stage === "upcoming").length;
  const closed = ours.filter((c) => c.stage === "completed").length;
  const otherOpen = cases.length - ours.length;
  const recentlyCompleted = ours.filter((c) => c.stage === "completed").slice(0, 3);
  const overviewCases = ours.slice(0, 4);

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header
        title={"Welcome Back, " + (userName || teamName) + " 👋"}
        subtitle={userName ? teamName + " team" : undefined}
        rightContent={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isCaseAdmin && (
              <span style={{ background: "rgba(255,255,255,0.18)", borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                Case Admin
              </span>
            )}
            {viewSwitcher ?? <span style={{ fontSize: 14, opacity: 0.85 }}>Team View</span>}
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
      <div style={{ display: "flex", gap: 20, padding: "28px 32px 0", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ background: "#5f9ea0", color: "#fff", borderRadius: "8px 8px 0 0", padding: "8px 16px", fontSize: 13, fontWeight: 600 }}>📷 Team Snapshot</div>
          <div style={{ background: "#e8ecee", borderRadius: "0 0 8px 8px", padding: "16px", fontSize: 13, color: "#334155", lineHeight: 1.8 }}>
            <div>Open Cases: <strong>{openCases}</strong></div>
            <div>New Cases: <strong>{newCases}</strong></div>
            <div>Upcoming: <strong>{upcoming}</strong></div>
            <div>Closed: <strong>{closed}</strong></div>
            <div style={{ color: "#64748b" }}>Other open cases (view only): <strong>{otherOpen}</strong></div>
          </div>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ background: "#5f9ea0", color: "#fff", borderRadius: "8px 8px 0 0", padding: "8px 16px", fontSize: 13, fontWeight: 600, textAlign: "center" }}>Recently Completed</div>
          <div style={{ background: "#e8ecee", borderRadius: "0 0 8px 8px", padding: "16px", fontSize: 13, color: "#334155", lineHeight: 1.9 }}>
            {recentlyCompleted.length === 0 ? (
              <div style={{ color: "#94a3b8" }}>No completed cases yet.</div>
            ) : (
              recentlyCompleted.map((c) => <div key={c.id}>• {c.caseNumber} – {c.vendorName}</div>)
            )}
          </div>
        </div>
        <div style={{ paddingTop: 4, display: "flex", flexDirection: "column", gap: 10 }}>
          {onOpenAdminInbox && (
            <button
              onClick={onOpenAdminInbox}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", border: "none", borderRadius: 8, background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              🗂️ Admin Inbox
              {!!adminInboxCount && (
                <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 700 }}>{adminInboxCount}</span>
              )}
            </button>
          )}
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
              <span style={{ color: "#64748b" }}>{c.stage === "completed" ? "Complete" : c.stage === "upcoming" ? `Upcoming · with ${c.currentlyWith}` : c.currentlyWith}</span>
            </div>
          ))}
        </div>
      </div>
      <HelpButton audience="team" />
    </div>
  );
}
