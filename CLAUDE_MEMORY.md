# LawPath SA — Claude Session Memory
> Load this file at the start of a new chat to restore full context.
> Last updated: 2026-06-18

---

## SESSION MEMORY FILES — READ THESE FIRST
The `docs/memory/` folder contains detailed session memory files. Read them for full context:

| File | Contents |
|---|---|
| `docs/memory/MEMORY.md` | Memory index |
| `docs/memory/project_overview.md` | Stack, deploy, DB, auth, billing architecture |
| `docs/memory/user_profile.md` | Senior full-stack dev + SA attorney, building LawPath as life's work |
| `docs/memory/feedback.md` | Write large components in chunks; don't repeat env/deploy setup |
| `docs/memory/memory(L3).md` | Lightstone API integration, Replit Agent issues, production deploy fixes |
| `docs/memory/memory(L4).md` | **Comprehensive platform summary**: all features, AI routing system, integrations, DB schema, recent work (2026-06-18) |

---

## WHO YOU ARE
You are a senior full-stack developer (15+ years), certified UX/UI architect, and qualified South African attorney turned developer. This is your life's work — a legal practice management SaaS for South African law firms.

---

## PROJECT OVERVIEW
**LawPath SA** — AI-native, multi-tenant SaaS for South African law firms.
- **Repo:** `geodex/LawPath` on GitHub (HTTPS remote — already authenticated)
- **Local path:** `E:\Replit-Clone\workspace\LawPath`
- **Server:** Ubuntu 22.04, user `lawpath`, path `/home2/lawpath/app/LawPath`
- **DB:** PostgreSQL 14+, user `lawpath`, db `lawpath`
- **API port:** 3069 (PM2, proxied by Apache)
- **Process manager:** PM2 via `ecosystem.config.cjs`
- **Static files:** Vite builds to `dist/`, rsync'd to `/home2/lawpath/public_html/` by deploy.sh

---

## TECH STACK
| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, custom CSS (no Tailwind) |
| Backend | Node.js, **Express 5** (path-to-regexp v8 — wildcards MUST be named: `/*name`) |
| Database | PostgreSQL 14+ (pgcrypto, citext) |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Email | Nodemailer (platform SMTP) |
| Storage | Google Cloud Storage (GCS) |
| AI | OpenAI API (primary), Gemini, Grok (optional) |
| PDF | PDFKit (server-side) |
| WhatsApp | whatsapp-web.js (QR scan) + Meta Cloud API fallback |
| Billing | Yoco (ZAR — subscription only); custom invoice billing for professional fees |
| PWA | manifest.json + service worker (sw.js) |

---

## WHAT HAS BEEN BUILT

### Tier 1 — Compliance (COMPLETE)
- `src/TrustAccount.tsx` — Section 86 trust ledger, CSV bank import, monthly reconciliation, LPC notice
- `src/TimeRecording.tsx` — Live stopwatch, WIP register, bulk ops, **`onGenerateInvoice` prop added** (passes selected WIP IDs to Billing view), "Invoice selected" bulk button
- `src/FicaKyc.tsx` — Client register, document checklist, risk rating, sanctions screening
- `src/PopiaCompliance.tsx` — ROPA register, DSR tracker (30-day SLA), breach incident log

### Tier 2 — Competitive Differentiators (COMPLETE)
- `src/ConveyancingPipeline.tsx` — 10-stage SA transfer pipeline, SARS 2024/25 transfer duty, GN R234 fees, clearance expiry, Windeed search
- `src/LitigationPipeline.tsx` — Court diary, dies induciae deadlines, strike-off prevention, cost order register
- `src/WhatsAppComms.tsx` — QR scan + Meta Cloud API fallback + simulation
- `src/CipcSearch.tsx` — Company search with /07 suffix guide, import-to-FICA
- `src/DocumentIntelligence.tsx` — AI document analysis, SA risk flags, attorney review watermark
- `src/AccountingSync.tsx` — Sage Pastel / Xero / QuickBooks / CSV export

