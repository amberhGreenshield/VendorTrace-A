const PROFILES_KEY = "procurement_profiles_v1";

// "admin" can pick any team and switch between them freely
export type UserRole = "team" | "businessOwner" | "admin";

export interface UserProfile {
  accountId: string;
  name: string;
  email: string;
  role: UserRole;
  team?: { id: number; name: string; memberCount: number };
  /** When true, BO view shows ALL cases regardless of businessOwner field */
  isDemo?: boolean;
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
