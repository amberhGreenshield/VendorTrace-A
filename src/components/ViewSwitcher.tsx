import type { UserProfile } from "../lib/auth";
import { applyView, availableViews, currentView, viewKey, viewLabel } from "../lib/profile";

/** "View as" picker in the header, for people with more than one VendorTrace role. */
export default function ViewSwitcher({ profile, onSwitch }: { profile: UserProfile; onSwitch: (next: UserProfile) => void }) {
  const views = availableViews(profile);
  if (views.length < 2) return null;
  const current = viewKey(currentView(profile));
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.95 }}>
      View as
      <select
        aria-label="Switch view"
        value={current}
        onChange={(e) => {
          const next = views.find((v) => viewKey(v) === e.target.value);
          if (next) onSwitch(applyView(profile, next));
        }}
        style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        {views.map((v) => (
          <option key={viewKey(v)} value={viewKey(v)} style={{ color: "#0f172a" }}>
            {viewLabel(v)}
          </option>
        ))}
      </select>
    </label>
  );
}
