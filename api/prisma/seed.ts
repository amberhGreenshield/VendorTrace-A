import { prisma } from "../src/db.js";

// Matches TEAM_LABELS in src/domain/schema.ts — run this once against a
// fresh database (`npx tsx prisma/seed.ts`) so teams exist for users to
// join and for notification lookups to find members against.
const TEAM_NAMES = [
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
// exists — but admins are the ones who add people. EDIT THIS with your own
// name/email/team before running, so you become the first admin and can
// add everyone else from the in-app admin panel from then on.
const BOOTSTRAP_ADMINS: { name: string; email: string; teamName: string }[] = [
  // { name: "Amber H", email: "amber.h@greenshield.ca", teamName: "PVM" },
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
