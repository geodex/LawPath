---
name: memory-l4
description: Comprehensive LawPath app architecture, all features, integrations, AI routing, and recent work as of 2026-06-18
metadata:
  type: project
---

# LawPath SA — Full Platform Summary (L4, 2026-06-18)

## Stack & Deployment

- **Frontend**: React 18 + TypeScript + Vite, single `App.tsx` router, `styles.css` for all styling
- **Backend**: Express.js (`server/index.js`, ~3500 lines), PostgreSQL via `pg` pool
- **Deploy**: Ubuntu server, `deploy.sh` handles git pull → npm ci → vite build → rsync dist/ → run migrations → pm2 reload
- **PM2 process name**: `lawpath-api`
- **Migrations**: `db/migrations/*.sql` with `schema_migrations` tracking table (checksum-based, auto-run by deploy.sh)
- **Auth**: JWT (access + refresh), roles: platform_super_admin, tenant_admin, attorney, candidate_attorney, legal_secretary, billing_admin, client_portal_user
- **Multi-tenant**: All tables have `tenant_id` FK, enforced at query level

## AI Provider System (built this session)

- **Central resolver**: `getAiForFeature(featureName)` in server/index.js
- **Feature routing**: Each AI provider (gemini, openai, grok) has a `features` text[] column in `platform_api_provider_settings`
- **Three routable features**: `ai-chat`, `document-intelligence`, `research-summaries`
- **Unified dispatcher**: `callAiProvider(provider, apiKey, model, systemPrompt, userPrompt)` routes to `callGeminiApi`, `callOpenAiApi`, or `callGrokApi`
- **Settings UI**: Super admin Settings page has feature toggle chips on each provider card
- **Fallback order**: gemini → openai → grok (tries first provider with a key if no feature assignment exists)
- **Current model IDs**: gemini-3.5-flash (default), gemini-3.1-pro-preview, gemini-2.5-pro, gpt-5.5/5.4/5.4-mini, grok-4.3
- **DB table**: `platform_api_provider_settings` — provider, api_key_secret_ref, default_model, base_currency, active, features[]
- **Migration 018**: Added features column + fixed stale model names

## All Features by Module

### Core Workspace
- **Dashboard** (App.tsx) — metrics cards, activity feed, quick actions
- **Matters** — generic matter management (intake, status, risk)
- **Contracts** — draft management, version tracking
- **Staff Management** (StaffManagement.tsx) — team members, roles, invitations
- **Clients CRM** (Clients.tsx) — full client profiles, FICA status, contact details, risk ratings, conflict checking, billing defaults, WhatsApp opt-in

### Billing & Financial
- **Time Recording** (TimeRecording.tsx) — WIP tracking, activity types, fee earner rates, 15% VAT, status workflow
- **Billing/Invoices** (Billing.tsx) — invoice creation from time entries, line items, PDF generation (PDFKit), email delivery, payment recording (partial/full)
- **Trust Account** (TrustAccount.tsx) — Section 86 trust ledger, receipts/payments per client matter, monthly reconciliation, LPC audit pack
- **Subscription Billing** (StripeBilling.tsx) — Yoco ZAR gateway, plan management
- **Accounting Sync** (AccountingSync.tsx) — Xero/QuickBooks/Wave integration, CSV fallback

### Compliance
- **FICA/KYC** (FicaKyc.tsx) — risk-based onboarding (Low/Medium/High/PEP), document capture, sanctions screening, expiry tracking
- **POPIA** (PopiaCompliance.tsx) — processing register, Data Subject Requests (Access/Correction/Erasure/Objection), breach incident log, retention schedules
- **VerifyNow Monitor** (VerifyNowMonitor.tsx) — credit usage dashboard, per-service call logs

### Pipelines
- **Conveyancing** (ConveyancingPipeline.tsx) — transfer/bond/sectional title, 7-stage workflow (Intake → Registration), rates & levy clearance tracking, trust deposit integration
- **Litigation** (LitigationPipeline.tsx) — opposed/unopposed motion, trial, urgent, Rule 43, review, appeal; dies induciae calculation; cost orders; deadline tracking

### AI & Research
- **AI Chat** — 7 agent types (general, drafting, research, secretary, billing, portal, settings) with tenant-scoped context
- **Document Intelligence** (DocumentIntelligence.tsx) — upload PDF/DOCX/TXT, text extraction (pdf-parse + mammoth), OCR fallback (Google Cloud Vision for scanned/sparse PDFs), AI analysis extracts parties, dates, obligations, risk flags, SA law flags
- **Auto-polling**: frontend polls every 4s while any analysis is Queued/Analysing
- **Sparse PDF detection**: < 200 chars/page triggers OCR even when pdf-parse finds some text
- **Legal Research DB** (LegalResearchDB.tsx) — search SA legal corpus, AI-generated summaries, full judgment text with source URL links
- **SA Legal Corpus**: 504 curated seed cases + daily Laws.Africa API indexer (`server/saflii.js`, cron job, ~95 queries/day across judgments-za and legislation-za KBs)

