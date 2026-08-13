import { useState } from "react";

interface ConfirmCompleteModalProps {
  vendorName: string;
  teamLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmCompleteModal({ vendorName, teamLabel, onConfirm, onCancel }: ConfirmCompleteModalProps) {
  const [checked, setChecked] = useState(false);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, padding: 28, width: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f4c3a", marginBottom: 8 }}>
          Mark {teamLabel} review complete?
        </div>
        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 18px" }}>
          This will move <strong>{vendorName}</strong> forward to the next team in the review hierarchy.
          Make sure your assessment or document has been uploaded to SharePoint before confirming — this can't easily be undone.
        </p>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#334155", cursor: "pointer", marginBottom: 22 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, accentColor: "#0f4c3a" }}
          />
          I confirm my team's review of this case is complete and ready to move forward.
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #cbd5e1", background: "#fff", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: checked ? "#0f4c3a" : "#cbd5e1",
              color: "#fff", fontWeight: 600, fontSize: 13,
              cursor: checked ? "pointer" : "not-allowed",
            }}
          >
            Confirm Complete
          </button>
        </div>
      </div>
    </div>
  );
}
