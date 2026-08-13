# Roadmap / Planned Work

Not built yet — captured here so it isn't lost. Each item notes what exists
today, what has to change, and roughly how.

---

## 1. Microsoft SSO (Azure AD / Entra ID) — SCAFFOLDING BUILT, needs a real app registration + testing

**Status:** `src/pages/Login.tsx` now uses real MSAL (`@azure/msal-react`) —
tries silent SSO first, falls back to a real Microsoft sign-in redirect.
First-time users still pick Team Member vs Business Owner right after,
same UX as before, just without typing a name/email (Microsoft already
told us that). **This has not been tested against a real tenant** — the
sandbox this was built in can't do interactive OAuth redirects at all, so
treat this as a solid starting point that will need real-world debugging,
not a finished feature.

**What's still needed:**
- Register a SEPARATE Entra ID app for sign-in (public client / SPA
  platform — different from the confidential-client app used for Graph
  calls in `api/`, which has a secret). See the comment block at the top
  of `src/lib/msalConfig.ts` for the exact settings.
- Set `VITE_MSAL_CLIENT_ID` / `VITE_MSAL_TENANT_ID` once that exists.
- **The identity is still only stored in `localStorage`**, keyed by MSAL's
  `homeAccountId` (see `src/lib/auth.ts`) — not yet the real database. That
  means someone's team/role choice doesn't follow them to a different
  browser/device yet. The `User` table in `api/prisma/schema.prisma`
  already has an `azureObjectId` column ready for this — next step is an
  API endpoint like `GET/POST /api/me` that the frontend calls right after
  MSAL confirms identity, instead of checking `localStorage`.
- The API (`api/`) still needs to validate the actual MSAL access token on
  incoming requests instead of trusting whatever `businessOwner` string the
  frontend sends — right now `POST /api/cases` still just takes that as a
  plain string in the request body.

---

## 2. Multi-team membership + combined Business Owner/Team identity + view switching

**Current state — this is a real gap, not just missing UI:**
- `UserProfile.team` (`src/lib/auth.ts`) is a **single** optional object,
  not a list. A user can belong to exactly one team or zero.
- `mockJoinTeam()` (`src/lib/mockApi.ts`) *replaces* whatever team the user
  had — there's no "add a second team" path today.
- `TeamSelect.tsx` is a one-time picker shown only right after first login;
  there's no way to revisit it and join more teams later.
- The `ViewSwitcher` component already exists and already flips between
  "Team View" and "Business Owner View" — but that's just a display toggle,
  not tied to whether the user is actually *supposed* to have BO access. Any
  logged-in user can currently flip to BO view and see cases where
  `businessOwner === their name`, which happens to work today but isn't a
  real permission model.
- The Prisma schema is actually already set up for this correctly —
  `TeamMember` is a many-to-many join table between `User` and `Team` (see
  `api/prisma/schema.prisma`), so the **database side needs no redesign**.
  This is a frontend + API-surface gap, not a data model gap.

**What changes:**
- Add a persistent "My Teams" management page/section (not just the
  one-time `TeamSelect` flow) where a user can join additional teams or
  leave ones they're on, backed by real create/delete calls against
  `TeamMember` rows via the API.
- Change `UserProfile.team` → `UserProfile.teams: Team[]`, and update every
  place that reads `.team` (App.tsx's `teamKeyFromLabel`, TeamSnapshot,
  TeamDashboard headers) to instead work from a **currently selected**
  team, with a dropdown/switcher to change which team's dashboard you're
  looking at — similar pattern to the existing team/BO `ViewSwitcher`, just
  one level deeper (which team, in addition to team-vs-BO).
- "Being a BO" isn't really a team at all — it's more like a role flag.
  Simplest approach: anyone can access BO view (since it's scoped to "cases
  where I'm listed as the business owner," which is already self-limiting),
  and the `ViewSwitcher` just needs to show/hide the BO option based on
  whether the user has ever created a case, or unconditionally allow it
  (worth a quick product decision, not just an engineering one).
- Once SSO (#1) is in, this also determines what "your teams" persists
  against — the Entra ID identity — rather than the current `localStorage`-
  based session.

---

*Neither of these blocks what's currently built — the app works fully
today with one-team-per-user and mock login. These are queued for after
the Azure infra + API are live.*
