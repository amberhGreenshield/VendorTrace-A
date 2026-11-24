import { Router } from "express";
import { prisma } from "../db.js";
import { accessFromToken, resolveAccess, syncUserFromToken, tokenManagesRoles } from "../auth/access.js";

export const usersRouter = Router();

/**
 * GET /api/me?email=... — called right after MSAL sign-in succeeds, to find
 * out whether this person has already been provisioned onto a team, and
 * whether they're an admin. If no User row exists yet, `found: false` is
 * returned — the frontend treats that as "not yet added to a team, default
 * to Business Owner" rather than an error.
 */
usersRouter.get("/me", async (req, res) => {
  // Access managed by Saviynt (app roles in the token): the token is the
  // source of truth; mirror it into the database and answer from it.
  if (req.auth && tokenManagesRoles(req.auth)) {
    const access = accessFromToken(req.auth);
    const user = await syncUserFromToken(req.auth, access);
    return res.json({
      found: true,
      name: req.auth.name,
      email: req.auth.email,
      role: user?.role,
      isCaseAdmin: access.isCaseAdmin,
      isBusinessOwner: access.isBusinessOwner,
      accessManaged: true,
      teamMemberships: (user?.memberOf ?? []).map((m: any) => ({ teamId: m.teamId, teamName: m.team.name })),
    });
  }

  // Signed in with a verified token → it's that person, whatever the URL says.
  const email = (req.auth?.email ?? String(req.query.email ?? "")).trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email is required" });

  let user = await prisma.user.findUnique({
    where: { email },
    include: { memberOf: { include: { team: true } } },
  });

  if (!user) return res.json({ found: false });

  // First verified sign-in: link the database record to the person's Entra ID.
  if (req.auth && !user.azureObjectId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { azureObjectId: req.auth.oid },
      include: { memberOf: { include: { team: true } } },
    });
  }
  const access = await resolveAccess(req, email);

  res.json({
    found: true,
    name: user.name,
    email: user.email,
    role: user.role,
    /** Sees every open case, reviews new cases and changes review hierarchies — see auth/access.ts. */
    isCaseAdmin: access.isCaseAdmin,
    isBusinessOwner: access.isBusinessOwner,
    accessManaged: false,
    teamMemberships: user.memberOf.map((m: (typeof user.memberOf)[number]) => ({
      teamId: m.teamId,
      teamName: m.team.name,
    })),
  });
});

/** GET /api/teams — every team with its current member list (for the admin panel). */
usersRouter.get("/teams", async (_req, res) => {
  const teams = await prisma.team.findMany({
    include: { members: { include: { user: true } } },
    orderBy: { name: "asc" },
  });
  res.json(
    teams.map((t: (typeof teams)[number]) => ({
      id: t.id,
      name: t.name,
      members: t.members.map((m: (typeof t.members)[number]) => ({ userId: m.user.id, name: m.user.name, email: m.user.email })),
    }))
  );
});

// Adding people to teams is done in Saviynt (Entra app roles), not in VendorTrace.

//Add the persistence endpoint

usersRouter.post("/me/profile", async (req, res) => {
  const body = req.body as {
    name?: string;
    email?: string;
    role?: "team" | "businessOwner";
    teamName?: string;
  };
  // Signed in → name and email come from Microsoft, not the request.
  const name = req.auth?.name ?? body.name;
  const email = req.auth?.email ?? body.email;
  const { role, teamName } = body;

  if (!name || !email || !role) {
    return res.status(400).json({
      error: "name, email, and role are required",
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail.endsWith("@greenshield.ca")) {
    return res.status(403).json({
      error: "Only GreenShield accounts can use VendorTrace.",
    });
  }

  if (tokenManagesRoles(req.auth)) {
    return res.status(409).json({ error: "Your VendorTrace access is managed in Saviynt. Request any changes there." });
  }

  // With real sign-in, people can't put themselves on a review team: that
  // access comes from Saviynt. Only "Business Owner" is self-service until then.
  if (req.auth && role === "team") {
    return res.status(403).json({
      error: "Review-team access is requested through Saviynt. Once it's approved, sign in again.",
    });
  }

  if (role === "team" && !teamName) {
    return res.status(400).json({
      error: "teamName is required for team members.",
    });
  }

  // Never let the self-service role picker demote a case admin back to a
  // plain team member / business owner.
  const current = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const nextRole = current?.role === "admin" ? "admin" : role === "team" ? "team_member" : "business_owner";

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      name,
      role: nextRole,
    },
    create: {
      name,
      email: normalizedEmail,
      role: role === "team" ? "team_member" : "business_owner",
    },
  });

  if (role === "businessOwner") {
    return res.json({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  const team = await prisma.team.findUnique({
    where: { name: teamName },
  });

  if (!team) {
    return res.status(404).json({
      error: `Team "${teamName}" was not found.`,
    });
  }

  const membership = await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId: team.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      teamId: team.id,
      isAdmin: false,
    },
  });

  return res.json({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamName: team.name,
    isAdmin: membership.isAdmin,
  });
});
