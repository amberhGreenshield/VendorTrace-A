import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { getProfileForAccount, setAuthUser, UserProfile, UserRole } from "@/lib/auth";
import { loginRequest } from "@/lib/msalConfig";

interface Props {
  onSuccess: (user: UserProfile, isNew: boolean) => void;
}

type Phase = "checkingSso" | "needsInteractiveSignIn" | "signingIn" | "chooseRole";

export default function Login({ onSuccess }: Props) {
  const { instance, accounts } = useMsal();
  const [phase, setPhase] = useState<Phase>("checkingSso");
  const [pendingName, setPendingName] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingAccountId, setPendingAccountId] = useState("");
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState("");

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

  function handleAccount(accountId: string, name: string, email: string) {
    const existingProfile = getProfileForAccount(accountId);
    if (existingProfile) {
      setAuthUser(existingProfile);
      onSuccess(existingProfile, false);
      return;
    }
    setPendingAccountId(accountId);
    setPendingName(name);
    setPendingEmail(email);
    setPhase("chooseRole");
  }

  function handleDemoLogin(demoRole: UserRole) {
    const demoId = demoRole === "businessOwner" ? "demo-bo-001" : "demo-team-001";
    const profile: UserProfile = {
      accountId: demoId,
      name: demoRole === "businessOwner" ? "Demo Business Owner" : "Demo Team Member",
      email: "demo@vendortrace.ca",
      role: demoRole,
      ...(demoRole === "team" ? { team: { id: 1, name: "Legal", memberCount: 3 } } : {}),
    };
    setAuthUser(profile);
    onSuccess(profile, false);
  }

  async function handleSignInClick() {
    setPhase("signingIn");
    setError("");
    try {
      await instance.loginRedirect(loginRequest);
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

          {phase === "checkingSso" && (
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
                {error && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#dc2626" }}>
                    {error}
                  </div>
                )}
                <button
                  onClick={handleSignInClick}
                  disabled={phase === "signingIn"}
                  style={{ padding: "12px", borderRadius: 8, border: "none", background: phase === "signingIn" ? "#94a3b8" : "#0f4c3a", color: "#fff", fontWeight: 700, fontSize: 15, cursor: phase === "signingIn" ? "not-allowed" : "pointer" }}
                >
                  {phase === "signingIn" ? "Redirecting…" : "Sign in with Microsoft"}
                </button>

                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>— or try a demo —</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleDemoLogin("businessOwner")}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #0f4c3a", background: "#e0f2ec", color: "#0f4c3a", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                    >
                      Demo: Business Owner
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDemoLogin("team")}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #5f9ea0", background: "#f0fafa", color: "#0f4c3a", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                    >
                      Demo: Team Member
                    </button>
                  </div>
                </div>
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
                {error && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#dc2626" }}>
                    {error}
                  </div>
                )}
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
