# LawPath SA — Claude Session Memory
> Load this file at the start of a new chat to restore full context.
> Last updated: 2026-07-16

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
| `019–023` | ✅ Applied | ai_usage_log, FFC verification, SearchWorks, pricing config, corpus title repair |
| `024_prescription_clock.sql` | ✅ Applied | Prescription Act fields on `litigation_matters` |
| `025_dots_polling.sql` | ✅ Applied | DOTS barcode/status/draft columns on `conveyancing_matters` |
| `026_matter_spine.sql` | ✅ Applied | `matter_id` on domain+leaf tables, NOT VALID FKs, `matter_backfill_log` |
| `027_acting_for.sql` | ⏳ **PENDING DEPLOY** | `acting_for` on litigation + conveyancing matters |
| `028_approval_queue.sql` | ⏳ **PENDING DEPLOY** | `approval_requests` table |
| `029_matter_diary.sql` | ⏳ **PENDING DEPLOY** | `matter_diary_entries` — a diary for every matter |
| `030_document_filing.sql` | ⏳ **PENDING DEPLOY** | Document filing metadata (`matter_ref`, `filed_at`, `filing_source`) |
| `031_corpus_frbr_identity.sql` | ⏳ **PENDING DEPLOY** | `frbr_uri` on corpus docs + unique index (dedupe key) |
| `032_corpus_quarantine.sql` | ⏳ **PENDING DEPLOY** | Quarantine tables for the 8,955 unnameable corpus rows |
| `033_laws_africa_usage_log.sql` | ⏳ **PENDING DEPLOY** | Shared daily meter for the Laws.Africa API budget |

All 33 verified to apply cleanly in order against a fresh Postgres 16, and 024–033
are idempotent (safe to re-run).

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
- SAFLII manual run: `node server/saflii.js --queries 95 --top-k 20` (95 queries fits within 100 calls/day Laws.Africa budget)
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
- **DATE columns:** `server/db.js` sets `types.setTypeParser(1082)` so Postgres
  `DATE` arrives as a `'YYYY-MM-DD'` **string**, not a JS Date. Mappers rely on
  this. Do not remove it — see the date bug note below.

---

# SESSION L5 — 2026-07-15 (matter spine, proactive layer, hallucination fix)

## What shipped (all pushed to `main`, HEAD `99b1f6e`)

