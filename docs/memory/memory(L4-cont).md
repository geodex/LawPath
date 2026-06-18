---
name: memory-l4-cont
description: L4 continuation — codebase metrics, corrected outstanding items, Billing.tsx status, and current state as of 2026-06-18
metadata:
  type: project
---

# LawPath SA — L4 Continuation (2026-06-18)

This document corrects outdated claims in CLAUDE_MEMORY.md and captures codebase metrics not covered by L4.

## Corrections to CLAUDE_MEMORY.md

### Billing.tsx — COMPLETE (not "NOT YET WRITTEN")

`src/Billing.tsx` exists (935 lines), fully functional. It was created by the Replit Agent commit (`416d85c`, see [[memory-l3]]) and had its TypeScript errors fixed in commit `e6911d9` (React 19 ref typing + ViewKey import). The CLAUDE_MEMORY.md §OUTSTANDING item "Write src/Billing.tsx (TOP PRIORITY)" is **done**.

**Features confirmed present in Billing.tsx:**
- Invoice list with filter tabs (All/Draft/Sent/Part-paid/Overdue/Paid/Void)
- Inline detail expansion (line items, payments list)
- Create invoice modal with WIP entry selection
- Record payment form (EFT/Cash/Card/Cheque/Trust transfer/Other)
- PDF generation + download
- Email send modal
- Accounting sync button
- Invoice header field customization (address, phone, website, VAT number, LPC registration)
- `pendingWipIds` auto-populate from TimeRecording
- ZAR cents formatting: `R X,XXX.XX`

### TypeScript — Compiles Clean

`npx tsc --noEmit` passes with zero errors. The §OUTSTANDING items about fixing `data.ts` invoiceSeed, `App.tsx` invoice.amount references, and deleting `LegacyBilling()` have either been resolved or were never needed (the Replit Agent commit addressed these).

### DB Migrations — Through 018

CLAUDE_MEMORY.md lists through 013. Current state: **18 migrations** (001–018), all applied. Migrations 014–018:

| Migration | Contents | Source |
|-----------|----------|--------|
| 014_clients.sql | Clients CRM table | Claude session |
| 015_lightstone.sql | Lightstone provider + usage log | Claude session (see [[memory-l3]]) |
| 016_invoice_client_email.sql | Invoice client email field | Replit Agent (unreviewed) |
| 017_invoice_header_fields.sql | Invoice header customization | Replit Agent (unreviewed) |
| 018_ai_feature_routing.sql | AI features[] column on providers | Claude session (L4) |

**Still unreviewed:** 016 and 017 (Replit Agent origin). No bugs reported from them yet.

## Codebase Metrics (2026-06-18)

### Size

| Metric | Count |
|--------|-------|
| Frontend components (*.tsx) | 23 files |
| Server modules (server/*.js) | 14 files |
| API endpoints (server/index.js) | 122 routes |
| TypeScript types (src/types.ts) | 66 exported types |
| API client functions (src/api.ts) | 97 exported functions |
| Total lines: server/index.js | 4,255 |
| Total lines: src/App.tsx | 3,530 |
| Total lines: src/styles.css | 5,709 |
| Total lines: src/types.ts | 810 |
| Total lines: src/api.ts | 782 |
| DB migrations | 18 files |
| Dependencies (prod) | 18 packages |
| Dependencies (dev) | 5 packages |

### Key Dependency Versions

| Package | Version |
|---------|---------|
| React | 19.2.7 |
| Express | 5.2.1 |
| TypeScript | 6.0.3 |
| Vite | 8.0.16 |

### Largest Frontend Components

| Component | Lines | Module |
|-----------|-------|--------|
| App.tsx | 3,530 | Shell/router |
| ConveyancingPipeline.tsx | 969 | Pipeline |
| Billing.tsx | 935 | Financial |
| Clients.tsx | 814 | CRM |
| PopiaCompliance.tsx | 780 | Compliance |
| WhatsAppComms.tsx | 720 | Comms |
| TrustAccount.tsx | 611 | Financial |
| TimeRecording.tsx | 583 | Financial |
| StaffManagement.tsx | 549 | Admin |
| PracticeAnalytics.tsx | 519 | Analytics |

## Remaining Outstanding Items (corrected)

### Still Open

1. **Review server/mailer.js + server/pdf.js** — from Replit Agent commit `416d85c`, not yet reviewed (see [[memory-l3]] §2)
2. **Review migrations 016 + 017** — Replit Agent origin, not yet reviewed line-by-line
3. **Lightstone Azure APIM 500** — Lightstone-side subscription config issue, not a code bug
4. **PUPPETEER_SKIP_DOWNLOAD=true** — still manual per-deploy, not baked into deploy.sh/.env
5. **Yoco live keys** — `sk_live_` + `whsec_` not yet in server .env
6. **SAFLII first run** — `nohup node server/saflii.js --limit 50 --years 5` not yet executed on server
7. **VerifyNow API key** — needs to be set in Super Admin → Settings → API Keys
8. **Windeed/Lightstone** — simulation mode; needs commercial API subscriptions for live data

### Resolved (remove from CLAUDE_MEMORY.md next update)

1. ~~Write src/Billing.tsx~~ — done (Replit Agent + L3 TS fixes)
2. ~~Fix TypeScript errors~~ — `tsc --noEmit` passes clean
3. ~~Delete LegacyBilling()~~ — no longer present or not needed
4. ~~Fix data.ts invoiceSeed~~ — resolved

## Architecture Notes Not in L4

### AI Agent Types (7 chat agents)

Each agent has a tailored system prompt with tenant-scoped context. Agents: `general`, `drafting`, `research`, `secretary`, `billing`, `portal`, `settings`. The AI chat routes through `getAiForFeature("ai-chat")` → `callAiProvider()`.

### Laws.Africa Indexer (server/saflii.js)

- Daily cron (PM2 ID 1, Sunday 02:00)
- Uses Laws.Africa Knowledge Base API (not SAFLII scraping despite the filename)
- Targets `judgments-za` and `legislation-za` KBs
- Sandbox plan: ~95 queries/day budget
- 504 curated seed cases pre-loaded via `server/seed-corpus.js`
- Full judgment text stored in GCS (`saflii/{court}/{year}/{num}.html/.txt`)
- `legal_corpus_documents` table with `content_tsv` GIN index for full-text search

### Notification System

- `server/notifications.js` — queue/dispatch logic for transactional emails
- `server/notification-runner.js` — PM2 cron runner (ID 2, daily 07:00, currently stopped)
- Uses `server/mailer.js` (Nodemailer SMTP) for delivery

### Google Cloud Storage Layout

- Bucket: `lawpath-ai-training`
- Paths: `saflii/{court}/{year}/{num}.html` (judgments), `saflii/{court}/{year}/{num}.txt` (plain text)
- Service account: `/home2/lawpath/secure/gcp-service-account.json`
- Used by: document intelligence uploads, legal corpus storage, invoice PDFs
