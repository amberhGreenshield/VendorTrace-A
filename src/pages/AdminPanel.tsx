import { useEffect, useState } from "react";
import Header from "../components/Header";
import { fetchTeams, addTeamMember, ApiTeam } from "../lib/apiClient";

interface AdminPanelProps {
  actingAdminEmail: string;
  onBack: () => void;
}

export default function AdminPanel({ actingAdminEmail, onBack }: AdminPanelProps) {
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamName, setTeamName] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function loadTeams() {
    setLoading(true);
    setLoadError("");
    fetchTeams()
      .then((t) => {
        setTeams(t);
        if (!teamName && t.length > 0) setTeamName(t[0].name);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load teams"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSuccessMessage("");
    if (!name.trim() || !email.trim() || !teamName) {
      setSubmitError("Name, email, and team are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addTeamMember({ actingAdminEmail, name: name.trim(), email: email.trim(), teamName, isAdmin: makeAdmin });
      setSuccessMessage(`Added ${result.name} to ${result.teamName}${result.isAdmin ? " as an admin" : ""}.`);
      setName("");
      setEmail("");
      setMakeAdmin(false);
      loadTeams();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to add this person. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header onBack={onBack} title="Add Team Member" subtitle="Admin" />
      <div style={{ maxWidth: 720, margin: "32px auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f4c3a", margin: "0 0 4px" }}>Add someone to a team</h2>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 20px" }}>
            They'll be recognized automatically the next time they sign in with Microsoft — no separate invite needed.
          </p>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Full name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Blake"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Work email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jordan.blake@greenshield.ca"
                  type="email"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #cbd5e1", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Team</label>
              <select
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #cbd5e1", fontSize: 13, boxSizing: "border-box", background: "#fff" }}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", cursor: "pointer" }}>
              <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#0f4c3a" }} />
              Make this person an admin too (they'll be able to add people to any team)
            </label>
            {submitError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#dc2626" }}>{submitError}</div>}
            {successMessage && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#166534" }}>{successMessage}</div>}
            <button
              type="submit"
              disabled={submitting}
              style={{ alignSelf: "flex-start", padding: "10px 22px", borderRadius: 8, border: "none", background: submitting ? "#94a3b8" : "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: submitting ? "default" : "pointer" }}
            >
              {submitting ? "Adding…" : "Add to Team"}
            </button>
          </form>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f4c3a", margin: "0 0 16px" }}>Current teams</h2>
          {loading ? (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Loading…</div>
          ) : loadError ? (
            <div style={{ color: "#dc2626", fontSize: 13 }}>{loadError}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {teams.map((t) => (
                <div key={t.id}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>{t.name}</div>
                  {t.members.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>No members yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {t.members.map((m) => (
                        <span key={m.userId} style={{ background: "#f1f5f9", borderRadius: 999, padding: "4px 12px", fontSize: 12, color: "#334155" }}>
                          {m.name}{m.isAdmin ? " ⭐" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