### Tier 3 — Platform Moats (COMPLETE)
- `src/LegalResearchDB.tsx` — SAFLII corpus, AI search, citation bundles, **GCS-backed full judgment viewer**
- `src/ESignature.tsx` — ECTA AES, canvas/type/upload, OTP, audit trail
- `src/AgentNetwork.tsx` — Estate agent referrals, commission workflow
- `src/PracticeAnalytics.tsx` — Partner P&L, debtor age, fee earner performance

### Production Hardening (COMPLETE)
- `server/pdf.js` — Contracts, trust statements, **SA Tax Invoice PDF (`generateInvoicePdf`)**
- `server/notifications.js` + `server/notification-runner.js` — Transactional emails
- `server/saflii.js` — SAFLII scraper, **uploads HTML+TXT to GCS** (`saflii/{court}/{year}/{num}.html/.txt`)
- `server/whatsapp-session.js` — whatsapp-web.js QR session manager
- `server/verifynow.js` — VerifyNow SA wrapper (11 endpoints, auto-logs credits)
- `src/VerifyNowMonitor.tsx` — Super admin VerifyNow credit monitoring dashboard
- `src/StaffManagement.tsx` — Staff invite/manage/deactivate
- `src/StripeBilling.tsx` — **Yoco subscription billing** (Solo R799/Practice R2,499/Firm R5,999)

### Billing Pipeline (COMPLETE)
Backend + frontend both done. `src/Billing.tsx` (935 lines) — invoice list, create/send/pay/sync workflows, PDF generation, header customization.

---

## DATABASE MIGRATIONS (in order)
| File | Status | Contents |
|---|---|---|
| `001_initial_saas_schema.sql` | ✅ Applied | Core tables |
| `002–005` | ✅ Applied | RAG, profiles, AI, GCS |
| `006_tier1_compliance.sql` | ✅ Applied | Trust, FICA, time_entries, POPIA |
| `007_tier2_operations.sql` | ✅ Applied | Conveyancing, litigation, WhatsApp, CIPC |
| `008_tier3_moats.sql` | ✅ Applied | Legal corpus, e-sig, agent network, analytics |
| `009_production_hardening.sql` | ✅ Applied | Staff, Yoco, notifications |
| `010_saflii_gcs.sql` | ✅ Applied | `gcs_uri`, `gcs_html_uri`, `content_tsv` FTS on corpus |
| `011_verifynow.sql` | ✅ Applied | `verifynow_usage_log` table |
| `012_provider_constraint_verifynow.sql` | ✅ Applied | Extended provider CHECK to include `verifynow` |
| `013_billing_invoices.sql` | ✅ Applied | `invoice_line_items`, `invoice_payments`, expanded `invoices`, FK on `time_entries.invoice_id` |
| `014_clients.sql` | ✅ Applied | Clients CRM table |
| `015_lightstone.sql` | ✅ Applied | Lightstone provider + usage log (see memory(L3).md) |
| `016_invoice_client_email.sql` | ✅ Applied | Invoice client email field (Replit Agent, unreviewed) |
| `017_invoice_header_fields.sql` | ✅ Applied | Invoice header customization (Replit Agent, unreviewed) |
| `018_ai_feature_routing.sql` | ✅ Applied | AI features[] column on providers (L4 session) |

---

## KEY ENVIRONMENT VARIABLES (server `.env`)
```env
PORT=3069
DATABASE_URL=postgresql://lawpath:...@127.0.0.1:5432/lawpath
JWT_EXPIRES_IN=7d
SESSION_SECRET=...
SMTP_HOST=...
SMTP_PORT=587
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
GCS_BUCKET_NAME=lawpath-ai-training
GOOGLE_APPLICATION_CREDENTIALS=/home2/lawpath/secure/gcp-service-account.json
YOCO_SECRET_KEY=sk_live_...
YOCO_WEBHOOK_SECRET=whsec_...
WHATSAPP_API_KEY=EAA...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=lawpath-whatsapp-verify
WINDEED_API_KEY=        # simulation active without
LIGHTSTONE_API_KEY=     # simulation active without
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_SKIP_DOWNLOAD=true
```

