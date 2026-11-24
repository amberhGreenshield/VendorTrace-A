import type { Request } from "express";
import { prisma } from "../db.js";
import { TEAM_LABELS, TeamKey } from "../domain/schema.js";
import type { AuthUser } from "./entraAuth.js";

/**
 * What someone may do in VendorTrace.
 *
 * Source of truth, in order:
 *  1. Saviynt-managed Entra app roles in the sign-in token (once any
 *     "VendorTrace.*" role is present, the token decides everything);
 *  2. otherwise the VendorTrace database (before the app roles exist, and
 *     for demo sign-in while AUTH_REQUIRED is off).
 *
 * App role values (created on the "VendorTrace API" app registration):
 *   VendorTrace.CaseAdmin          — sees every open case, reviews new cases
 *                                    in the admin inbox and changes a case's
 *                                    review hierarchy. Nothing else.
 *   VendorTrace.BusinessOwner      — submits vendor assessments, tracks and
 *                                    completes their own cases' assessments.
 *   VendorTrace.Reviewer.<TeamKey> — reviews cases for that team, e.g.
 *                                    VendorTrace.Reviewer.BusinessArchitecture.
 */
export const ROLE_CASE_ADMIN = "VendorTrace.CaseAdmin";
export const ROLE_BUSINESS_OWNER = "VendorTrace.BusinessOwner";
export const REVIEWER_ROLE_PREFIX = "VendorTrace.Reviewer.";

/** The review teams (every team except the case-admin "Admin" inbox). */
export const REVIEW_TEAM_KEYS = (Object.keys(TEAM_LABELS) as TeamKey[]).filter((k) => k !== "Admin");

export function reviewerRoleFor(team: TeamKey): string {
  return REVIEWER_ROLE_PREFIX + team;
}

export interface Access {
  email?: string;
  name?: string;
  isCaseAdmin: boolean;
  isBusinessOwner: boolean;
  /** Review team display names, e.g. ["PVM", "Business Architecture"]. */
  teams: string[];
  source: "token" | "database" | "none";
}

const NO_ACCESS: Access = { isCaseAdmin: false, isBusinessOwner: false, teams: [], source: "none" };

export function tokenManagesRoles(auth: AuthUser | undefined): boolean {
  return !!auth && auth.roles.some((r) => r.startsWith("VendorTrace."));
}

export function accessFromToken(auth: AuthUser): Access {
  const roles = new Set(auth.roles);
  return {
    email: auth.email,
    name: auth.name,
    isCaseAdmin: roles.has(ROLE_CASE_ADMIN),
    isBusinessOwner: roles.has(ROLE_BUSINESS_OWNER),
    teams: REVIEW_TEAM_KEYS.filter((k) => roles.has(reviewerRoleFor(k))).map((k) => TEAM_LABELS[k]),
    source: "token",
  };
}

/** Access for this request's caller. `fallbackEmail` is only used without a verified token. */
export async function resolveAccess(req: Request, fallbackEmail?: string): Promise<Access> {
  if (req.auth && tokenManagesRoles(req.auth)) return accessFromToken(req.auth);
  const email = (req.auth?.email ?? fallbackEmail)?.trim().toLowerCase();
  if (!email) return NO_ACCESS;
  const user = await prisma.user.findUnique({ where: { email }, include: { memberOf: { include: { team: true } } } });
  if (!user || !user.active) return { ...NO_ACCESS, email };
  return {
    email,
    name: user.name,
    isCaseAdmin: user.role === "admin",
    isBusinessOwner: user.role === "business_owner" || user.role === "admin",
    teams: user.memberOf.map((m: (typeof user.memberOf)[number]) => m.team.name).filter((n: string) => n !== "Admin"),
    source: "database",
  };
}

/**
 * Keeps the database copy of someone's roles in line with their token, so
 * team notifications and member lists stay accurate. Access decisions never
 * read this copy while the token carries roles.
 */
export async function syncUserFromToken(auth: AuthUser, access: Access) {
  const role = access.isCaseAdmin ? "admin" : access.teams.length ? "team_member" : "business_owner";
  const user = await prisma.user.upsert({
    where: { email: auth.email },
    update: { name: auth.name, azureObjectId: auth.oid, role, active: true },
    create: { name: auth.name, email: auth.email, azureObjectId: auth.oid, role },
  });
  const wanted = [...access.teams, ...(access.isCaseAdmin ? ["Admin"] : [])];
  // Teams are seeded, but create any that are missing so a role is never dropped.
  const wantedIds: number[] = [];
  for (const name of wanted) {
    const team = await prisma.team.upsert({ where: { name }, update: {}, create: { name } });
    wantedIds.push(team.id);
  }
  await prisma.teamMember.deleteMany({ where: { userId: user.id, teamId: { notIn: wantedIds } } });
  for (const teamId of wantedIds) {
    await prisma.teamMember.upsert({
      where: { userId_teamId: { userId: user.id, teamId } },
      update: {},
      create: { userId: user.id, teamId, isAdmin: false },
    });
  }
  return prisma.user.findUnique({ where: { id: user.id }, include: { memberOf: { include: { team: true } } } });
}
