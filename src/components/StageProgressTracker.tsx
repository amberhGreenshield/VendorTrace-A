import { CaseStage } from "../lib/schema";

const STATUS_STYLES: Record<CaseStage["status"], { bg: string; color: string; label: string }> = {
  skipped: { bg: "#f1f5f9", color: "#94a3b8", label: "Skipped" },
  pending: { bg: "#f1f5f9", color: "#94a3b8", label: "Not started" },
  active: { bg: "#fef3c7", color: "#92400e", label: "Up next" },
  inProgress: { bg: "#dbeafe", color: "#1e40af", label: "In progress" },
  completed: { bg: "#dcfce7", color: "#166534", label: "Complete" },
};

interface StageProgressTrackerProps {
  stages: CaseStage[];
}

export default function StageProgressTracker({ stages }: StageProgressTrackerProps) {
  // Only show teams actually relevant to this case — a skipped stage means
  // the TPRM answers didn't trigger that team, so it shouldn't clutter the
  // hierarchy view at all (not even grayed out).
  const relevantStages = stages.filter((s) => s.status !== "skipped");
  const seqOrders = Array.from(new Set(relevantStages.map((s) => s.seqOrder))).sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "4px 2px" }}>
      {seqOrders.map((seq, i) => {
        const stagesAtSeq = relevantStages.filter((s) => s.seqOrder === seq);
        return (
          <div key={seq} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stagesAtSeq.map((s) => {
                const style = STATUS_STYLES[s.status];
                return (
                  <div
                    key={s.stageKey}
                    title={style.label}
                    style={{
                      background: style.bg, color: style.color,
                      borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.label}
                  </div>
                );
              })}
            </div>
            {i < seqOrders.length - 1 && <span style={{ color: "#cbd5e1", fontSize: 14 }}>→</span>}
          </div>
        );
      })}
    </div>
  );
}
