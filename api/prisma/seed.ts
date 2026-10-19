import { prisma } from "../src/db.js";

// Matches TEAM_LABELS in src/domain/schema.ts — run this once against a
// fresh database (`npx tsx prisma/seed.ts`) so teams exist for users to
// join and for notification lookups to find members against.
//
// "Admin" is the inbox every new case lands in first (stage seqOrder 0). Its
// members get the "new case ready" email; whether someone can actually edit
// hierarchies is decided by User.role = "admin" (see CASE_ADMINS below).
const TEAM_NAMES = [
  "Admin",
  "AI",
  "Business Architecture",
  "Data",
  "Enterprise Architecture",
  "Privacy",
  "PVM",
  "Risk",
  "Security Architecture",
  "Security Governance",
];

// ─── Bootstrap admin(s) ──────────────────────────────────────────────────
// Nobody can be added to a team through the app until at least one admin
// exists — but admins are the ones who add people.
const BOOTSTRAP_ADMINS: { name: string; email: string; teamName: string }[] = [
  { name: "Amber Hashwani", email: "amber.hashwani@greenshield.ca", teamName: "PVM" },
];

// ─── Case admins ─────────────────────────────────────────────────────────
// People who see the Admin Inbox and can rearrange a case's review
// hierarchy (User.role = "admin"). Intentionally just Amber for now — add
// names here to grant it; there's no UI for this on purpose.
const CASE_ADMINS: { name: string; email: string }[] = [
  { name: "Amber Hashwani", email: "amber.hashwani@greenshield.ca" },
];

async function main() {
  for (const name of TEAM_NAMES) {
    await prisma.team.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${TEAM_NAMES.length} teams.`);

  for (const admin of BOOTSTRAP_ADMINS) {
    const team = await prisma.team.findUniqueOrThrow({ where: { name: admin.teamName } });
    const user = await prisma.user.upsert({
      where: { email: admin.email.toLowerCase() },
      update: { name: admin.name },
      create: { name: admin.name, email: admin.email.toLowerCase(), role: "team_member" },
    });
    await prisma.teamMember.upsert({
      where: { userId_teamId: { userId: user.id, teamId: team.id } },
      update: { isAdmin: true },
      create: { userId: user.id, teamId: team.id, isAdmin: true },
    });
    console.log(`Bootstrapped ${admin.name} <${admin.email}> as admin on ${admin.teamName}.`);
  }

  const adminTeam = await prisma.team.findUniqueOrThrow({ where: { name: "Admin" } });
  for (const admin of CASE_ADMINS) {
    const user = await prisma.user.upsert({
      where: { email: admin.email.toLowerCase() },
      update: { name: admin.name, role: "admin", active: true },
      create: { name: admin.name, email: admin.email.toLowerCase(), role: "admin" },
    });
    // Membership on the Admin team is what gets them the "new case" email.
    await prisma.teamMember.upsert({
      where: { userId_teamId: { userId: user.id, teamId: adminTeam.id } },
      update: { isAdmin: true },
      create: { userId: user.id, teamId: adminTeam.id, isAdmin: true },
    });
    console.log(`Granted case-admin role to ${admin.name} <${admin.email}>.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
