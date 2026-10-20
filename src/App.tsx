import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getAuthUser, setAuthUser as storeUser, clearAuthUser, UserProfile } from "@/lib/auth";
import { Case } from "@/lib/schema";
import { fetchAllCases, startCaseStage, completeCaseStage, saveCaseHierarchy, updateCaseAssessment } from "@/lib/caseStore";
import { ApiError, HierarchyEditStage, fetchMe } from "@/lib/apiClient";
import { ADMIN_STAGE_KEY } from "@/lib/hierarchy";
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
import AdminPanel from "@/pages/AdminPanel";
import AdminInbox from "@/pages/AdminInbox";
import AdminCaseView from "@/pages/AdminCaseView";

type AuthPage = "login" | "team-select" | "app";
type TeamPage = "snapshot" | "dashboard" | "caseDetails" | "adminPanel" | "adminInbox" | "adminCase";
type BoPage = "snapshot" | "dashboard" | "caseDetails" | "newCase";

export default function App() {
  const { instance } = useMsal();
  const [authPage, setAuthPage] = useState<AuthPage>(() => (getAuthUser() ? "app" : "login"));
  const [authUser, setAuthUser] = useState<UserProfile | null>(getAuthUser);

  const isBusinessOwner = authUser?.role === "businessOwner";
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

  // The signed-in profile is cached in localStorage, so admin rights granted
  // (or removed) after someone's first sign-in would never show up. Re-check
  // them against the database whenever the app opens. Demo accounts and
  // business owners without a DB record are left untouched.
  useEffect(() => {
    if (authPage !== "app" || !authUser?.email) return;
    let cancelled = false;
    fetchMe(authUser.email)
      .then((me) => {
        if (cancelled || !me.found) return;
        const isCaseAdmin = me.isCaseAdmin === true;
        const isAdmin = (me.teamMemberships ?? []).some((m) => m.isAdmin);
        if (isCaseAdmin === !!authUser.isCaseAdmin && isAdmin === !!authUser.isAdmin) return;
        const refreshed: UserProfile = { ...authUser, isCaseAdmin, isAdmin };
        storeUser(refreshed);
        setAuthUser(refreshed);
      })
      .catch(() => { /* API unreachable — keep the cached profile */ });
    return () => { cancelled = true; };
  }, [authPage, authUser]);

  // Background refresh — no loading screen, errors ignored (the next tick
  // retries). This is what moves a case between a team's tabs when an admin
  // reassigns it or another team finishes a step, without anyone reloading.
  const refreshCasesSilently = useCallback(async () => {
    try {
      const fresh = await fetchAllCases();
      setCases(fresh);
    } catch {
      /* keep what we have */
    }
  }, []);

  useEffect(() => {
    if (authPage !== "app") return;
    const interval = window.setInterval(refreshCasesSilently, 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") refreshCasesSilently(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [authPage, refreshCasesSilently]);

  useEffect(() => {
    if (authPage !== "app") return;
    return reloadCases();
  }, [authPage, reloadCases]);

  const [teamPage, setTeamPage] = useState<TeamPage>("snapshot");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [adminCaseId, setAdminCaseId] = useState<string | null>(null);
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
      // Business Owners have their own dashboard straight away — no team to join.
      setAuthPage("app");
    } else {
      // Only reached if the database lookup failed and Login.tsx fell back
      // to the manual picker — normal SSO sign-ins land directly in "app"
      // already knowing their team.
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

  // ── Case-admin actions ───────────────────────────────────────────────────
  // Errors are re-thrown so AdminCaseView can show them inline.
  async function handleSaveHierarchy(caseId: string, stages: HierarchyEditStage[], basedOnUpdatedAt?: string) {
    try {
      // basedOnUpdatedAt = the version the editor was showing, NOT whatever the
      // last background refresh fetched — otherwise a stale edit could slip through.
      const updated = await saveCaseHierarchy(caseId, authUser?.email ?? "", stages, basedOnUpdatedAt);
      setCases((prev) => prev.map((c) => (c.id === caseId ? updated : c)));
    } catch (err) {
      // Someone moved the case on while the editor was open — pull the latest
      // so the admin sees (and edits) what's really there now.
      if (err instanceof ApiError && err.code === "STALE_CASE") await refreshCasesSilently();
      throw err;
    }
  }

  async function handleReleaseFromAdmin(caseId: string) {
    const updated = await completeCaseStage(caseId, ADMIN_STAGE_KEY, authUser?.name ?? "Admin");
    setCases((prev) => prev.map((c) => (c.id === caseId ? updated : c)));
  }

  // Business owner marks a PIA / DIA / UpGuard complete (or undoes it).
  // Errors propagate so the page can show them next to the button.
  async function handleMarkAssessment(caseId: string, key: string, action: "complete" | "reopen") {
    const updated = await updateCaseAssessment(caseId, key, action, { email: authUser?.email ?? "", name: authUser?.name ?? "" });
    setCases((prev) => prev.map((c) => (c.id === caseId ? updated : c)));
  }

  function handleCaseCreated(newCase: Case) {
    setCases((prev) => [newCase, ...prev]);
    setBoPage("dashboard");
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  if (authPage === "login") return <Login onSuccess={handleLogin} />;
  if (authPage === "team-select") return <TeamSelect user={authUser!} onJoined={handleTeamJoined} />;

  // ── Loading / error states ─────────────────────────────────────────────────
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

  // ── Business Owner view ────────────────────────────────────────────────────
  if (isBusinessOwner) {
    const boCases = cases.filter((c) => c.businessOwner === authUser?.name);

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
      const boCase = boCases.find((c) => c.id === boSelectedCaseId);
      if (boCase) {
        return (
          <BusinessOwnerCaseDetails case_={boCase} onBack={() => setBoPage("dashboard")} onMarkAssessment={handleMarkAssessment} />
        );
      }
    }
    if (boPage === "dashboard") {
      return (
        <BusinessOwnerDashboard
          cases={boCases}
          onBack={() => setBoPage("snapshot")}
          onOpenCase={(c) => { setBoSelectedCaseId(c.id); setBoPage("caseDetails"); }}
          onNewCase={() => setBoPage("newCase")}
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

  // ── Team view ──────────────────────────────────────────────────────────────
  const teamViewCases: TeamViewCase[] = teamKey ? casesForTeam(cases, teamKey) : [];

  if (authUser?.isCaseAdmin && teamPage === "adminCase" && adminCaseId) {
    const adminCase = cases.find((c) => c.id === adminCaseId);
    if (adminCase) {
      return (
        <AdminCaseView
          case_={adminCase}
          onBack={() => setTeamPage("adminInbox")}
          onSaveHierarchy={handleSaveHierarchy}
          onRelease={handleReleaseFromAdmin}
        />
      );
    }
  }
  if (authUser?.isCaseAdmin && (teamPage === "adminInbox" || teamPage === "adminCase")) {
    return (
      <AdminInbox
        cases={cases}
        onBack={() => setTeamPage("snapshot")}
        onOpenCase={(c) => { setAdminCaseId(c.id); setTeamPage("adminCase"); }}
      />
    );
  }

  if (teamPage === "adminPanel") {
    return <AdminPanel actingAdminEmail={authUser?.email ?? ""} onBack={() => setTeamPage("snapshot")} />;
  }

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
      isAdmin={authUser?.isAdmin}
      onOpenAdminPanel={authUser?.isAdmin ? () => setTeamPage("adminPanel") : undefined}
      onOpenAdminInbox={authUser?.isCaseAdmin ? () => setTeamPage("adminInbox") : undefined}
      adminInboxCount={
        authUser?.isCaseAdmin
          ? cases.filter((c) => c.stages.some((s) => s.stageKey === ADMIN_STAGE_KEY && (s.status === "active" || s.status === "inProgress"))).length
          : undefined
      }
    />
  );
}
