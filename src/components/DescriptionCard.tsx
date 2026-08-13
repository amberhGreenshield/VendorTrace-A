interface DescriptionCardProps {
  text?: string;
}

export default function DescriptionCard({ text }: DescriptionCardProps) {
  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <div style={{
        background: "#0f4c3a", color: "#fff", borderRadius: "8px 8px 0 0",
        padding: "10px 16px", fontSize: 13, fontWeight: 600, textAlign: "center",
      }}>
        Description
      </div>
      <div style={{
        background: "#f1f5f9", borderRadius: "0 0 8px 8px", padding: "16px",
        fontSize: 12, color: "#475569", lineHeight: 1.7, minHeight: 200,
      }}>
        {text ?? "No description provided."}
      </div>
    </div>
  );
}
