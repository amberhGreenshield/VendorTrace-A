import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getAuthUser, setAuthUser as storeUser, clearAuthUser, UserProfile } from "@/lib/auth";
import { Case } from "@/lib/schema";
import { fetchAllCases, startCaseStage, completeCaseStage } from "@/lib/caseStore";
import { casesForTeam, teamKeyFromLabel, TeamViewCase } from "@/lib/viewAdapters";

import Login from "@/pages/Login";
import TeamSelect from "@/pages/TeamSelect";
import TeamSnapshot from "@/pages/TeamSnapshot";
import TeamDashboard from "@/pages/TeamDashboard";
import CaseDetails from "@/pages/CaseDetails";
import BusinessOwnerSnapshot from "@/pages/BusinessOwnerSnapshot";
import BusinessOwnerDashboard from "@/pages/BusinessOwnerDashboard";
import BusinessOwnerCaseDetails from "@/pages/BusinessOwnerCaseDetails";
import NewCaseIntake from "@/pages/NewCaseIntake";

type AuthPage = "login" | "team-select" | "app";
type TeamPage = "snapshot" | "dashboard" | "caseDetails";
type BoPage = "snapshot" | "dashboard" | "caseDetails" | "newCase";

export default function App() {
  const { instance } = useMsal();
  const [authPage, setAuthPage] = useState<AuthPage>(() => {
    const user = getAuthUser();
    if (!user) return "login";
    // admin always picks a team first — even if returning
    if (user.role === "admin" && !user.team) return "team-select";
    return "app";
  });
  const [authUser, setAuthUser] = useState<UserProfile | null>(getAuthUser);

  const isBusinessOwner = authUser?.role === "businessOwner";
  const isAdmin = authUser?.role === "admin";
  const teamName = authUser?.team?.name ?? "";
  const teamKey = teamKeyFromLabel(teamName);

  const [cases, setCases] = useState<Case[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);

  const reloadCases = useCallback(() => {
    let cancelled = false;
    setCasesLoading(true);
    setCasesError(null);
    fetchAllCases()
      .then((cs) => { if (!cancelled) setCases(cs); })
      .catch((err) => { if (!cancelled) setCasesError(err instanceof Error ? err.message : "Failed to load cases"); })
      .finally(() => { if (!cancelled) setCasesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (authPage !== "app") return;
    return reloadCases();
  }, [authPage, reloadCases]);

  const [teamPage, setTeamPage] = useState<TeamPage>("snapshot");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [boPage, setBoPage] = useState<BoPage>("snapshot");
  const [boSelectedCaseId, setBoSelectedCaseId] = useState<string | null>(null);

  function handleLogout() {
    clearAuthUser();
    setAuthUser(null);
    setTeamPage("snapshot");
    setBoPage("snapshot");
    setAuthPage("login");
    instance.logoutRedirect();
  }

  function handleLogin(user: UserProfile, isNew: boolean) {
    storeUser(user);
    setAuthUser(user);
    if (user.role === "businessOwner") {
      setAuthPage("app");
    } else {
      // team members, admin, and demo team users all pick a team first
      setAuthPage(isNew ? "team-select" : "app");
    }
  }

  function handleTeamJoined(user: UserProfile) {
    storeUser(user);
    setAuthUser(user);
    setTeamPage("snapshot");
    setAuthPage("app");
  }

  /** Admin — keeps the user logged in, just sends them back to pick a different team */
  function handleSwitchTeam() {
    if (!authUser) return;
    const updated = { ...authUser, team: undefined };
    storeUser(updated);
    setAuthUser(updated);
    setTeamPage("snapshot");
    setAuthPage("team-select");
  }

  async function handleStartStage(caseId: string, stageKey: string) {
    try {
      const updated = await startCaseStage(caseId, stageKey);
      setCases((prev) => prev.map((c) => (c.id === caseId ? updated : c)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start this stage. Please try again.");
    }
  }

  async function handleCompleteStage(caseId: string, stageKey: string) {
    try {
      const updated = await completeCaseStage(caseId, stageKey, authUser?.name ?? "Unknown");
      setCases((prev) => prev.map((c) => (c.id === caseId ? updated : c)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to complete this stage. Please try again.");
    }
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  if (authPage === "login") {
    return <Login onSuccess={handleLogin} />;
  }

  // ── Team / Admin select ────────────────────────────────────────────────────
  if (authPage === "team-select" && authUser) {
    return <TeamSelect user={authUser} onJoined={handleTeamJoined} />;
  }

  // ── Loading / error states ─────────────────────────────────────────────────
  if (casesLoading) {
    return (
      <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 14 }}>
        Loading cases…
      </div>
    );
  }

  if (casesError) {
    return (
      <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ color: "#dc2626", fontSize: 14 }}>{casesError}</div>
        <button onClick={reloadCases} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          Try again
        </button>
      </div>
    );
  }

  // ── Business Owner view ────────────────────────────────────────────────────
  if (isBusinessOwner) {
    // Demo BO accounts (isDemo flag) see all cases; personal accounts see only their own
    const boCases = authUser?.isDemo
      ? cases
      : cases.filter((c) => c.businessOwner === authUser?.name);

    if (boPage === "caseDetails" && boSelectedCaseId) {
      const c = boCases.find((c) => c.id === boSelectedCaseId);
      if (c) {
        return (
          <BusinessOwnerCaseDetails
            case_={c}
            onBack={() => setBoPage("dashboard")}
          />
        );
      }
    }

    if (boPage === "newCase") {
      return (
        <NewCaseIntake
          businessOwner={authUser?.name ?? ""}
          businessOwnerEmail={authUser?.email ?? ""}
          onBack={() => setBoPage("dashboard")}
          onCreated={(newCase) => {
            setCases((prev) => [...prev, newCase]);
            setBoPage("dashboard");
          }}
        />
      );
    }

    if (boPage === "dashboard") {
      return (
        <BusinessOwnerDashboard
          userName={authUser?.name ?? "Business Owner"}
          cases={boCases}
          onBack={() => setBoPage("snapshot")}
          onOpenCase={(c) => { setBoSelectedCaseId(c.id); setBoPage("caseDetails"); }}
          onNewCase={() => setBoPage("newCase")}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <BusinessOwnerSnapshot
        userName={authUser?.name ?? "Business Owner"}
        cases={boCases}
        onOpenDashboard={() => setBoPage("dashboard")}
        onNewCase={() => setBoPage("newCase")}
        onLogout={handleLogout}
      />
    );
  }

  // ── Team / Admin view ──────────────────────────────────────────────────────
  const teamViewCases: TeamViewCase[] = teamKey ? casesForTeam(cases, teamKey) : [];

  if (teamPage === "caseDetails" && selectedCaseId) {
    const viewCase = teamViewCases.find((c) => c.id === selectedCaseId);
    if (viewCase) {
      return (
        <CaseDetails
          viewCase={viewCase}
          teamName={teamName}
          onBack={() => setTeamPage("dashboard")}
          onStart={handleStartStage}
          onComplete={handleCompleteStage}
        />
      );
    }
  }

  if (teamPage === "dashboard") {
    return (
      <TeamDashboard
        teamName={teamName}
        onBack={() => setTeamPage("snapshot")}
        onOpenCase={(c) => { setSelectedCaseId(c.id); setTeamPage("caseDetails"); }}
        cases={teamViewCases}
        onStart={handleStartStage}
        onComplete={handleCompleteStage}
      />
    );
  }

  return (
    <TeamSnapshot
      teamName={teamName}
      cases={teamViewCases}
      onOpenDashboard={() => setTeamPage("dashboard")}
      onLogout={handleLogout}
      isAdmin={isAdmin}
      onSwitchTeam={isAdmin ? handleSwitchTeam : undefined}
    />
  );
}