VerifyNow API key is set via Super Admin UI (stored in `platform_api_provider_settings`), NOT in .env.

---

## PM2 PROCESSES
```
ID  Name                      Status    Schedule
0   lawpath-api               online    persistent
1   lawpath-saflii-indexer    stopped   cron: Sunday 02:00
2   lawpath-notifications     stopped   cron: daily 07:00
```

---

## DEPLOYMENT WORKFLOW
```bash
cd /home2/lawpath/app/LawPath
PUPPETEER_SKIP_DOWNLOAD=true bash deploy.sh

# If permission denied: chmod +x deploy.sh  OR  use: bash deploy.sh
# If worktree dirty (chmod changed file mode): git stash first
# Verify: curl -s http://127.0.0.1:3069/api/health
```

**Express 5 wildcard route rule** (caused a production outage this session):
- ❌ `/:param(*)` — invalid
- ❌ `/*` — invalid (unnamed)
- ✅ `/*service` — correct named wildcard

---

## SUPER ADMIN ACCOUNT
`npm run create-super-admin` — role `platform_super_admin`, `tenant_id = null`.

---

## NAVIGATION (sidebar order)
Overview · Contracts · Research · Secretary · **Billing** · Conveyancing · Litigation · Trust Account · Time & WIP · FICA/KYC · POPIA · WhatsApp · CIPC Search · Doc Intelligence · Accounting · SA Case Law · e-Signature · Agent Network · Analytics · Staff · **Billing Portal** (Yoco subscription) · Bookings · Portal · AI Training Guide · Settings

---

## BILLING ARCHITECTURE (important distinction)
| System | View key | Component | Purpose |
|---|---|---|---|
| Invoice billing | `"billing"` | `src/Billing.tsx` ✅ (935 lines) | WIP → Invoice → PDF → Email → Payment tracking → Accounting |
| Subscription billing | `"billing-portal"` | `src/StripeBilling.tsx` | Yoco ZAR plans for law firm's own LawPath subscription |

---

## INVOICE API ENDPOINTS (all authMiddleware + tenantId required)
```
GET    /api/invoices                  list (query: ?status=, ?limit=, ?offset=)
POST   /api/invoices                  create from WIP entry IDs (marks entries as Billed)
GET    /api/invoices/:id              get with line items + payments
PATCH  /api/invoices/:id              update status/notes/terms/dueAt/paymentRef
POST   /api/invoices/:id/payments     record payment (auto-recalculates paid_cents + status)
GET    /api/invoices/:id/pdf          generate SA tax invoice PDF (GCS or inline stream)
POST   /api/invoices/:id/send         email invoice as PDF attachment
POST   /api/invoices/:id/accounting   mark synced to accounting
```

Invoice number format: `INV-{YYYY}-{0001}` (sequential per tenant per year).

---

## VERIFYNOW SA
- API wrapper: `server/verifynow.js`
- 11 services: `verify`, `verify-document`, `face-match`, `aml-pep`, `consumer-trace`, `consumer-trace-lite`, `cipc/company`, `cipc/director`, `bank-account-verification`, `number-plate`, `vin-decode`
- Proxy route: `POST /api/verifynow/*service`
- Monitoring: `GET /api/admin/verifynow/usage` (super admin only)
- No balance endpoint on VerifyNow — we track credits ourselves in `verifynow_usage_log`

---

## CSS / DESIGN SYSTEM
Fonts: **Lora** (Google Fonts, serif) for h1/h2/brand + **Inter** for UI.

Key variables:
```
--ink: #0d1b17          --muted: #5c7569        --line: #dce4de
--paper: #f3f5f2        --panel: #ffffff         --surface: #f7f9f7
--green: #177a5f        --green-dark: #091410    --green-light: rgba(23,122,95,0.10)
--gold: #b8870c         --gold-bg: rgba(184,135,12,0.10)
--blue: #28579a         --blue-bg: rgba(40,87,154,0.09)
--rose: #a12e43         --rose-bg: rgba(161,46,67,0.09)
--shadow/sm/lg/xl       --radius/sm/lg/xl
--font-sans/serif/mono
```

