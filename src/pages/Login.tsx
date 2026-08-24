import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { getProfileForAccount, setAuthUser, UserProfile, UserRole } from "@/lib/auth";
import { loginRequest } from "@/lib/msalConfig";
import { fetchMe } from "@/lib/apiClient";
import { TEAM_LABELS, TeamKey } from "@/lib/schema";

interface Props {
  onSuccess: (user: UserProfile, isNew: boolean) => void;
}

type Phase = "checkingSso" | "needsInteractiveSignIn" | "signingIn" | "chooseRole" | "demo";

// ─── DEMO SIGN-IN (no SSO required) ─────────────────────────────────────────
// Real SSO needs an Entra ID app registration (see msalConfig.ts) — until
// that's wired up, this lets anyone jump straight into the app as a
// Business Owner or as a specific review team, so cases can be created and
// walked through the whole hierarchy for demos/testing.
//
// This is intentionally NOT gated behind an env flag right now so it's easy
// to demo from any deployed environment. Once real SSO is live, either
// delete this block or gate it behind something like
// `import.meta.env.VITE_ENABLE_DEMO_LOGIN`.
const DEMO_TEAM_KEYS = Object.keys(TEAM_LABELS) as TeamKey[];

function demoTeamProfile(teamKey: TeamKey): UserProfile {
  return {
    accountId: `demo-team-${teamKey}`,
    name: `Demo ${TEAM_LABELS[teamKey]} Reviewer`,
    email: `demo.${teamKey.toLowerCase()}@vendortrace.demo`,
    role: "team",
    team: { id: -1, name: TEAM_LABELS[teamKey], memberCount: 1 },
    isAdmin: false,
  };
}

function demoBusinessOwnerProfile(): UserProfile {
  return {
    accountId: "demo-business-owner",
    name: "Demo Business Owner",
    email: "demo.bo@vendortrace.demo",
    role: "businessOwner",
  };
}

