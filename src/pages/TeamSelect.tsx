import { useState, useEffect } from "react";
import { UserProfile } from "@/lib/auth";
import { fetchTeams, saveMyRole } from "@/lib/apiClient";


interface Props {
  user: UserProfile;
  onJoined: (user: UserProfile) => void;
}

export default function TeamSelect({ user, onJoined }: Props) {
  const [teamList, setTeamList] = useState<{ id: number; name: string; memberCount: number }[]>([]);
  const [joining, setJoining] = useState<number | null>(null);

  useEffect(() => {
    mockGetTeams().then(setTeamList);
  }, []);

  async function handleJoin(teamId: number) {
    setJoining(teamId);
    try {
      const updated = await mockJoinTeam(user, teamId);
      onJoined(updated);
    } finally {
      setJoining(null);
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <div style={{ background: "#0f4c3a", color: "#fff", padding: "0 32px", height: 56, display: "flex", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>VendorTrace</span>
      </div>
      <div style={{ maxWidth: 680, margin: "40px auto", padding: "0 24px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f4c3a", marginBottom: 8 }}>Welcome, {user.name}!</h2>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>Select your team to continue.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          {teamList.map((team) => (
            <div key={team.id} style={{ background: "#fff", borderRadius: 10, padding: "18px 16px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#334155" }}>{team.name}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{team.memberCount} members</div>
              <button
                onClick={() => handleJoin(team.id)}
                disabled={joining === team.id}
                style={{ marginTop: 8, padding: "8px", borderRadius: 6, border: "none", background: joining === team.id ? "#94a3b8" : "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 12, cursor: joining === team.id ? "not-allowed" : "pointer" }}
              >
                {joining === team.id ? "Joining..." : "Join Team"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
