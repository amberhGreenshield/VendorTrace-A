# Security notes — VendorTrace

## Secrets
- **No secrets live in this repository.** Production secrets are stored in
  **Azure Key Vault** and exposed to the API as App Service environment
  variables via Key Vault references (`@Microsoft.KeyVault(...)`).
- Local development uses `api/.env` / `.env`, which are git-ignored. Copy the
  matching `.env.example` file and fill in local values only.
- The frontend has no secrets: every `VITE_*` value (client ID, tenant ID,
  API URL) is public by design and ends up in the browser bundle.

| Secret | Used by | Lives in |
|---|---|---|
| `DATABASE_URL` | API | Key Vault → App Service setting |
| `GRAPH_CLIENT_SECRET` | API (SharePoint, email) | Key Vault → App Service setting |
| `JOB_SECRET` (optional) | API reminder trigger | Key Vault → App Service setting |
| App Service publish profile | GitHub Actions deploy | GitHub encrypted secret |
| Static Web Apps deploy token | GitHub Actions deploy | GitHub encrypted secret |

## Automated checks
- **Secret scanning** runs on every push and pull request
  (`.github/workflows/secret-scan.yml`, rules in `.gitleaks.toml`) and fails
  the build if a credential or `.env` file is added. Run locally with
  `gitleaks git --config .gitleaks.toml`.
- **Dependencies**: run `npm audit --omit=dev` in the repo root and in `api/`.
  Known accepted item: `deepmerge-ts` inside the Prisma CLI (deploy-time
  tooling only, no user input reaches it; fixed in Prisma 7).

## Incident history
- **Aug–Oct 2026:** `api/.env` (database connection string, Graph client
  secret) and a staff recipient list were committed to this then-public
  repository and later deleted from the latest version (they remained in
  git history). Status — update as each step is done:
  - [ ] Repository made private
  - [ ] Graph client secret rotated (old secret deleted in Entra ID)
  - [ ] Database password rotated
  - [ ] Secrets moved to Key Vault, referenced from App Service
  - [ ] Git history rewritten / old branches removed
  - [ ] Sign-in and database logs reviewed for use of the exposed credentials

## Reporting
Report suspected vulnerabilities to the VendorTrace owner (PVM) and
GreenShield Security Architecture — not in a public GitHub issue.
