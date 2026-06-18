---
name: project-overview
description: "LawPath SA — tech stack, deployment, DB migrations status, billing architecture, outstanding work"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7bd26372-d399-43d4-9d13-5c4d8d5415db
---

LawPath SA is an AI-native multi-tenant SaaS for South African law firms.

**Why:** User's life work; production system for real SA law firms.

**How to apply:** Always apply SA-specific context (ZAR cents, 15% VAT, LPC compliance, SA court rules, FICA/POPIA) and multi-tenancy (`tenant_id` on every table).

## Stack
- Frontend: React 19, TypeScript, Vite, custom CSS (Lora + Inter fonts, CSS variables)
- Backend: Node.js, Express 5 (wildcard routes MUST be named: `/*service` not `/*`)
- DB: PostgreSQL 14+, migrations in `db/migrations/`
- Auth: JWT + bcryptjs
- Storage: Google Cloud Storage
- AI: OpenAI (primary), Gemini, Grok
- PDF: PDFKit (server-side)
- Billing: Yoco (ZAR subscriptions); custom invoice billing for professional fees
- WhatsApp: whatsapp-web.js + Meta Cloud API fallback

## Local / Server
- Local: `E:\Replit-Clone\workspace\LawPath`
- Server: Ubuntu 22.04, `/home2/lawpath/app/LawPath`, PM2, Apache proxy, port 3069
- Deploy: `PUPPETEER_SKIP_DOWNLOAD=true bash deploy.sh`

## DB Migrations (all applied through 018)
013_billing_invoices.sql — `invoice_line_items`, `invoice_payments`, expanded `invoices`, FK on `time_entries.invoice_id`
014_clients.sql — Clients CRM table
015_lightstone.sql — Lightstone Property API provider row + usage log table
016_invoice_client_email.sql — Replit Agent change, not yet reviewed line-by-line
017_invoice_header_fields.sql — Replit Agent change, not yet reviewed line-by-line
018_ai_feature_routing.sql — AI features[] column on platform_api_provider_settings

## Billing Architecture (two separate systems)
| key | Component | Purpose |
|---|---|---|
| `"billing"` | `src/Billing.tsx` | WIP → Invoice → PDF → Email → Payment → Accounting |
| `"billing-portal"` | `src/StripeBilling.tsx` | Yoco ZAR subscription plans |

## Current Status (as of 2026-06-18)
All tiers complete. Billing.tsx done (935 lines). AI feature routing system built (L4).
TypeScript compiles clean. 122 API endpoints, 23 frontend components, 18 migrations applied.
See memory(L4).md for full platform summary and memory(L4-cont).md for metrics + corrected outstanding items.

## Outstanding
- Review `server/mailer.js`, `server/pdf.js`, and migrations 016/017 — Replit Agent commit `416d85c`
- Lightstone Azure APIM 500 — subscription config on portal.apis.lightstone.co.za (Lightstone-side)
- Bake `PUPPETEER_SKIP_DOWNLOAD=true` permanently into `deploy.sh`/`.env`
- Yoco live keys: add `sk_live_` + `whsec_` to server .env
- SAFLII first run: `nohup node server/saflii.js --limit 50 --years 5 > logs/saflii-first-run.log 2>&1 &`
- VerifyNow API key: set in Super Admin → Settings → API Keys
