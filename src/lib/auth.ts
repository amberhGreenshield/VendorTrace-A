// Profiles keyed by the person's real Microsoft account ID (MSAL's
// `homeAccountId`) instead of a made-up ID from a typed-in form. Still
// localStorage for now — once the frontend calls the real API, this
// should be replaced by a lookup against the `User` table (see
// api/prisma/schema.prisma, which already has room for an azureObjectId).

const PROFILES_KEY = "procurement_profiles_v1";

export type UserRole = "team" | "businessOwner";

export interface UserProfile {
  /** MSAL's homeAccountId — stable per person per tenant, this is our real user identity now. */
  accountId: string;
  name: string;
  email: string;
  /** Chosen once at first sign-in. Business Owners never see the team hierarchy views, and vice versa. */
  role: UserRole;
  team?: { id: number; name: string; memberCount: number };
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

/** Have we seen this Microsoft identity before, and if so what role/team did they pick? */
export function getProfileForAccount(accountId: string): UserProfile | null {
  return loadProfiles()[accountId] ?? null;
}

export function saveProfileForAccount(profile: UserProfile): void {
  const profiles = loadProfiles();
  profiles[profile.accountId] = profile;
  saveProfiles(profiles);
}

// ─── "Currently active" pointer ─────────────────────────────────────────────
// MSAL itself remembers who's signed into Microsoft; this just remembers
// which of our app profiles corresponds to them for the current session.
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
