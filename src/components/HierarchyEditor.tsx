import { useEffect, useMemo, useRef, useState } from "react";
import { ASSESSOR_TEAMS, CaseStage, TeamKey, TEAM_LABELS } from "../lib/schema";
import { hierarchyFrontier, isFrontierJoinable, isFrozenStage, STAGE_DEFINITIONS } from "../lib/hierarchy";
import { HierarchyEditStage } from "../lib/apiClient";

// ─── Drag-and-drop hierarchy editor (case admins only) ──────────────────────
// Columns are steps; stages in the same column run in parallel. Admins can:
//   • drag a stage chip to another step, or onto a "+" gap to create a new step
//   • drag a team from the palette into any step / gap to add it
//   • remove a stage with ✕ (unless it's always required)
// Work that has started (in progress / completed) and the Admin Review stage
// are locked (🔒). A team that has the case but hasn't clicked Start yet can
// still be moved or removed. While a step is under review, teams can be
// dropped INTO it and land in their inbox right away on save.
// Nothing is saved until "Save hierarchy" is pressed; the server re-validates.

const ALWAYS_REQUIRED = new Set(STAGE_DEFINITIONS.filter((d) => d.alwaysRequired).map((d) => d.key));

/** Teams whose presence makes an assessment required — shown as a badge on the chip. */
const TEAM_ASSESSMENT_BADGE: Partial<Record<TeamKey, string>> = {
  Privacy: "PIA",
  Data: "DIA",
  AI: "DIA",
  SecurityGovernance: "UpGuard",
};

interface DraftStage {
  /** Undefined for stages added in this editing session. */
  stageKey?: string;
  /** Local id so React and drag/drop can track new stages too. */
  uid: string;
  team: TeamKey;
  label: string;
  seqOrder: number;
  frozen: boolean;
  status: CaseStage["status"];
}

type DragPayload = { kind: "stage"; uid: string } | { kind: "team"; team: TeamKey };

const STATUS_STYLE: Record<CaseStage["status"], { bg: string; border: string; color: string; text: string }> = {
  completed: { bg: "#dcfce7", border: "#86efac", color: "#166534", text: "Complete" },
  inProgress: { bg: "#dbeafe", border: "#93c5fd", color: "#1e40af", text: "In progress" },
  active: { bg: "#fef3c7", border: "#fcd34d", color: "#92400e", text: "With team — not started" },
  pending: { bg: "#fff", border: "#cbd5e1", color: "#0f4c3a", text: "Upcoming" },
  skipped: { bg: "#f8fafc", border: "#e2e8f0", color: "#94a3b8", text: "Not in hierarchy" },
};

function toDraft(stages: CaseStage[]): DraftStage[] {
  return stages
    .filter((s) => s.status !== "skipped")
    .map((s) => ({
      stageKey: s.stageKey,
      uid: s.stageKey,
      team: s.team,
      label: s.label,
      seqOrder: s.seqOrder,
      frozen: isFrozenStage(s),
      status: s.status,
    }));
}

/** Squash step numbers so they're 0..n with no gaps, preserving order. */
function normalize(draft: DraftStage[]): DraftStage[] {
  const seqs = Array.from(new Set(draft.map((d) => d.seqOrder))).sort((a, b) => a - b);
  const map = new Map(seqs.map((s, i) => [s, i]));
  return draft.map((d) => ({ ...d, seqOrder: map.get(d.seqOrder)! }));
}

function serialize(d: DraftStage[]) {
  return d
    .filter((s) => !s.frozen)
    .map((s) => ({ stageKey: s.stageKey, team: s.team, seqOrder: s.seqOrder }))
    .sort((a, b) => a.seqOrder - b.seqOrder || String(a.stageKey).localeCompare(String(b.stageKey)));
}

/** Everything about a hierarchy that matters for editing — used to tell a real change from a no-op refresh. */
function signature(list: CaseStage[]): string {
  return JSON.stringify(list.map((x) => [x.stageKey, x.team, x.status, x.seqOrder, x.label]).sort());
}