export default function Login({ onSuccess }: Props) {
  const { instance, accounts } = useMsal();
  const [phase, setPhase] = useState<Phase>("checkingSso");
  const [pendingName, setPendingName] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingAccountId, setPendingAccountId] = useState("");
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState("");

  // On mount: if MSAL already has a signed-in account (either from a
  // completed redirect, or a still-valid browser session), use it
  // immediately. Otherwise try a SILENT sso check — this succeeds with NO
  // visible UI if the person is already signed into Microsoft on this
  // device (common on a managed work machine). Only if that fails do we
  // show a real "Sign in with Microsoft" button.
  useEffect(() => {
    async function checkSso() {
      const existingAccount = accounts[0];
      if (existingAccount) {
        handleAccount(existingAccount.homeAccountId, existingAccount.name ?? existingAccount.username, existingAccount.username);
        return;
      }
      try {
        const result = await instance.ssoSilent(loginRequest);
        handleAccount(result.account.homeAccountId, result.account.name ?? result.account.username, result.account.username);
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          setPhase("needsInteractiveSignIn");
        } else {
          setError("Couldn't check your Microsoft sign-in status. Please try signing in.");
          setPhase("needsInteractiveSignIn");
        }
      }
    }
    checkSso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAccount(accountId: string, name: string, email: string) {
    const cachedProfile = getProfileForAccount(accountId);
    if (cachedProfile) {
      setAuthUser(cachedProfile);
      onSuccess(cachedProfile, false);
      return;
    }

    // Brand new device/browser for this person — check the real database:
    // has an admin already added them to a team?
    try {
      const me = await fetchMe(email);
      if (me.found && me.teamMemberships && me.teamMemberships.length > 0) {
        // Provisioned team member — skip the role picker entirely, go
        // straight to their team. (If they're on multiple teams, this uses
        // the first one — switching between several is future work, see
        // ROADMAP.md.)
        const membership = me.teamMemberships[0];
        const profile: UserProfile = {
          accountId,
          name: me.name ?? name,
          email: me.email ?? email,
          role: "team",
          team: { id: membership.teamId, name: membership.teamName, memberCount: 0 },
          isAdmin: me.teamMemberships.some((m) => m.isAdmin),
        };
        setAuthUser(profile);
        onSuccess(profile, false);
        return;
      }
      // Known email but no team membership yet, OR genuinely unrecognized —
      // either way, default to Business Owner. Anyone in the org can submit
      // a vendor assessment; only team review access is admin-provisioned.
      const profile: UserProfile = { accountId, name, email, role: "businessOwner" };
      setAuthUser(profile);
      onSuccess(profile, false);
    } catch {
      // API unreachable — fall back to the manual picker so the app still
      // works rather than hard-blocking sign-in.
      setPendingAccountId(accountId);
      setPendingName(name);
      setPendingEmail(email);
      setPhase("chooseRole");
    }
  }

  async function handleSignInClick() {
    setPhase("signingIn");
    setError("");
    try {
      await instance.loginRedirect(loginRequest);
      // Browser navigates away here — code after this doesn't run until
      // the redirect back, at which point the useEffect above (via the
      // `accounts` array being populated) picks it up.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setPhase("needsInteractiveSignIn");
    }
  }

  function handleConfirmRole() {
    if (!role) { setError("Please choose how you'd like to sign in."); return; }
    const profile: UserProfile = { accountId: pendingAccountId, name: pendingName, email: pendingEmail, role };
    setAuthUser(profile);
    onSuccess(profile, true);
  }

  function handleDemoLogin(profile: UserProfile) {
    setAuthUser(profile);
    onSuccess(profile, false);
  }

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0f4c3a", color: "#fff", padding: "0 32px", height: 56, display: "flex", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>VendorTrace</span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 56, height: 56, background: "#0f4c3a", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 12 }}>
              🏛
            </div>
            <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#0f4c3a" }}>Welcome</h1>
          </div>

          {(phase === "checkingSso") && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "32px 24px", textAlign: "center", color: "#64748b", fontSize: 14 }}>
              Checking your Microsoft sign-in…
            </div>
          )}

          {(phase === "needsInteractiveSignIn" || phase === "signingIn") && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ background: "#5f9ea0", color: "#fff", padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>
                🔐 Sign in with your organization account
              </div>
              <div style={{ padding: "24px 24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
                  You'll be taken to Microsoft's sign-in page. Once you're signed in, you won't need to do this again on this device.
                </p>
                {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
                <button
                  onClick={handleSignInClick}
                  disabled={phase === "signingIn"}
                  style={{ padding: "12px", borderRadius: 8, border: "none", background: phase === "signingIn" ? "#94a3b8" : "#0f4c3a", color: "#fff", fontWeight: 700, fontSize: 15, cursor: phase === "signingIn" ? "not-allowed" : "pointer" }}
                >
                  {phase === "signingIn" ? "Redirecting…" : "Sign in with Microsoft"}
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("demo")}
                  style={{ padding: "10px", borderRadius: 8, border: "1.5px dashed #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                >
                  SSO not set up yet? Continue with a demo account →
                </button>
              </div>
            </div>
          )}

          {phase === "demo" && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ background: "#5f9ea0", color: "#fff", padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>
                🧪 Demo sign-in (no SSO)
              </div>
              <div style={{ padding: "24px 24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: "#64748b", lineHeight: 1.6 }}>
                  For demos and testing while Microsoft sign-in isn't configured. Pick a role below to jump
                  straight in — no Microsoft account needed.
                </p>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                    Business Owner
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin(demoBusinessOwnerProfile())}
                    style={{ width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer", border: "1.5px solid #cbd5e1", background: "#fff" }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f4c3a" }}>Continue as Demo Business Owner</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Submit a new case and track it on your dashboard.</div>
                  </button>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                    Review Team
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                    {DEMO_TEAM_KEYS.map((teamKey) => (
                      <button
                        type="button"
                        key={teamKey}
                        onClick={() => handleDemoLogin(demoTeamProfile(teamKey))}
                        style={{ width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: "pointer", border: "1.5px solid #cbd5e1", background: "#fff" }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f4c3a" }}>{TEAM_LABELS[teamKey]} team</div>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPhase("needsInteractiveSignIn")}
                  style={{ padding: "8px", borderRadius: 8, border: "none", background: "transparent", color: "#64748b", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                >
                  ← Back to Microsoft sign-in
                </button>
              </div>
            </div>
          )}

          {phase === "chooseRole" && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ background: "#5f9ea0", color: "#fff", padding: "10px 20px", fontSize: 13, fontWeight: 600 }}>
                👋 Welcome, {pendingName}
              </div>
              <div style={{ padding: "24px 24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>{pendingEmail}</p>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 8 }}>I am signing in as a...</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {([
                      { value: "team" as UserRole, label: "Team Member", hint: "Reviews cases as part of a hierarchy team" },
                      { value: "businessOwner" as UserRole, label: "Business Owner", hint: "Submits and tracks vendor assessments" },
                    ]).map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setRole(opt.value)}
                        style={{
                          flex: 1, textAlign: "left", padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                          border: role === opt.value ? "1.5px solid #0f4c3a" : "1.5px solid #cbd5e1",
                          background: role === opt.value ? "#e0f2ec" : "#fff",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f4c3a" }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 1.4 }}>{opt.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#dc2626" }}>{error}</div>}
                <button
                  onClick={handleConfirmRole}
                  style={{ padding: "12px", borderRadius: 8, border: "none", background: "#0f4c3a", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
