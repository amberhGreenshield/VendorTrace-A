import { Router } from "express";
import { prisma } from "../db.js";

export const usersRouter = Router();

/**
 * GET /api/me?email=... — called right after MSAL sign-in succeeds, to find
 * out whether this person has already been provisioned onto a team, and
 * whether they're an admin. If no User row exists yet, `found: false` is
 * returned — the frontend treats that as "not yet added to a team, default
 * to Business Owner" rather than an error.
 */
usersRouter.get("/me", async (req, res) => {
  const email = String(req.query.email ?? "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email is required" });

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberOf: { include: { team: true } } },
  });

  if (!user) return res.json({ found: false });

  res.json({
    found: true,
    name: user.name,
    email: user.email,
    teamMemberships: user.memberOf.map((m: (typeof user.memberOf)[number]) => ({
      teamId: m.teamId,
      teamName: m.team.name,
      isAdmin: m.isAdmin,
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
      members: t.members.map((m: (typeof t.members)[number]) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, isAdmin: m.isAdmin })),
    }))
  );
});

/**
 * POST /api/team-members — an admin adds someone (by name+email) to a team.
 * `isAdmin` here is a GLOBAL flag: anyone marked isAdmin on ANY team can add
 * people to ANY team, not just their own — see api/README.md for the
 * reasoning. Creates the User row if this is a brand new email.
 *
 * NOTE: this checks `actingAdminEmail` against the database, but doesn't
 * verify a real auth token yet (no token validation exists in this API at
 * all currently — see ROADMAP.md item 1). Anyone who knows an admin's email
 * could currently claim to be them. Harden this once real SSO token
 * validation is wired in.
 */
usersRouter.post("/team-members", async (req, res) => {
  const { actingAdminEmail, name, email, teamName, isAdmin } = req.body as {
    actingAdminEmail?: string;
    name?: string;
    email?: string;
    teamName?: string;
    isAdmin?: boolean;
  };
  if (!actingAdminEmail || !name || !email || !teamName) {
    return res.status(400).json({ error: "actingAdminEmail, name, email, and teamName are all required" });
  }

  const actingAdmin = await prisma.user.findUnique({
    where: { email: actingAdminEmail.trim().toLowerCase() },
    include: { memberOf: true },
  });
  const isActingAdmin = actingAdmin?.memberOf.some((m: (typeof actingAdmin.memberOf)[number]) => m.isAdmin) ?? false;
  if (!isActingAdmin) {
    return res.status(403).json({ error: "You don't have admin access to add team members." });
  }

  const team = await prisma.team.findUnique({ where: { name: teamName } });
  if (!team) return res.status(404).json({ error: `Team "${teamName}" not found` });

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { name },
    create: { name, email: normalizedEmail, role: "team_member" },
  });

  const membership = await prisma.teamMember.upsert({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
    update: { isAdmin: Boolean(isAdmin) },
    create: { userId: user.id, teamId: team.id, isAdmin: Boolean(isAdmin) },
  });

  res.status(201).json({ userId: user.id, name: user.name, email: user.email, teamName: team.name, isAdmin: membership.isAdmin });
});

//Add the persistence endpoint

usersRouter.post("/me/profile", async (req, res) => {
  const { name, email, role, teamName } = req.body as {
    name?: string;
    email?: string;
    role?: "team" | "businessOwner";
    teamName?: string;
  };

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

  if (role === "team" && !teamName) {
    return res.status(400).json({
      error: "teamName is required for team members.",
    });
  }

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      name,
      role: role === "team" ? "team_member" : "business_owner",
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