| Commit | What |
|---|---|
| `ae3aa3c` | **Prescription clock** — Prescription Act 68/1969 on litigation matters; Today card (critical <90d) |
| `c5ac919` | **DOTS auto-polling** — daily sweep of lodged matters; drafts (never sends) client update |
| `691dbf2` | **AI end-of-day time capture** — `GET /api/time/suggest?date=`; attorney approves every line |
| `089a734` | Matter-spine design doc → `docs/matter-spine-plan.md` |
| `b82be48` | **Fix:** case-law corpus stats blank for super admins (missing bypass on `/research-db/corpus`) |
| `a32ec72` | **Fix:** corpus re-index restricted to platform super admins |
| `f97ea39` | Matter spine Phase A — migration 026 (additive, NOT VALID FKs) |
| `f798da4` | Matter spine Phase B — `server/matter-backfill.js` (manual, dry-run first) |
| `c2d393c` | **`acting_for`** — which side the firm represents (user's catch; see below) |
| `5bed8c0` | Backfill resolves client from `acting_for` instead of guessing |
| `791be77` | Spine populates **at creation time** (no legacy data to backfill) |
| `db6fe43` | **Matter File view** — one page per matter, 6 tabs |
| `dfe5ee8` | **Conflict check** — professional duty; uses `acting_for` for severity |
| `0e39bff` | **Approval queue** — one queue; AI drafts land here marked `origin:'ai'` |
| `ee4c6f8` | **Matter diary** — every matter type, not just litigation |
| `2c17826` | **Document auto-filing** — party matching; only files on unambiguous match |
| `c4b622f` | **Fix: 3 real bugs found by running against a real DB** (see below) |
| `a7f0469` | **Deadline engine** — SA court-day math, Easter computus, dies non |
| `99b1f6e` | **Hallucination fix** — ground the assistant in the corpus + verify every citation |

## Three decisions the user made that shaped the work

1. **"A practice may act for either the buyer or seller, plaintiff or defendant —
   can we make it an option a lawyer selects?"** Correct and load-bearing. Nothing
   recorded which side the firm was on, so the spine would have written the
   OPPOSING party in as the client. `acting_for` (027) now drives
   `matters.client_name`/`client_role` — and it is what lets the conflict check
   tell "we act for them" from "we act against them". Never guess this.
2. **"I have docker installed"** → a local Postgres found 3 real bugs in 20
   minutes that tsc/`node --check` cannot see. **Always test against a real DB.**
3. **Lawyer feedback** (below) → redirected priorities from features to accuracy.

## Bugs found by running against a real database (`c4b622f`)

- **DATE columns mangled, 18 call sites, pre-existing.** node-pg parses `DATE`
  into a JS Date at local midnight, so `String(row.d).slice(0,10)` gave
  `"Fri Sep 01"`. Worse: local-midnight `.toISOString()` **shifts the day back**
  in SAST — a prescription date of `2026-09-01` serialised as `2026-08-31`.
  Fixed at source in `db.js`.
- **`GET /api/approvals` returned 500** — users column is `full_name`, not `name`.
  The whole Approvals page was dead on arrival.
- **`/api/time/suggest` silently lost the fee earner's name** — same `users.name`
  mistake, swallowed by its own `.catch()`. A defensive catch hid a real bug.

## Local dev database (set up this session — reuse it)

```bash
docker run -d --name lawpath-dev-db -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_USER=lawpath -e POSTGRES_DB=lawpath_dev -p 55432:5432 postgres:16
# ports 5432/5433 are taken by the user's other projects — 55432 is ours
for f in db/migrations/*.sql; do
  docker exec -i lawpath-dev-db psql -U lawpath -d lawpath_dev -v ON_ERROR_STOP=1 -q < "$f"; done
```
`.env` (gitignored, local only): `DATABASE_URL=postgres://lawpath:devpass@localhost:55432/lawpath_dev`,
`DATABASE_SSL=false`, `SESSION_SECRET=dev-only…`, `PORT=3070` (prod is 3069).
Start: `node server/index.js`. Kill on Windows: find PID via
`netstat -ano | grep :3070` then `taskkill //PID <pid> //F` (`pkill` does not work).

## LAWYER FEEDBACK — 2026-07-15 (a practising attorney, ~20 min test)

Delict/tort practitioner. Scenario: client instructed FNB to pay a supplier; the
invoice was intercepted and altered with fraudulent bank details; payment went to
the fraudster. He wanted case law on the bank's duty.

**He stopped using the tool at the first fabricated case.** "I lost a little bit
of faith." Verbatim priorities:

1. **Case-law accuracy (existential).** The assistant invented cases or welded
   real names onto unrelated facts. He pasted a citation back in and got a
   summary of something else. → **Fixed in `99b1f6e`** (root cause: the chat
   never touched the corpus). **Not yet validated by him.**
2. **"Draft Opinion" button** — he wants research → draft opinion/letter in one
   step, then he reads the real cases and edits. He hunted the tabs for it.
3. **Court coverage:** SCA + High Court are what he cares about; Labour Court
   sometimes; ConCourt only for constitutional issues.
4. **Research history missing** — he could not find previous sessions. The data
   IS in `ai_conversations`/`ai_messages`; there is simply no UI to browse it.
5. **UI too dark** — "I had to peer closer to my screen." He called the platform
   beautiful but hard to read.

His workflow, worth designing around: **research → draft opinion → go read the
actual cases on SAFLII/LexisNexis → edit the opinion.** He will always read the
case himself. The tool's job is to get him to a good draft with real citations —
not to be trusted blindly.

---

# SESSION L6 — 2026-07-16 (corpus forensics, live research, the attorney's list cleared)

## What shipped (all pushed to `main`, HEAD `9166be9`)

| Commit | What |
|---|---|
| `1a131aa` | **Indexer identity fix** — read `metadata.work_frbr_uri` etc.; identity parsed from the FRBR URI, never from prose. Migration 031 (`frbr_uri` + unique index) |
| `87ee8b1` | **Corpus quarantine** — move (never delete) the ~8,955 unnameable rows; restore replays exactly. Migration 032 |
| `3bca24d` | **Seed upgrade-in-place** — `corpus-frbr-backfill.js` gives the 504 seeds their FRBR URI; indexer upserts richer text over thin rows |
| `b69636d` | **Live research** — `live-research.js`: query the KB with the attorney's own words at question time, cache-through, shared metered budget (033), exact citation lookup via `work_frbr_uri` filter |
| `f8abc83` | Chat grounding merges live + local; ONE API call per message; degrades to local-only |
| `8991b38` | **[4]** `/api/research-db/search`: citation-shaped query → exact lookup or honest not-found, never fuzzy |
| `b259f31` | **[2] Draft Opinion/Letter** — one step from conversation to approval queue; verified sources in, draft re-verified out, SCHEDULE OF AUTHORITIES appended to the document itself |
| `0baba69` | **[3] Research history** — list/reopen/continue; citations RE-verified against today's corpus on reopen |
| `731f939` | **[5] Contrast** — measured the rendered app: ALL dark-theme AA failures were `--muted #64748b`; now `#94a3b8` (7.1:1). Full-app audit: 0 failures, both themes |
| `c4c32cb` | Approvals renders `payload.body` — draft endpoint had stored `content` (doc was invisible to its approver); 16-row reading pane |
| `9166be9` | **Downloads** — PDF (existing letterhead endpoint) + Word (.doc built client-side, no dependency) on any approval carrying a document body |

## THE BIG FINDING — the corpus was manufacturing the hallucinations

The prod corpus held 9,460 rows; **8,955 had no citation, no URL, no reliable
title/court/year**. Root cause: the Laws.Africa AI-KB returns identity under
`metadata.*` but `saflii.js` read `item.public_url / item.url / item.title` at
the TOP level — all `undefined` on every call ever made. Every field needed
arrived on every response and was discarded; identity was then regex-guessed
from prose, which welds the FIRST CITED CASE's name onto the row (judgments
cite judgments). Retrieval preferred those rows (%SCA%/%High Court%), the model
was told "cite only from SOURCES" and handed sources it could not cite, so it
fell back on recall → invented citations. `99b1f6e` was necessary, not
sufficient. Also: dedupe sat inside `if (publicUrl)` → never ran → 81%
duplicates; the `kbs[0]` fallback pointed at **Ghana**; legislation was filed
as judgments; every `decision_date` was a fabricated Jan 1.