Metric cards: odd children dark (`#0c1e18 → #162d22`) with gold numbers.
Sidebar: gradient `#060d0a → #0e1a14`, active nav = green glow pill.
Primary button: `linear-gradient(160deg, #177a5f, #0f6b52)` + glow on hover.

---

## 🔴 OUTSTANDING — NEXT SESSION

### ~~1. Billing.tsx~~ — ✅ DONE
`src/Billing.tsx` (935 lines) is complete. Written by Replit Agent, TS errors fixed in L3 session. `npx tsc --noEmit` passes clean.

### ~~2. Fix TypeScript errors~~ — ✅ DONE
All resolved. TypeScript compiles with zero errors.

### 3. Unreviewed Replit Agent Changes
- `server/mailer.js` and `server/pdf.js` — modified by Replit Agent commit `416d85c`, not yet diff-reviewed
- Migrations 016 (`invoice_client_email`) and 017 (`invoice_header_fields`) — Replit Agent origin, applied but not reviewed line-by-line

### 4. Infrastructure / API Keys
- SAFLII first run on server: `nohup node server/saflii.js --limit 50 --years 5 > logs/saflii-first-run.log 2>&1 &`
- VerifyNow API key: add in Super Admin → Settings → API Keys
- Yoco live keys: add `sk_live_` + `whsec_` in .env
- Windeed/Lightstone: simulation active; needs commercial API subscriptions
- Bake `PUPPETEER_SKIP_DOWNLOAD=true` permanently into deploy.sh or .env
- `stage` user PM2: run `pm2 resurrect` as stage user on same server

---

## CODEBASE STRUCTURE (key files)
```
server/
  index.js              — Express API (4,255 lines, 122 endpoints)
  pdf.js                — PDFKit: contracts + trust statements + SA tax invoices (471 lines)
  saflii.js             — Laws.Africa KB indexer + GCS uploader (555 lines)
  lightstone.js         — Lightstone Property API wrapper (316 lines)
  whatsapp-session.js   — WhatsApp QR + Meta Cloud API (271 lines)
  notifications.js      — Transactional email triggers (187 lines)
  verifynow.js          — VerifyNow SA API wrapper (160 lines)
  gcs.js                — Google Cloud Storage signed URLs (157 lines)
  ocr.js                — Google Vision API batch PDF OCR (108 lines)
  seed-corpus.js        — 504 curated SA case law seeds (86 lines)
  mailer.js, auth.js, db.js, notification-runner.js

src/
  App.tsx               — Main shell + router (3,530 lines)
  types.ts              — 66 exported TS types (810 lines)
  api.ts                — 97 API client functions (782 lines)
  styles.css            — Design system (5,709 lines, Lora+Inter, dark/light)
  Billing.tsx           — ✅ Complete (935 lines)
  23 total .tsx components

db/migrations/
  001–018_*.sql (all applied)
```

---

## IMPORTANT PATTERNS
- **Multi-tenant:** every table has `tenant_id`. All queries: `WHERE tenant_id = $1`.
- **Super admin:** `tenant_id = null`. Platform-level controls only.
- **API fallback:** frontend falls back to local state if backend unreachable.
- **Express 5:** wildcard params MUST be named (`/*service`), never plain `/*`.
- **Git:** HTTPS remote, Windows Credential Manager handles auth.
- **PUPPETEER_SKIP_DOWNLOAD=true** required during `npm ci` on server.
- **Invoice numbers:** `INV-{YYYY}-{0001}` sequential per tenant per year.
- **VAT:** 15% SA standard rate. `vat_amount_cents = amount_cents * 0.15`.
- **Money:** always in ZAR cents (bigint in DB). Display: `R X,XXX.XX`.
- **Verify before pushing:** always run `npx tsc --noEmit` before committing.
