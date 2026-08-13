import AssessmentCard from "./AssessmentCard";
import { CompletedForm } from "../lib/schema";

interface AssessmentSectionProps {
  title: string;
  items: CompletedForm[];
  columns?: number;
}

export default function AssessmentSection({ title, items, columns = 2 }: AssessmentSectionProps) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        background: "#0f4c3a", color: "#fff", borderRadius: "8px 8px 0 0",
        padding: "10px 16px", fontSize: 13, fontWeight: 600, textAlign: "center",
      }}>
        {title}
      </div>
      <div style={{
        background: "#f1f5f9", borderRadius: "0 0 8px 8px", padding: 16,
        display: "grid", gridTemplateColumns: "repeat(" + columns + ", 1fr)",
        gap: 12, minHeight: 200,
      }}>
        {items.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "32px 0" }}>
            No documents yet.
          </div>
        ) : (
          items.map((item) => (
            <AssessmentCard key={item.id} label={item.label} fileUrl={item.fileUrl} note={item.note} />
          ))
        )}
      </div>
    </div>
  );
}
