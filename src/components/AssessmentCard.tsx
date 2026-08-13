interface AssessmentCardProps {
  label: string;
  fileUrl?: string;
  pending?: boolean;
  note?: string;
}

export default function AssessmentCard({ label, fileUrl, pending, note }: AssessmentCardProps) {
  return (
    <div
      onClick={() => fileUrl && window.open(fileUrl, "_blank")}
      title={fileUrl ? "Click to open in SharePoint" : undefined}
      style={{
        border: pending ? "1.5px dashed #94a3b8" : "1.5px solid #cbd5e1",
        borderRadius: 8, padding: "14px 12px", fontSize: 12,
        color: pending ? "#94a3b8" : (fileUrl ? "#0f4c3a" : "#475569"),
        textAlign: "center",
        background: pending ? "#f8fafc" : (fileUrl ? "#f0fdf4" : "#fff"),
        cursor: fileUrl ? "pointer" : "default",
        minHeight: 72, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        transition: "box-shadow 0.15s", lineHeight: 1.4, gap: 4,
      }}
      onMouseEnter={(e) => {
        if (fileUrl) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(15,76,58,0.18)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {label}
      {fileUrl && <span style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>🔗 Open in SharePoint</span>}
      {note && <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>{note}</span>}
    </div>
  );
}
