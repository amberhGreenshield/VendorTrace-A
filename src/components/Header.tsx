interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  rightContent?: React.ReactNode;
}

export default function Header({ title, subtitle, onBack, rightContent }: HeaderProps) {
  return (
    <div style={{
      background: "#0f4c3a", color: "#fff", padding: "0 32px",
      height: 56, display: "flex", alignItems: "center", gap: 12,
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)",
          borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600,
          padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap",
        }}>
          ← Back
        </button>
      )}
      <div style={{ flex: 1 }}>
        {title && <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>}
        {subtitle && <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 10 }}>{subtitle}</span>}
      </div>
      {rightContent}
    </div>
  );
}
