// Profiles keyed by the person's real Microsoft account ID (MSAL's
// `homeAccountId`). On sign-in, the app looks up this person's email
// against the real database (GET /api/me) to find out if they've already
// been provisioned onto a team by an admin — see apiClient.ts's `fetchMe`.
// Cached for the browser session only (sessionStorage, like the Microsoft
// sign-in itself), so nothing about the last person stays behind on a shared
// computer once the browser is closed. The database is the source of truth.

const PROFILES_KEY = "procurement_profiles_v2";

export type UserRole = "team" | "businessOwner";

export interface UserProfile {
  /** MSAL's homeAccountId — stable per person per tenant, this is our real user identity now. */
  accountId: string;
  name: string;
  email: string;
  /** Business Owners never see the team hierarchy views, and vice versa. */
  role: UserRole;
  team?: { id: number; name: string; memberCount: number };
  /**
   * Case admins (Saviynt role VendorTrace.CaseAdmin) get the Admin Inbox:
   * every open case, new cases to check, and the review-hierarchy editor.
   */
  isCaseAdmin?: boolean;
  /** May use the Business Owner view (submit and track vendor assessments). */
  isBusinessOwner?: boolean;
  /** Every review team this person is on — they can switch between them. */
  reviewTeams?: { id: number; name: string }[];
}

// Older builds kept these in localStorage; clear them so they don't linger.
try {
  localStorage.removeItem("procurement_profiles_v2");
  localStorage.removeItem("procurement_active_account_id");
} catch {
  // storage unavailable — nothing to clean up
}

function loadProfiles(): Record<string, UserProfile> {
  try {
    const raw = sessionStorage.getItem(PROFILES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, UserProfile>) : {};
  } catch {
    return {};
  }
}

function saveProfiles(profiles: Record<string, UserProfile>): void {
  try {
    sessionStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // storage unavailable (private mode etc.) — the app still works for this page load
  }
}

export function getProfileForAccount(accountId: string): UserProfile | null {
  return loadProfiles()[accountId] ?? null;
}

export function saveProfileForAccount(profile: UserProfile): void {
  const profiles = loadProfiles();
  profiles[profile.accountId] = profile;
  saveProfiles(profiles);
}

// ─── "Currently active" pointer ─────────────────────────────────────────────
const ACTIVE_ACCOUNT_KEY = "procurement_active_account_id";

export function getAuthUser(): UserProfile | null {
  let accountId: string | null = null;
  try {
    accountId = sessionStorage.getItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    return null;
  }
  if (!accountId) return null;
  return getProfileForAccount(accountId);
}

export function setAuthUser(user: UserProfile): void {
  saveProfileForAccount(user);
  try {
    sessionStorage.setItem(ACTIVE_ACCOUNT_KEY, user.accountId);
  } catch {
    // storage unavailable — signed in for this page load only
  }
}

export function clearAuthUser(): void {
  try {
    sessionStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    // nothing to clear
  }
}
