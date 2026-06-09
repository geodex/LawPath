# LawPath SA — Claude Session Memory
> Load this file at the start of a new chat to restore full context.
> Last updated: 2026-06-09

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

### Billing Pipeline (BACKEND COMPLETE, FRONTEND INCOMPLETE)
All backend done. **`src/Billing.tsx` must be written in the next session** (see Outstanding).

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
| Invoice billing | `"billing"` | `src/Billing.tsx` ← **NOT YET WRITTEN** | WIP → Invoice → PDF → Email → Payment tracking → Accounting |
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

## 🔴 OUTSTANDING — START HERE IN NEXT SESSION

### 1. Write `src/Billing.tsx` (TOP PRIORITY)

All backend is done. This component just needs to be written.

**Props interface:**
```typescript
interface Props {
  entries: TimeEntry[];
  setEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
  pendingWipIds: string[];        // from TimeRecording "Generate invoice" button
  onClearPendingWip: () => void;
  tenantProfile: TenantProfile;
  log: (msg: string) => void;
  showToast: (type: "success"|"error"|"info", title: string, msg: string) => void;
}
export function Billing({...}: Props) {...}
```

**API imports from `./api`:**
`createInvoice`, `getInvoice`, `getInvoicePdfUrl`, `getInvoices`, `recordInvoicePayment`, `sendInvoiceByEmail`, `syncInvoiceToAccounting`, `updateInvoice`

**Features:**
1. On mount: `getInvoices()` → local state
2. When `pendingWipIds.length > 0`: auto-open create modal pre-populated, call `onClearPendingWip()`
3. **Metrics** (4 cards): Outstanding balance, Due this month, Overdue count, Collected YTD
4. **Filter tabs**: All / Draft / Sent / Part-paid / Overdue / Paid / Void
5. **Invoice table**: #, Client, Matter, Issued, Due, Total, Paid, Balance, Status badge, Actions (expand/PDF/email/void)
6. **Inline detail** (row expanded): line items table, payments list, record payment form, accounting sync button
7. **Create Invoice modal**: select WIP entries, fill client/matter/dueDate/notes, preview totals, submit
8. **Send Email modal**: recipient email/name/message

**Money format:** `` `R ${(cents/100).toLocaleString("en-ZA",{minimumFractionDigits:2})}` ``

**IMPORTANT**: Write in multiple smaller chunks using Write+Edit to avoid the 8000 output token limit that keeps hitting when agents try to generate a large file in one shot. Strategy: Write skeleton first (~150 lines), then Edit to add sections.

### 2. Fix TypeScript errors (after writing Billing.tsx)

**`src/data.ts`** (~line 100): `invoiceSeed` array uses old Invoice shape. Change to:
```typescript
export const invoiceSeed: Invoice[] = [];
```

**`src/App.tsx`** (~line 205): Change `useState<Invoice[]>(invoiceSeed)` to `useState<Invoice[]>([])`.

**`src/App.tsx`** (~line 1177): Find old reference to `invoice.amount` / `invoice.paid` — update to `invoice.amountCents` / `invoice.paidCents`.

**`src/App.tsx`** (~line 2571): Delete the entire `function LegacyBilling(...)` block (the old billing component, now replaced by `src/Billing.tsx`).

### 3. Commit and deploy
```bash
git add -A
git commit -m "Complete billing pipeline — Billing.tsx, fix TS errors"
git push origin main
# Server:
PUPPETEER_SKIP_DOWNLOAD=true bash deploy.sh
```

### 4. Remaining from earlier
- SAFLII first run on server: `nohup node server/saflii.js --limit 50 --years 5 > logs/saflii-first-run.log 2>&1 &`
- VerifyNow API key: add in Super Admin → Settings → API Keys
- Yoco live keys: add `sk_live_` + `whsec_` in .env
- Windeed/Lightstone: simulation active; needs commercial API for live data
- `stage` user PM2: run `pm2 resurrect` as stage user on same server

---

## CODEBASE STRUCTURE (key files)
```
server/
  index.js          — Express API (~3200+ lines)
  pdf.js            — PDFKit: contracts + trust statements + SA tax invoices
  notifications.js  — Transactional email triggers
  whatsapp-session.js
  saflii.js         — SAFLII scraper + GCS uploader
  verifynow.js      — VerifyNow SA API wrapper
  mailer.js, auth.js, db.js, gcs.js

src/
  App.tsx           — Main shell (~3300+ lines)
  types.ts          — All TS types (Invoice now has full billing shape)
  api.ts            — API client (invoice + VerifyNow functions added)
  styles.css        — ~4237 lines, Lora+Inter, dark mode
  Billing.tsx       ← NOT YET WRITTEN
  VerifyNowMonitor.tsx
  [all other components]

db/migrations/
  001–013_*.sql
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
