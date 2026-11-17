import { useState } from "react";

const HELP: Record<"bo" | "team", { title: string; points: string[] }> = {
  bo: {
    title: "Business Owner help",
    points: [
      "Start a vendor assessment: download the blank TPRM workbook, fill it in, then upload it. VendorTrace reads it and works out which teams and assessments apply.",
      "New = with the case admin for a quick check. In Progress = with the review teams. Completed = signed off by Risk.",
      "If a PIA, Data & AI Impact Assessment or UpGuard assessment is needed, open the case and click “Mark complete” once you've finished it.",
      "You'll get a reminder every 7 days until each required assessment is marked complete.",
    ],
  },
  team: {
    title: "Review team help",
    points: [
      "New Cases: it's your team's turn. Click Start, then Complete when your review is done.",
      "Upcoming: your team is later in the path for this case.",
      "Other Open Cases: cases your team isn't part of, for visibility only.",
      "Teams review in order; the next team is notified when you complete your step. Risk signs off last.",
    ],
  },
};

export default function HelpButton({ audience }: { audience: "bo" | "team" }) {
  const [open, setOpen] = useState(false);
  const help = HELP[audience];
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
      {open && (
        <div role="dialog" aria-label={help.title} style={{ width: 340, maxWidth: "calc(100vw - 48px)", background: "#fff", borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,0.16)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ background: "#0f4c3a", color: "#fff", padding: "10px 16px", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center" }}>
            {help.title}
            <button onClick={() => setOpen(false)} aria-label="Close help" style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#fff", fontSize: 16, cursor: "pointer" }}>×</button>
          </div>
          <ul style={{ margin: 0, padding: "12px 16px 14px 32px", fontSize: 12.5, lineHeight: 1.55, color: "#334155", display: "flex", flexDirection: "column", gap: 6 }}>
            {help.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Help"
        aria-expanded={open}
        style={{ width: 52, height: 52, borderRadius: "50%", border: "2.5px solid #0f4c3a", background: "#fff", color: "#0f4c3a", fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        ?
      </button>
    </div>
  );
}
