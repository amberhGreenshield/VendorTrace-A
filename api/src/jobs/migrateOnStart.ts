import { spawn } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// ─── Apply pending database migrations at startup ───────────────────────────
// Runs `prisma migrate deploy` before the API starts listening, so merging a
// pull request that includes a migration is all it takes to roll it out —
// no SSH session needed. It only applies migrations that haven't run yet
// (safe to run on every start, and Prisma takes a lock so two instances
// starting together don't collide).
//
// Never fatal: if it fails (e.g. the database is unreachable for a moment),
// the error is logged and the API still starts, rather than crash-looping.
// Turn off with MIGRATE_ON_START=false.

const require = createRequire(import.meta.url);

/** Older deploys lost execute permissions on Prisma's engine binaries — restore them defensively. */
function ensureEnginesExecutable(): void {
  for (const pkg of ["@prisma/engines", "prisma"]) {
    let dir: string;
    try {
      dir = path.dirname(require.resolve(`${pkg}/package.json`));
    } catch {
      continue;
    }
    for (const name of readdirSync(dir)) {
      if (!/^(schema-engine|query-engine|migration-engine)/.test(name)) continue;
      const file = path.join(dir, name);
      try {
        if (statSync(file).isFile()) chmodSync(file, 0o755);
      } catch {
        /* read-only filesystem etc. — prisma will report it below */
      }
    }
  }
}

export async function migrateOnStart(): Promise<void> {
  if (process.env.MIGRATE_ON_START === "false") return;
  if (!process.env.DATABASE_URL) {
    console.warn("migrate-on-start: DATABASE_URL not set — skipping.");
    return;
  }
  let cli: string;
  try {
    cli = require.resolve("prisma/build/index.js");
  } catch {
    console.warn("migrate-on-start: Prisma CLI not installed — skipping. Run `npx prisma migrate deploy` manually.");
    return;
  }
  const schema = path.resolve(path.dirname(cli), "../../../prisma/schema.prisma");
  ensureEnginesExecutable();

  await new Promise<void>((resolve) => {
    const args = [cli, "migrate", "deploy", ...(existsSync(schema) ? ["--schema", schema] : [])];
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      console.error("migrate-on-start: timed out after 120s — starting anyway.");
      child.kill();
    }, 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const summary = out.trim().split("\n").slice(-6).join("\n");
      if (code === 0) console.log(`migrate-on-start: ok\n${summary}`);
      else console.error(`migrate-on-start: FAILED (exit ${code}) — the API will start, but new features may error until this is fixed.\n${summary}`);
      resolve();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("migrate-on-start: could not run Prisma:", err);
      resolve();
    });
  });
}
