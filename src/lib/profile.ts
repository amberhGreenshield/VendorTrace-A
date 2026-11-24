import type { MeResponse } from "./apiClient";
import type { UserProfile } from "./auth";

/** One way a person can use VendorTrace (someone can have several). */
export type View =
  | { kind: "businessOwner" }
  | { kind: "team"; id: number; name: string }
  | { kind: "caseAdmin" };

export function viewKey(v: View): string {
  return v.kind === "team" ? `team:${v.name}` : v.kind;
}

export function viewLabel(v: View): string {
  return v.kind === "businessOwner" ? "Business Owner" : v.kind === "caseAdmin" ? "Case Admin" : `${v.name} team`;
}

/** The views this person may switch between. */
export function availableViews(p: UserProfile): View[] {
  const views: View[] = (p.reviewTeams ?? []).map((t) => ({ kind: "team", id: t.id, name: t.name }));
  // A case admin who isn't on a review team still needs a home for the inbox.
  if (p.isCaseAdmin && views.length === 0) views.push({ kind: "caseAdmin" });
  if (p.isBusinessOwner) views.push({ kind: "businessOwner" });
  return views;
}

export function currentView(p: UserProfile): View {
  if (p.role === "businessOwner") return { kind: "businessOwner" };
  if (p.team && p.team.name !== "Admin") return { kind: "team", id: p.team.id, name: p.team.name };
  return { kind: "caseAdmin" };
}

export function applyView(p: UserProfile, v: View): UserProfile {
  if (v.kind === "businessOwner") return { ...p, role: "businessOwner", team: undefined };
  if (v.kind === "caseAdmin") return { ...p, role: "team", team: { id: -1, name: "Admin", memberCount: 1 } };
  return { ...p, role: "team", team: { id: v.id, name: v.name, memberCount: 0 } };
}

/**
 * Builds the signed-in profile from GET /api/me. Starts on the person's first
 * review team, else the case-admin home, else Business Owner. Returns null
 * when the API doesn't know them (the caller decides the fallback).
 */
export function profileFromMe(accountId: string, name: string, email: string, me: MeResponse): UserProfile | null {
  if (!me.found) return null;
  const base: UserProfile = {
    accountId,
    name: me.name ?? name,
    email: me.email ?? email,
    role: "businessOwner",
    isCaseAdmin: me.isCaseAdmin === true,
    isBusinessOwner: me.isBusinessOwner === true,
    reviewTeams: (me.teamMemberships ?? []).filter((m) => m.teamName !== "Admin").map((m) => ({ id: m.teamId, name: m.teamName })),
  };
  // Before Saviynt manages access, anyone VendorTrace knows can be a Business Owner.
  if (!me.accessManaged && !base.reviewTeams!.length && !base.isCaseAdmin) base.isBusinessOwner = true;
  const views = availableViews(base);
  return views.length ? applyView(base, views[0]) : null;
}

/** Re-applies fresh access to a cached profile, keeping the current view if it's still allowed. */
export function refreshProfile(cached: UserProfile, fresh: UserProfile): UserProfile {
  const keep = availableViews(fresh).find((v) => viewKey(v) === viewKey(currentView(cached)));
  return keep ? applyView(fresh, keep) : fresh;
}
