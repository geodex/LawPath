# LawPath SA Architecture Guardrails

These rules keep the app easy to move from a local Windows workspace to Ubuntu 22.04 with Virtualmin Pro, Apache and PostgreSQL.

## Runtime Shape

- Frontend: Vite React TypeScript, built to static files in `dist/`.
- Web server: Apache serves `dist/`.
- Backend: to be added as a separate API service.
- Database: PostgreSQL.

## Portability Rules

- Do not hard-code Windows paths such as `C:\Users\...`.
- Do not hard-code production domains inside components. Use environment values.
- Do not rely on local files outside the project folder.
- Keep deployable frontend assets inside `src`, `public` or `assets`.
- Use `npm ci` on the server for reproducible installs.

## Secrets Rule

Never store real secrets in frontend code or `VITE_` variables. Browser users can inspect bundled frontend values.

These must live only in the backend/server environment:

- PostgreSQL credentials
- SMTP username/password
- OpenAI, Gemini, Grok and ExchangeRates API keys
- session secrets
- password reset tokens

## Multi-Tenant Rule

Every tenant-owned backend record must be scoped by `tenant_id`.

Tenant users can only access records where:

```text
record.tenant_id === authenticated_user.tenant_id
```

Super-admin features must be stored and authorized separately from tenant features.

## Settings Boundary

Platform super admin controls:

- SMTP transport credentials
- AI provider API keys
- exchange-rate provider API key
- global model routing defaults

Tenant admin controls:

- company name
- sender display name
- from email
- reply-to email
- portal email signature
- user/team membership for their own tenant

Tenant-branded emails should use tenant identity in message headers/body while sending through the platform SMTP transport.

## Frontend Convention

Keep UI state mocked only until the backend exists. When backend endpoints are added, replace local mock state through a small API client layer instead of calling `fetch` throughout components.
