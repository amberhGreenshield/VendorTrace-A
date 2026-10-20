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
- `PUT /api/cases/:id/hierarchy` — **case admins only**. Body:
  `{ "actingAdminEmail": "...", "stages": [{ "stageKey"?, "team", "label"?, "seqOrder" }] }`
  — the full list of not-yet-started stages as the admin wants them. See
  "Admin hierarchy editing" below.

## Admin hierarchy editing

Every new case now opens in an **Admin Review** stage (`admin-review`,
step 0) instead of going straight to PVM / BA / Risk. Case admins see it in
the **Admin Inbox**, can rearrange the hierarchy with drag and drop, then
release it (completing `admin-review`), which activates step 1 of the edited
hierarchy.

- **Who is a case admin:** `User.role = "admin"`. Seeded for Amber Hashwani
  only (`CASE_ADMINS` in `prisma/seed.ts`). This is separate from
  `TeamMember.isAdmin`, which only controls adding people to teams.
- **What can be edited:** anything where work hasn't started. In-progress
  and completed stages, and the Admin Review stage itself, are locked. A
  team that has been handed the case but hasn't clicked Start yet can still
  be moved to a later step (the case leaves their inbox) or removed.
  Always-required stages can be moved but not removed. Any assessor team can
  be added, including a second pass by the same team.
- **Adding a team after release:** drop it into the step marked IN REVIEW
  and it lands in that team's inbox (and they're emailed) as soon as you
  save. Drop it on a later step and it arrives when the case gets there.
  Nothing can be dropped into the Admin Review step, so nothing bypasses
  the inbox. Removing the last unfinished team in the current step moves
  the case on to the next step immediately.
- **Concurrent changes:** the editor sends the case's `updatedAt` it was
  built from (`expectedUpdatedAt`). If a team started or finished a review
  in the meantime, the save is refused with `409 STALE_CASE` and the editor
  offers "Load latest", so an edit is never applied to a hierarchy the
  admin hasn't seen.
- **Assessment status** (PIA / DIA / UpGuard) now tracks the owner team's
  stages on every start, complete and hierarchy edit: in progress while the
  owner team has the case, completed when every owner stage is done, and
  reopened if a further pass by that team is added.
- **Assessments follow their teams:** adding Privacy makes the PIA required.
  Adding Data or AI makes the Data & AI Impact Assessment (DIA) required.
  Removing the last owning team un-requires it. When Graph is configured,
  the template is copied into the case's SharePoint folder and linked on the
  case. `CaseAssessment.requiredByAdmin` is set when an edit is what made
  an assessment required. In that case only, the business owner sees a
  one-line "please complete a PIA/DIA" notice with the link, until it's
  done. Assessments the rules engine required at intake don't show it.
- **Visibility:** `Case.hierarchyEditedAt/By` is stamped on every edit, and
  all case pages show the current hierarchy at the top with a "Customized by"
  tag.
- **Deploy:** run `npx prisma migrate deploy` (adds the two columns and the
  `Admin` team) and then `npm run prisma:seed` (grants Amber the role).
  Cases created before this change have no `admin-review` stage. They
  never appear in the inbox, but Amber can still edit their upcoming
  stages from the "All Open Cases" tab.

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

## Team dashboard tabs

Each review team's dashboard sorts every case into exactly one tab, worked
out fresh from the live hierarchy (`casesForTeam` in `src/lib/viewAdapters.ts`):

| Tab | When |
|---|---|
| New Cases | it's this team's turn and they haven't started |
| In Progress | this team has started |
| Upcoming | this team is later in the hierarchy |
| Completed | this team's part is done |
| Other Open Cases | open case this team isn't part of, view only |

Cases still in the Admin Inbox aren't shown to any team. Because the tab is
recomputed rather than stored, a case an admin adds a team to moves out of
that team's "Other Open Cases" on its own. The app refreshes cases every
60 seconds and whenever the window regains focus.

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
