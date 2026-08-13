import { useState } from "react";
import Header from "../components/Header";
import { Case } from "../lib/schema";
import { currentStateLabel, assessmentsToCompleteList } from "../lib/boViewHelpers";
import { nextReviewTeam, onboardingDurationDays } from "../lib/caseEngine";

type TabKey = "new" | "inProgress" | "completed";
const TABS: { key: TabKey; label: string }[] = [
  { key: "new", label: "New Cases" },
  { key: "inProgress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];
const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  "Tier 1": { bg: "#fee2e2", color: "#991b1b" },
  "Tier 2": { bg: "#fef3c7", color: "#92400e" },
  "Tier 3": { bg: "#dcfce7", color: "#166534" },
};

interface BusinessOwnerDashboardProps {
  onBack?: () => void;
  onOpenCase?: (c: Case) => void;
  onNewCase?: () => void;
  cases: Case[];
}

export default function BusinessOwnerDashboard({ onBack, onOpenCase, onNewCase, cases }: BusinessOwnerDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("new");
  const filteredCases = cases.filter((c) => c.overallStatus === activeTab);
  const counts: Record<TabKey, number> = {
    new: cases.filter((c) => c.overallStatus === "new").length,
    inProgress: cases.filter((c) => c.overallStatus === "inProgress").length,
    completed: cases.filter((c) => c.overallStatus === "completed").length,
  };

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header title="My Dashboard" subtitle="Business Owner" onBack={onBack} />
      <div style={{ display: "flex", gap: 16, padding: "20px 32px 0", alignItems: "center" }}>
        {(["new", "inProgress", "completed"] as TabKey[]).map((s) => (
          <div key={s} style={{ background: "#fff", borderRadius: 10, padding: "10px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 90 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#334155" }}>{counts[s]}</span>
            <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s === "new" ? "New" : s === "inProgress" ? "In Progress" : "Completed"}</span>
          </div>
        ))}
        {onNewCase && (
          <button
            onClick={onNewCase}
            style={{ marginLeft: "auto", padding: "10px 20px", border: "none", borderRadius: 8, background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
          >
            + Start New Vendor Assessment
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "20px 32px 0" }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: "10px 28px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.15s", background: active ? "#0f4c3a" : "#e2e8f0", color: active ? "#fff" : "#64748b", boxShadow: active ? "0 2px 8px rgba(15,76,58,0.18)" : "none" }}>
              {tab.label}
              <span style={{ marginLeft: 8, background: active ? "rgba(255,255,255,0.22)" : "#cbd5e1", color: active ? "#fff" : "#475569", borderRadius: 12, padding: "1px 8px", fontSize: 12 }}>
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ margin: "20px 32px", background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {filteredCases.length === 0 ? (
            <div style={{ padding: "48px 32px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              No {activeTab === "new" ? "new" : activeTab === "inProgress" ? "in-progress" : "completed"} cases.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Case ID</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Vendor</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Risk Tier</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Current State</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Next Review</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Onboarding Duration</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Actions Needed</th>
                  <th style={{ padding: "12px 16px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c, i) => {
                  const tierColor = TIER_COLORS[c.riskTier ?? ""] ?? { bg: "#f1f5f9", color: "#64748b" };
                  const actionsNeeded = assessmentsToCompleteList(c);
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "#0f4c3a" }}>{c.caseNumber}</td>
                      <td style={{ padding: "14px 16px", color: "#334155", fontWeight: 500 }}>{c.vendorName}</td>
                      <td style={{ padding: "14px 16px" }}>
                        {c.riskTier && (
                          <span style={{ background: tierColor.bg, color: tierColor.color, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                            {c.riskTier}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#64748b" }}>{currentStateLabel(c)}</td>
                      <td style={{ padding: "14px 16px", color: "#64748b" }}>{nextReviewTeam(c)}</td>
                      <td style={{ padding: "14px 16px", color: "#64748b" }}>{onboardingDurationDays(c)}</td>
                      <td style={{ padding: "14px 16px", color: "#64748b" }}>
                        {actionsNeeded.length > 0 ? actionsNeeded.map((a) => a.label).join(", ") : "—"}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <button onClick={() => onOpenCase?.(c)} style={{ padding: "6px 16px", border: "1.5px solid #0f4c3a", borderRadius: 6, background: "#fff", color: "#0f4c3a", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div style={{ position: "fixed", bottom: 24, right: 24 }}>
        <button style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #0f4c3a", background: "#fff", color: "#0f4c3a", fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>?</button>
      </div>
    </div>
  );
}
