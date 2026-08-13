# Procurement Intake API

The Node.js/Express backend for the procurement intake app. This is the piece
that goes on **Azure App Service**. It's the "authoritative" version of the
trigger logic — the frontend runs its own copy of the same rules for instant
preview, but this is the one that actually writes to the database, so a
tampered client request can't create a bogus case.

## What's in here

- `prisma/schema.prisma` — direct translation of the frontend's
  `src/lib/schema.ts` types into Postgres tables (Case, CaseStage,
  CaseAssessment). Facts (TPRM answers) are stored as JSON on the case for
  now rather than a fully normalized table — simple to start, easy to split
  out later if you need to query individual answers across many cases.
- `src/domain/` — ported straight from the frontend's `src/lib/`:
  `rulesEngine.ts` and `hierarchy.ts` are byte-for-byte the same logic (they
  have zero browser dependencies, so nothing needed to change).
  `tprmParser.ts` is the same label-matching logic, adapted to read a
  `Buffer` (from a file upload) instead of the browser's `File` API.
  `sharepointService.ts` is still mocked — same `TODO(Azure)` as the
  frontend's version, but this is the one that will eventually hold the real
  Graph API client secret (which must never live in the browser).
- `src/routes/cases.ts` — the actual HTTP endpoints.
- `src/index.ts` — Express app bootstrap.

## Endpoints

- `GET /api/cases?businessOwner=X&team=Y` — list cases
- `GET /api/cases/:id` — one case with its stages + assessments
- `POST /api/cases` — multipart form with a `tprmFile` and `businessOwner`
  field; parses the workbook, runs the rules, builds the stage hierarchy,
  creates the (mocked) SharePoint folder, and saves the case
- `POST /api/cases/:id/stages/:stageKey/start`
- `POST /api/cases/:id/stages/:stageKey/complete` — body: `{ "completedBy": "Name" }`

## Running it

You do **not** need Azure resources to develop this — everything here can
run locally or in a Codespace today. You only need a real Azure App Service
+ Postgres when you're ready to deploy it live.

1. Get a Postgres connection string (local Docker Postgres, or your Azure
   Flexible Server once it exists tomorrow).
2. `cp .env.example .env` and fill in `DATABASE_URL`.
3. `npm install`
4. `npm run prisma:migrate` — creates the tables (needs internet access to
   download the Prisma engine binary the first time; this sandbox couldn't
   reach `binaries.prisma.sh`, so it hasn't been run here, but it will work
   fine in your Codespace or locally).
5. `npm run dev` — starts the API on `http://localhost:4000`.

## Deploying to Azure App Service (once it exists)

1. Set `DATABASE_URL` as an App Service **Application Setting** (or better,
   reference it from Key Vault via a Key Vault reference).
2. `npm run build` produces `dist/`; App Service's Node.js runtime runs
   `npm start` (`node dist/index.js`) by default if you deploy via
   GitHub Actions/`az webapp up` with `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
3. Update the frontend's `caseStore.ts` (`loadCases`/`saveCases`) to call
   these endpoints via `fetch` instead of reading/writing `localStorage` —
   everything else in the UI (`TeamDashboard`, `CaseDetails`, etc.) doesn't
   need to change since it already just receives `Case` objects as props.

## SharePoint integration (real, with mock fallback)

`src/domain/sharepointService.ts` calls real Microsoft Graph endpoints once
these five env vars are set: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`,
`GRAPH_CLIENT_SECRET`, `SHAREPOINT_HOSTNAME`, `SHAREPOINT_SITE_PATH`. If any
are missing, it automatically falls back to the mocked version — safe to
deploy before your Entra ID admin consent comes through.

Before turning it on for real:
1. Register an app in Entra ID, create a client secret, grant it
   `Sites.ReadWrite.All` (or `Sites.Selected` + explicit site grant) on
   Microsoft Graph, and get admin consent.
2. On the actual SharePoint site, create `TPRM Cases/_Templates/` and
   upload the three files from this repo's `public/templates/` folder into
   it (same filenames).
3. Set the five env vars above.

This has **not been tested against a real tenant** (written in an isolated
sandbox with no network access to Microsoft's endpoints) — test it for real
and expect to iterate, especially the async copy-and-poll logic in
`graphClient.ts`'s `copyItemToFolder`.

## Email notifications (mocked)

`src/domain/notificationService.ts` currently logs instead of sending. Pick
one of the three options in that file's comments (Graph `sendMail`, Azure
Communication Services, or SendGrid) and only `sendEmail()` needs to change.
