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
 * With a verified Entra token the email passed in is the token's user (see
 * auth/entraAuth.ts); the request-body email is only used while
 * AUTH_REQUIRED is off (demo sign-in).
 */
export async function isCaseAdminEmail(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  return !!user && user.active && user.role === "admin";
}