### Communications
- **WhatsApp** (WhatsAppComms.tsx) — Meta Cloud API, opt-in tracking, 24hr service window, template management, inbound threading
- **Email** — SMTP transactional via nodemailer, tenant-branded sender identity

### E-Signature (fully wired this session)
- **ESignature.tsx** — ECTA Act 25 of 2002 compliant
- **Flow**: Create request → Add signatories → Send OTP (emailed via SMTP) → Sign (draw/type/upload) → Auto-complete when all signed
- **Security**: OTP hashed (SHA-256), 15-min expiry, IP + user-agent recorded
- **Audit trail**: Every event logged (request_created, otp_sent, signed, declined) with timestamps and IP
- **Certificate**: Completion certificate tab when all signatories done
- **Backend**: 4 endpoints fully wired — GET list, POST create (transaction), POST send-otp (with email), POST sign (OTP verify + signature store)

### Property & Entity Search
- **CIPC Search** (CipcSearch.tsx) — company lookup via VerifyNow
- **Lightstone Property** — address search, property detail, sectional schemes, ownership, title deeds, municipal rates, valuation
- **VerifyNow** — ID verify, AML/PEP screening, CIPC company/director, bank account verify, face match, vehicle checks

### Analytics & Admin
- **Practice Analytics** (PracticeAnalytics.tsx) — WIP by fee earner, realization rates, matter profitability, billing pipeline
- **Agent Network** (AgentNetwork.tsx) — estate agent referrals, commission tracking
- **Help System** (HelpPanel.tsx) — contextual help with 15+ topic sections covering all features
- **Settings** — SMTP config, API provider management (with feature routing), tenant profile, assistant training, RAG sources

## Server Utility Modules

| Module | Purpose |
|--------|---------|
| `server/auth.js` | JWT signing/verification, auth middleware |
| `server/db.js` | PostgreSQL connection pool |
| `server/gcs.js` | Google Cloud Storage signed URLs, upload/download |
| `server/mailer.js` | Nodemailer SMTP transporter |
| `server/ocr.js` | Google Vision API batch PDF OCR |
| `server/saflii.js` | Laws.Africa KB indexer (daily cron) |
| `server/verifynow.js` | VerifyNow API wrapper |
| `server/lightstone.js` | Lightstone Property API |
| `server/whatsapp-session.js` | WhatsApp Meta Cloud API session |
| `server/notifications.js` | Notification queue/dispatch |
| `server/pdf.js` | HTML-to-PDF generation |

## External Integrations

| Service | Purpose | Config |
|---------|---------|--------|
| Google Gemini | Primary AI provider | GEMINI_API_KEY or Settings UI |
| OpenAI | Fallback AI provider | OPENAI_API_KEY or Settings UI |
| xAI Grok | Optional AI provider | GROK_API_KEY or Settings UI |
| Google Cloud Vision | PDF OCR | GOOGLE_APPLICATION_CREDENTIALS |
| Google Cloud Storage | Document storage | GCS_BUCKET_NAME |
| Laws.Africa | SA legal corpus indexing | LAWS_AFRICA_AUTH_TOKEN |
| VerifyNow | SA identity/AML/CIPC checks | Settings UI |
| Lightstone | SA property data | Settings UI |
| Yoco | ZAR payment gateway | YOCO_SECRET_KEY |
| Meta WhatsApp Cloud API | Business messaging | WHATSAPP_API_KEY |
| ExchangeRates.com | Currency conversion | Settings UI |
| Xero/QuickBooks/Wave | Accounting sync | OAuth via Settings |

## Database (18 migrations)

Key tables: tenants, users, tenant_profiles, matters, contract_drafts, clients, invoices, invoice_line_items, invoice_payments, trust_transactions, trust_reconciliations, fica_clients, fica_documents, time_entries, popia_processing_records, popia_dsr_requests, popia_breach_incidents, conveyancing_matters, litigation_matters, litigation_deadlines, whatsapp_contacts, whatsapp_messages, document_analyses, legal_corpus_documents, legal_corpus_sources, signature_requests, signature_signatories, signature_audit_events, estate_agents, agent_referrals, platform_api_provider_settings (with features[]), platform_smtp_settings, rag_sources, ai_native_assistants, analytics_snapshots, verifynow_usage_log, lightstone_usage_log.

## Recent Session Work (L4, 2026-06-18)

1. **AI feature routing system** — central `getAiForFeature()` resolver, unified `callAiProvider()` dispatcher, feature toggle chips in Settings UI, migration 018
2. **Fixed model IDs** — gemini-3.1-pro → gemini-3.1-pro-preview, gpt-5.2 → gpt-5.4-mini, grok-4 → grok-4.3
3. **Sparse PDF OCR fix** — detect thin text layers (< 200 chars/page), trigger Vision OCR instead of using fragments
4. **OCR diagnostic logging** — console logs for extraction method, char counts, and errors
5. **Document analysis auto-polling** — frontend polls every 4s while any analysis is pending
6. **E-Signature OTP email** — wired OTP delivery via SMTP with branded HTML template, firm name, document title
