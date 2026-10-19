// Profiles keyed by the person's real Microsoft account ID (MSAL's
// `homeAccountId`). On sign-in, the app looks up this person's email
// against the real database (GET /api/me) to find out if they've already
// been provisioned onto a team by an admin — see apiClient.ts's `fetchMe`.
// Still cached in localStorage per-device so repeat visits don't need to
// re-fetch, but the database is the source of truth now, not this cache.

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
   * True if the database says this person is an admin (on ANY team — see
   * api/README.md). Admins get an "Add Team Member" panel. This is looked
   * up fresh from the API on every sign-in, not something the user picks.
   */
  isAdmin?: boolean;
  /**
   * True only for case admins (User.role = "admin" in the database — just
   * Amber for now, see api/prisma/seed.ts). Case admins get the Admin Inbox,
   * where every new case lands first, and can rearrange a case's review
   * hierarchy. Distinct from `isAdmin` above, which is only about adding
   * people to teams.
   */
  isCaseAdmin?: boolean;
}

function loadProfiles(): Record<string, UserProfile> {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, UserProfile>) : {};
  } catch {
    return {};
  }
}

function saveProfiles(profiles: Record<string, UserProfile>): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
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
  const accountId = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  if (!accountId) return null;
  return getProfileForAccount(accountId);
}

export function setAuthUser(user: UserProfile): void {
  saveProfileForAccount(user);
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, user.accountId);
}

export function clearAuthUser(): void {
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}
