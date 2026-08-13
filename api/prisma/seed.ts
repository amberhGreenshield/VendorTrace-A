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

async function main() {
  for (const name of TEAM_NAMES) {
    await prisma.team.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`Seeded ${TEAM_NAMES.length} teams.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