interface HierarchyEditorProps {
  stages: CaseStage[];
  /** The case's updatedAt for the `stages` passed in — sent back with the save so the server can refuse an edit built on an old version. */
  updatedAt?: string;
  saving: boolean;
  error?: string;
  onSave: (stages: HierarchyEditStage[], basedOnUpdatedAt?: string) => void;
  /** Set by the parent when the server refused a save because the case had changed (409 STALE_CASE). */
  staleFromServer?: boolean;
  /** Bumped by the parent after a successful save — the editor then adopts the saved version as its new starting point. */
  resetKey?: number;
  /** Tells the parent whether there are unsaved changes (used to block "Release" until they're saved). */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function HierarchyEditor({ stages, updatedAt, saving, error, onSave, onDirtyChange, resetKey = 0, staleFromServer = false }: HierarchyEditorProps) {
  // `base` is the version of the case the admin is editing. The app also
  // refreshes cases in the background (every minute / on focus), which hands
  // us a new `stages` array even when nothing changed, so only react when the
  // hierarchy itself changed:
  //  - no unsaved edits → quietly move to the latest
  //  - unsaved edits    → keep them, but warn (saving would be refused as stale)
  const [base, setBase] = useState(() => ({ sig: signature(stages), stages, updatedAt }));
  const initial = useMemo(() => normalize(toDraft(base.stages)), [base.stages]);
  const [draft, setDraft] = useState<DraftStage[]>(initial);
  const [staleWhileEditing, setStaleWhileEditing] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const newCounter = useRef(0);

  const dirty = JSON.stringify(serialize(draft)) !== JSON.stringify(serialize(initial));
  const incomingSig = signature(stages);
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (resetKey !== seenResetKey) {
    // Our own save just landed — start fresh from what was saved.
    setSeenResetKey(resetKey);
    setBase({ sig: incomingSig, stages, updatedAt });
    setDraft(normalize(toDraft(stages)));
    if (staleWhileEditing) setStaleWhileEditing(false);
  } else if (saving) {
    // Mid-save: the case is about to change because of us; don't flag it.
  } else if (incomingSig !== base.sig) {
    if (dirty) {
      if (!staleWhileEditing) setStaleWhileEditing(true);
    } else {
      setBase({ sig: incomingSig, stages, updatedAt });
      setDraft(normalize(toDraft(stages)));
      if (staleWhileEditing) setStaleWhileEditing(false);
    }
  } else if (base.updatedAt !== updatedAt) {
    // Same hierarchy, newer timestamp (e.g. after our own save) — track it silently.
    setBase({ sig: incomingSig, stages, updatedAt });
  }
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  function loadLatest() {
    setBase({ sig: incomingSig, stages, updatedAt });
    setDraft(normalize(toDraft(stages)));
    setStaleWhileEditing(false);
  }

  // Columns are renumbered 0..n for display, so the frontier here is a column
  // index. `realFrontier` is the same step in the case's own numbering —
  // that's what the server expects back (see handleSave).
  const frontier = useMemo(() => {
    const frozen = draft.filter((d) => d.frozen);
    return frozen.length ? Math.max(...frozen.map((d) => d.seqOrder)) : -1;
  }, [draft]);
  const realFrontier = useMemo(() => hierarchyFrontier(base.stages), [base.stages]);
  /** The step under review can take extra teams (never the Admin Review step). */
  const frontierJoinable = useMemo(() => isFrontierJoinable(base.stages), [base.stages]);
  const canDropAt = (targetSeq: number) => targetSeq > frontier || (targetSeq === frontier && frontierJoinable);

  const steps = useMemo(() => Array.from(new Set(draft.map((d) => d.seqOrder))).sort((a, b) => a - b), [draft]);


  // ── Drop handling ─────────────────────────────────────────────────────────
  // A "target" is either an existing step (drop joins it, runs in parallel)
  // or a gap *before* a step (drop creates a new step there). Gaps are
  // encoded as half-steps (seq - 0.5) then normalized away.
  function dropAt(payload: DragPayload, targetSeq: number) {
    if (!canDropAt(targetSeq)) return; // can't place before (or into a locked) step
    const uid = `new-${newCounter.current++}`;
    setDraft((prev) => {
      let next: DraftStage[];
      if (payload.kind === "stage") {
        next = prev.map((d) => (d.uid === payload.uid && !d.frozen ? { ...d, seqOrder: targetSeq } : d));
      } else {
        const alreadyHasTeam = prev.some((d) => d.team === payload.team);
        next = [
          ...prev,
          {
            uid,
            team: payload.team,
            label: alreadyHasTeam ? `${TEAM_LABELS[payload.team]} (Additional Review)` : TEAM_LABELS[payload.team],
            seqOrder: targetSeq,
            frozen: false,
            status: "pending",
          },
        ];
      }
      return normalize(next);
    });
  }

  function readPayload(e: React.DragEvent): DragPayload | null {
    try {
      return JSON.parse(e.dataTransfer.getData("application/json")) as DragPayload;
    } catch {
      return null;
    }
  }

  function dropProps(id: string, targetSeq: number) {
    const allowed = canDropAt(targetSeq);
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!allowed) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOver !== id) setDragOver(id);
      },
      onDragLeave: () => setDragOver((cur) => (cur === id ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        const p = readPayload(e);
        if (p) dropAt(p, targetSeq);
      },
    };
  }

  function remove(uid: string) {
    setDraft((prev) => normalize(prev.filter((d) => d.uid !== uid)));
  }

  function handleSave() {
    // Translate display columns back to the case's own step numbers: the
    // frontier column maps to the real frontier step, later columns to
    // anything after it (the server renumbers those consecutively).
    onSave(
      draft
        .filter((d) => !d.frozen)
        .map((d) => ({ stageKey: d.stageKey, team: d.team, label: d.label, seqOrder: d.seqOrder - frontier + realFrontier })),
      base.updatedAt
    );
  }

  // Which assessments this draft will require that the saved hierarchy doesn't.
  const newlyRequired = useMemo(() => {
    const before = new Set(initial.map((d) => TEAM_ASSESSMENT_BADGE[d.team]).filter(Boolean));
    const after = new Set(draft.map((d) => TEAM_ASSESSMENT_BADGE[d.team]).filter(Boolean));
    return Array.from(after).filter((a) => !before.has(a)) as string[];
  }, [draft, initial]);
  const noLongerRequired = useMemo(() => {
    const before = new Set(initial.map((d) => TEAM_ASSESSMENT_BADGE[d.team]).filter(Boolean));
    const after = new Set(draft.map((d) => TEAM_ASSESSMENT_BADGE[d.team]).filter(Boolean));
    return Array.from(before).filter((a) => !after.has(a)) as string[];
  }, [draft, initial]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Palette */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 0.4, marginBottom: 8 }}>
          ADD A TEAM — drag onto a step, or onto a “+” gap to create a new step
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ASSESSOR_TEAMS.map((team) => (
            <div
              key={team}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/json", JSON.stringify({ kind: "team", team } satisfies DragPayload));
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              style={{
                cursor: "grab", userSelect: "none", padding: "6px 12px", borderRadius: 999,
                border: "1.5px dashed #0f4c3a", color: "#0f4c3a", background: "#f0fdf4", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}
              title={`Drag to add ${TEAM_LABELS[team]} to the hierarchy`}
            >
              ⠿ {TEAM_LABELS[team]}
              {TEAM_ASSESSMENT_BADGE[team] && <Badge text={TEAM_ASSESSMENT_BADGE[team]!} />}
            </div>
          ))}
        </div>
      </div>

      {/* Board */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto", padding: "4px 2px 8px" }}>
        {steps.map((seq, i) => {
          const items = draft.filter((d) => d.seqOrder === seq);
          const lockedStep = seq < frontier || (seq === frontier && !frontierJoinable);
          // The step that currently holds the case (any team handed it / working on it).
          const reviewStep = items.some((d) => d.team !== "Admin" && (d.status === "active" || d.status === "inProgress"));
          const gapId = `gap-${seq}`;
          const colId = `col-${seq}`;
          return (
            <div key={seq} style={{ display: "flex", alignItems: "stretch" }}>
              {i > 0 && (
                <Gap
                  active={dragOver === gapId}
                  disabled={seq - 0.5 <= frontier}
                  {...dropProps(gapId, seq - 0.5)}
                />
              )}
              <div
                {...dropProps(colId, seq)}
                style={{
                  minWidth: 190, background: dragOver === colId ? "#ecfdf5" : lockedStep ? "#f1f5f9" : "#fff",
                  border: dragOver === colId ? "2px solid #10b981" : "1.5px solid #e2e8f0", borderRadius: 10,
                  padding: 10, display: "flex", flexDirection: "column", gap: 8, transition: "background .15s",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                  <span>STEP {i + 1}</span>
                  {lockedStep && <span title="This step is finished or is the admin inbox">🔒</span>}
                  {reviewStep && (
                    <span title="Teams dropped here get the case right away" style={{ color: "#b45309", fontWeight: 600 }}>
                      IN REVIEW
                    </span>
                  )}
                </div>
                {items.map((d) => (
                  <StageChip key={d.uid} stage={d} onRemove={!d.frozen && !(d.stageKey && ALWAYS_REQUIRED.has(d.stageKey)) ? () => remove(d.uid) : undefined} />
                ))}
                {items.length > 1 && <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center" }}>run in parallel</div>}
              </div>
            </div>
          );
        })}
        <Gap active={dragOver === "gap-end"} disabled={false} last {...dropProps("gap-end", (steps[steps.length - 1] ?? 0) + 1)} />
      </div>

      {(newlyRequired.length > 0 || noLongerRequired.length > 0) && (
        <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#1e3a8a", lineHeight: 1.6 }}>
          {newlyRequired.length > 0 && (
            <div>
              📄 Saving will make the <strong>{newlyRequired.map(longName).join(" and ")}</strong> required. The business owner
              will see it on their case with a link to the document.
            </div>
          )}
          {noLongerRequired.length > 0 && (
            <div>
              Saving will mark the <strong>{noLongerRequired.map(longName).join(" and ")}</strong> as no longer required.
            </div>
          )}
        </div>
      )}

      {(staleWhileEditing || staleFromServer) && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#92400e", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ flex: 1 }}>
            ⚠️ This case changed while you were editing (a team started or finished a review). Your changes are based on the
            older version and can't be saved as-is.
          </span>
          <button
            onClick={loadLatest}
            style={{ border: "1px solid #f59e0b", background: "#fff", color: "#92400e", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Load latest
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            padding: "10px 22px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 13,
            background: !dirty || saving ? "#94a3b8" : "#0f4c3a", color: "#fff", cursor: !dirty || saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save hierarchy"}
        </button>
        <button
          onClick={loadLatest}
          disabled={!dirty || saving}
          style={{
            padding: "10px 18px", borderRadius: 8, border: "1.5px solid #cbd5e1", background: "#fff", fontWeight: 600, fontSize: 13,
            color: !dirty ? "#cbd5e1" : "#475569", cursor: !dirty ? "default" : "pointer",
          }}
        >
          Undo changes
        </button>
      </div>
    </div>
  );
}

function longName(badge: string): string {
  if (badge === "PIA") return "Privacy Impact Assessment (PIA)";
  if (badge === "DIA") return "Data & AI Impact Assessment (DIA)";
  if (badge === "UpGuard") return "UpGuard Security Assessment";
  return badge;
}

function Badge({ text }: { text: string }) {
  return (
    <span style={{ background: "#1e40af", color: "#fff", borderRadius: 4, padding: "0 5px", fontSize: 9, fontWeight: 700, letterSpacing: 0.3 }}>
      {text}
    </span>
  );
}

function StageChip({ stage, onRemove }: { stage: DraftStage; onRemove?: () => void }) {
  const st = STATUS_STYLE[stage.status];
  return (
    <div
      draggable={!stage.frozen}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ kind: "stage", uid: stage.uid } satisfies DragPayload));
        e.dataTransfer.effectAllowed = "move";
      }}
      title={stage.frozen ? `${st.text} — can't be moved` : "Drag to move"}
      style={{
        background: st.bg, border: `1.5px solid ${st.border}`, color: st.color, borderRadius: 8, padding: "8px 10px",
        fontSize: 12, fontWeight: 600, cursor: stage.frozen ? "not-allowed" : "grab", userSelect: "none",
        display: "flex", alignItems: "center", gap: 6, opacity: stage.frozen ? 0.85 : 1,
      }}
    >
      <span style={{ opacity: 0.5 }}>{stage.frozen ? "🔒" : "⠿"}</span>
      <span style={{ flex: 1 }}>
        {stage.label}
        <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>{stage.stageKey ? st.text : "New — not saved"}</div>
      </span>
      {TEAM_ASSESSMENT_BADGE[stage.team] && <Badge text={TEAM_ASSESSMENT_BADGE[stage.team]!} />}
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove from hierarchy"
          style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function Gap({
  active, disabled, last, ...handlers
}: {
  active: boolean;
  disabled: boolean;
  last?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      {...handlers}
      title={disabled ? undefined : last ? "Drop here to add a final step" : "Drop here to insert a new step"}
      style={{
        width: active ? 64 : last ? 48 : 30, display: "flex", alignItems: "center", justifyContent: "center",
        color: disabled ? "#e2e8f0" : active ? "#10b981" : "#cbd5e1", fontSize: active ? 22 : 16, fontWeight: 700,
        transition: "width .15s", borderRadius: 8, margin: "0 2px",
        border: active ? "2px dashed #10b981" : "2px dashed transparent", background: active ? "#ecfdf5" : "transparent",
      }}
    >
      {disabled ? "→" : active ? "+" : last ? "+" : "→"}
    </div>
  );
}

