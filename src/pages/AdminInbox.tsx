import { useState } from "react";
import Header from "../components/Header";
import { Case, TEAM_LABELS } from "../lib/schema";
import { ADMIN_STAGE_KEY } from "../lib/hierarchy";
import { onboardingDurationDays } from "../lib/caseEngine";

// Case admins only. Every new case lands here first (the "Admin Review"
// stage), so the admin can check / rearrange its hierarchy before releasing
// it to the review teams. Admins can also open any other open case and
// adjust the part of its hierarchy that hasn't started yet.

type Tab = "inbox" | "open" | "completed";

const TABS: { key: Tab; label: string }[] = [
  { key: "inbox", label: "Admin Inbox" },
  { key: "open", label: "All Open Cases" },
  { key: "completed", label: "Completed" },
];

function inAdminInbox(c: Case): boolean {
  const s = c.stages.find((st) => st.stageKey === ADMIN_STAGE_KEY);
  return !!s && (s.status === "active" || s.status === "inProgress");
}

function withLabel(c: Case): string {
  if (c.overallStatus === "completed") return "Completed";
  const active = c.stages.filter((s) => s.status === "active" || s.status === "inProgress");
  if (active.length === 0) return "—";
  return Array.from(new Set(active.map((s) => TEAM_LABELS[s.team]))).join(" + ");
}

interface Props {
  cases: Case[];
  onBack: () => void;
  onOpenCase: (c: Case) => void;
}

export default function AdminInbox({ cases, onBack, onOpenCase }: Props) {
  const [tab, setTab] = useState<Tab>("inbox");

  const buckets: Record<Tab, Case[]> = {
    inbox: cases.filter(inAdminInbox),
    open: cases.filter((c) => c.overallStatus !== "completed" && !inAdminInbox(c)),
    completed: cases.filter((c) => c.overallStatus === "completed"),
  };
  const rows = buckets[tab];

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header title="Admin — Case Hierarchies" subtitle="Admin" onBack={onBack} />
      <div style={{ padding: "20px 32px 0", fontSize: 13, color: "#64748b", maxWidth: 900, lineHeight: 1.6 }}>
        New cases stop here before any review team sees them. Open a case to check its review hierarchy, rearrange it or add
        teams, then release it — it will move through the hierarchy exactly as you left it.
      </div>
      <div style={{ display: "flex", gap: 8, padding: "16px 32px 0" }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 24px", borderRadius: 10, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer",
                background: active ? "#0f4c3a" : "#e2e8f0", color: active ? "#fff" : "#64748b",
              }}
            >
              {t.label}
              <span
                style={{
                  marginLeft: 8, background: active ? "rgba(255,255,255,0.22)" : "#cbd5e1", color: active ? "#fff" : "#475569",
                  borderRadius: 12, padding: "1px 8px", fontSize: 12,
                }}
              >
                {buckets[t.key].length}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ margin: "20px 32px", background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div style={{ padding: "48px 32px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            {tab === "inbox" ? "Nothing waiting for you — new cases will appear here." : "No cases here."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Case ID", "Vendor", "Business Owner", "Risk Tier", "Currently With", "Hierarchy", "Age", ""].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 700, color: "#0f4c3a" }}>{c.caseNumber}</td>
                  <td style={{ padding: "14px 16px", color: "#334155", fontWeight: 500 }}>{c.vendorName}</td>
                  <td style={{ padding: "14px 16px", color: "#64748b" }}>{c.businessOwner}</td>
                  <td style={{ padding: "14px 16px", color: "#64748b" }}>{c.riskTier ?? "—"}</td>
                  <td style={{ padding: "14px 16px", color: "#64748b" }}>{withLabel(c)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    {c.hierarchyEditedAt ? (
                      <span style={{ background: "#eef2ff", color: "#4338ca", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                        Customized
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>Default</span>
                    )}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#64748b" }}>{onboardingDurationDays(c)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <button
                      onClick={() => onOpenCase(c)}
                      style={{
                        padding: "6px 14px", border: "1.5px solid #0f4c3a", borderRadius: 6, background: "#fff", color: "#0f4c3a",
                        fontWeight: 600, fontSize: 12, cursor: "pointer",
                      }}
                    >
                      {tab === "completed" ? "View" : "Open"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
