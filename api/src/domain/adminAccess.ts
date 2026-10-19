import { prisma } from "../db.js";

/**
 * Who is allowed to rearrange a case's review hierarchy.
 *
 * This is deliberately a SEPARATE, stricter check from `TeamMember.isAdmin`
 * (which only lets someone add people to teams). A case admin is a User
 * whose `role` is "admin" — set in `prisma/seed.ts`. Right now that's only
 * Amber Hashwani; to grant it to someone else, add them to the
 * BOOTSTRAP_ADMINS list there (or update the row directly) rather than
 * exposing a "make case admin" button in the UI.
 *
 * Same caveat as the rest of this API: there's no token validation yet
 * (ROADMAP.md item 1), so `actingAdminEmail` is trusted from the request
 * body. Harden this once SSO tokens are verified server-side.
 */
export async function isCaseAdminEmail(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  return !!user && user.active && user.role === "admin";
}
