# GreenShield Procurement Intake Platform

A React + Vite frontend for GreenShield's Third-Party Risk Management (TPRM) Procurement Intake Platform.

## Prerequisites

- Node.js 18+ (https://nodejs.org)
- npm (comes with Node.js)

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build for Production

```bash
npm run build
# Output goes to dist/
```

## Project Structure

```
src/
  App.tsx                  # Root component + routing
  main.tsx                 # Entry point
  index.css                # Global styles (Tailwind v4)
  data/
    mockCases.ts           # All case data + assessment logic
  lib/
    auth.ts                # Mock auth helpers
    mockApi.ts             # Mock API calls
    utils.ts               # Tailwind class helpers
  components/
    Header.tsx
    ViewSwitcher.tsx
    AssessmentCard.tsx
    AssessmentSection.tsx
    AssignedToSection.tsx
    DescriptionCard.tsx
  pages/
    Login.tsx
    TeamSelect.tsx
    TeamSnapshot.tsx
    TeamDashboard.tsx
    CaseDetails.tsx
    BusinessOwnerSnapshot.tsx
    BusinessOwnerDashboard.tsx
    BusinessOwnerCaseDetails.tsx
```

## Customising Case Data

Edit `src/data/mockCases.ts` to add/edit cases. The assessment logic
(which assessments appear per case) is derived from the intake workbook
answers stored in that file — see the comments for the exact rules.

## Running with the real backend (`api/`)

As of this version, the frontend calls the real API instead of using
localStorage. To run the full stack locally:

```bash
# Terminal 1 — the API
cd api
cp .env.example .env   # fill in DATABASE_URL
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev             # listens on http://localhost:4000

# Terminal 2 — the frontend
cp .env.example .env    # VITE_API_BASE_URL defaults to http://localhost:4000, fine for local dev
npm install
npm run dev              # listens on http://localhost:5173
```

If the API isn't reachable, the app shows a "couldn't reach the API" error
with a retry button rather than silently falling back to fake data — this
is intentional now that the app is meant for real use, not just demos.