**Laws.Africa facts (verified in their docs + by probing prod):** full judgment
text is not sold at ANY tier (KBs return summaries+metadata; the R42k/mo
Content API is legislation-only). SAFLII and lawlibrary.org.za are Cloudflare-
blocked to non-browsers — do not try to defeat that. Sandbox = 100 calls/day;
Build R4,200/mo = 3,000/day of the SAME summaries — upgrade only when real
usage saturates. Storing retrieved data: verbally approved by their technical
manager (user's call at project start). The `work_frbr_uri` filter enables
exact citation lookup. Design accordingly: right case, correct name, working
link — the attorney reads the judgment himself.

## Operational facts learned the hard way

- **Prod DB access:** no SSH for Claude. Port 22 got the shared office IP
  fail2ban'd (my fault — serial auth attempts); port 2222 is ProFTPD SFTP, not
  a shell. Workflow that works: write one bash/psql block, the user pastes it
  into his `lawpath@liz` session and pastes back the output.
- **Local verification stack:** dev Postgres (docker `lawpath-dev-db`, port
  55432 — `docker start lawpath-dev-db` if down); API on 3001 via
  `.claude/launch.json` (uncommitted); vite on 5000 proxying /api→3001. Test
  login `history-test@example.co.za` / `dev-test-passw0rd` (dev DB only).
  **Puppeteer is available** (whatsapp-web.js dep, chromium cached) — used for
  real-UI tests, WCAG audits (`contrast-audit*.js` in the session scratchpad),
  and CDP download capture. The in-app browser pane caches modules too hard for
  dev-server verification; use puppeteer.
- **House conventions:** approval drafts render from `payload.body` (NOT
  `content`); `content_tsv` is a GENERATED column — never in an explicit
  column list (quarantine restore broke on this; filter
  `is_generated = 'NEVER'`); citation ↔ FRBR URI is a pure transliteration
  (`[1995] ZACC 3` ↔ `/akn/za/judgment/zacc/1995/3`).

## DEPLOY RUNBOOK — pending, order matters

```bash
cd /home2/lawpath/app/LawPath
PUPPETEER_SKIP_DOWNLOAD=true bash deploy.sh        # migrations 027–033 + app
node server/corpus-quarantine.js                   # dry run — read it
node server/corpus-quarantine.js --commit          # 8,955 rows -> quarantine
node server/corpus-frbr-backfill.js                # dry run — expect 503/504
node server/corpus-frbr-backfill.js --commit
pm2 start lawpath-saflii-indexer && pm2 save       # only AFTER the purge
```
Corpus drops 9,460 → 504. That is not a regression: 504 verifiable rows beat
9,460 anonymous ones, live research self-feeds the corpus from real questions,
and the seeds upgrade in place as the daily run reaches them. Rollback:
`node server/corpus-quarantine.js --list` then `--restore <run_id>`.

---

# HANDOFF PROMPT FOR THE NEXT SESSION

> Continue LawPath SA. Read `CLAUDE_MEMORY.md` (this file) fully first —
> especially SESSION L6 — plus the memory files listed at the top.
>
> **State:** `main` @ `9166be9`, everything pushed. Migrations **027–033 pending
> deploy** (I run deploys: `PUPPETEER_SKIP_DOWNLOAD=true bash deploy.sh`, then
> the corpus runbook in L6 — quarantine, frbr backfill, restart indexer).
> The attorney's original list [1]–[5] is COMPLETE. Dev stack per L6
> "Operational facts": dev Postgres on 55432 (docker), API 3001, vite 5000,
> puppeteer for real-UI verification. **Never claim anything works without
> exercising it against the real dev DB — and for UI, the real rendered app.**
> This session's worst bugs (identity discarded at the wrong JSON nesting level;
> a generated column breaking restore; a payload field the UI never rendered)
> were all invisible to tsc.
>
> **Guardrails (unchanged):** additive migrations only, never edit an applied
> one (next number is **034**); `npx tsc --noEmit` clean before every push; one
> feature per commit, push, stop and report; I run all server/deploy commands;
> no new npm deps without asking; nothing AI-generated reaches a client or
> moves money without attorney sign-off; no SSH to prod — write me blocks to
> paste.
>
> **FIRST: nothing is deployed.** Walk me through the L6 runbook and verify
> with me (corpus counts before/after, a live research question, a citation
> paste, a drafted opinion downloaded). Then I want the attorney's second 20
> minutes — his reaction to verified-citation research with real SCA/High Court
> authority is worth more than any item below and should reorder this list.
>
> **WORK QUEUE — small-practice-attorney lens (L6 session's product review):
> the organs exist; build the connective tissue for the three workflows a
> practice runs every day — new client in, correspondence, money out.**
>
> **[A] Intake-to-mandate flow.** The highest-stakes daily moment, currently
> five separate screens: conflict check → client record → FICA → engagement
> letter → trust deposit request. Everything exists — `ConflictCheck` takes
> `initialClient/initialOpposing/compact` props built for this; contracts + PDF
> + e-signature + approval queue are all live. One guided flow that ends with
> an engagement letter in the approval queue and files the matter to the spine.
>
> **[B] Wire the approval queue into the acts it governs.** It records
> decisions but gates nothing. Invoice-send and trust payments should check for
> an approval as a precondition, then mark it `actioned`. For trust money the
> current state is a real risk, not polish: it LOOKS like working sign-off.
>
> **[C] Client auto-updates on stage transitions.** A conveyancing/litigation
> stage change drafts a WhatsApp/email into the approval queue
> (`kind:'client_message'`, `origin:'ai'`) — the DOTS poller already models
> this pattern. Kills the most repetitive interruption in a small practice.
>
> **[D] Email-per-matter.** The biggest missing organ: 80% of a real file is
> correspondence, so the matter file is hollow without it. Per-matter
> forwarding address, inbound mail filed to the spine, thread summaries later.
> Bigger build — needs a design conversation with me first (mail infra).
>
> **[E] Documents on the matter file.** Per-matter upload/store/download (GCS
> plumbing exists for analyses). An approved drafted opinion should file itself
> here — closing the loop the L6 downloads feature started.
>
> **[F] Money truths:** disbursements on matters (sheriff/counsel/deeds fees →
> invoices — small firms leak money here); mandate-cap warning when WIP
> approaches the client's fee estimate.
>
> **[G] Trust/compliance registers:** undertakings register (a missed
> undertaking is a conduct matter — conveyancers give them daily);
> practitioner verification of the `server/court-rules.js` catalogue (still
> model recall, still flagged, arithmetic itself is tested).
>
> **Do NOT reach for new AI features** — the assistant is now
> trustworthy-by-architecture (grounded, live-retrieving, verify-in/verify-out);
> the gap is practice plumbing.
>
> **Open decisions that are mine (the user's), not yours:** default theme for
> new accounts (dark passes AA now, but light may serve his re-test better);
> emailing Laws.Africa for written confirmation of the storage OK; Build-plan
> upgrade only when usage saturates 100 calls/day.
>
> **Parked small items:** matter picker on the draft buttons; "file to matter"
> on approved documents (folds into [E]); corpus coverage panel (counts by
> court/year from `legal_corpus_documents` — cheap now that identity is real).
