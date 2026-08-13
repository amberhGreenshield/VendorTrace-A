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
  const [authPage, setAuthPage] = useState<AuthPage>(() => (getAuthUser() ? "app" : "login"));
  const [authUser, setAuthUser] = useState<UserProfile | null>(getAuthUser);
  const isBusinessOwner = authUser?.role === "businessOwner";
  const teamName = authUser?.team?.name ?? "";
  const teamKey = teamKeyFromLabel(teamName);

  // Single source of truth for all cases — now loaded from the real API.
  const [cases, setCases] = useState<Case[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);

  const reloadCases = useCallback(() => {
    let cancelled = false;
    setCasesLoading(true);
    setCasesError(null);
    fetchAllCases()
      .then((cs) => {
        if (!cancelled) setCases(cs);
      })
      .catch((err) => {
        if (!cancelled) setCasesError(err instanceof Error ? err.message : "Failed to load cases");
      })
      .finally(() => {
        if (!cancelled) setCasesLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
    // Also end the actual Microsoft session — otherwise silent SSO on the
    // next visit would just sign them straight back in.
    instance.logoutRedirect();
  }

  function handleLogin(user: UserProfile, isNew: boolean) {
    storeUser(user);
    setAuthUser(user);
    if (user.role === "businessOwner") {
      // Business Owners have their own dashboard straight away — no team to join.
      setAuthPage("app");
    } else {
      setAuthPage(isNew ? "team-select" : "app");
    }
  }

  function handleTeamJoined(user: UserProfile) {
    storeUser(user);
    setAuthUser(user);
    setTeamPage("snapshot");
    setAuthPage("app");
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

  function handleCaseCreated(newCase: Case) {
    setCases((prev) => [newCase, ...prev]);
    setBoPage("dashboard");
  }

  if (authPage === "login") return <Login onSuccess={handleLogin} />;
  if (authPage === "team-select") return <TeamSelect user={authUser!} onJoined={handleTeamJoined} />;

  if (casesLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#64748b" }}>
        Loading cases…
      </div>
    );
  }
  if (casesError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', sans-serif", gap: 14 }}>
        <div style={{ color: "#dc2626", fontSize: 14, maxWidth: 420, textAlign: "center" }}>{casesError}</div>
        <button
          onClick={reloadCases}
          style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (isBusinessOwner) {
    if (boPage === "newCase") {
      return (
        <NewCaseIntake
          businessOwner={authUser?.name ?? "Business Owner"}
          businessOwnerEmail={authUser?.email ?? ""}
          onBack={() => setBoPage("dashboard")}
          onCreated={handleCaseCreated}
        />
      );
    }
    if (boPage === "caseDetails" && boSelectedCaseId) {
      const boCase = cases.find((c) => c.id === boSelectedCaseId);
      if (boCase) {
        return <BusinessOwnerCaseDetails case={boCase} onBack={() => setBoPage("dashboard")} />;
      }
    }
    if (boPage === "dashboard") {
      return (
        <BusinessOwnerDashboard
          cases={cases.filter((c) => c.businessOwner === authUser?.name)}
          onBack={() => setBoPage("snapshot")}
          onOpenCase={(c) => { setBoSelectedCaseId(c.id); setBoPage("caseDetails"); }}
          onNewCase={() => setBoPage("newCase")}
        />
      );
    }
    return (
      <BusinessOwnerSnapshot
        userName={authUser?.name ?? "Business Owner"}
        cases={cases.filter((c) => c.businessOwner === authUser?.name)}
        onOpenDashboard={() => setBoPage("dashboard")}
        onNewCase={() => setBoPage("newCase")}
        onLogout={handleLogout}
      />
    );
  }

  // Team view
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
    />
  );
}
