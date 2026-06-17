import type { HelpTopic } from "./types";

export const COMPLIANCE_TOPICS: HelpTopic[] = [
  {
    id: "fica",
    title: "FICA / KYC",
    icon: "ShieldCheck",
    summary: "Risk-based client onboarding, document capture and sanctions screening under FICA Act 38 of 2001.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "The FICA module operationalises your obligations as an accountable institution under the Financial Intelligence Centre Act 38 of 2001. Every client added to the workspace is scored against a risk-based approach and routed through a documentary KYC workflow before any matter can be opened or trust funds received.",
          "Risk ratings are Low, Medium, High and PEP (Politically Exposed Person). The rating drives both the documents required and how often the client must be re-verified. The FICA status field on each client moves through Pending, In Progress, Compliant, Expired and Rejected, mirroring the lifecycle the FIC expects to see in an inspection.",
        ],
      },
      {
        heading: "Required documents by client type",
        body: [
          "Natural persons: green-barcoded ID or smart ID, proof of residential address (not older than three months) and SARS tax number where the matter is fee-bearing.",
          "Legal entities: CIPC registration certificate (CoR14.3), Memorandum of Incorporation, share register and the KYC pack of each director and 25%+ beneficial owner.",
          "Trusts: Letter of Authority, trust deed, ID of every trustee and the KYC pack of each named beneficiary.",
        ],
      },
      {
        heading: "How to onboard a client",
        steps: [
          "Open Clients and click New Client, then choose the client type.",
          "For a legal entity, click Pre-fill from CIPC to import the company name, registration number and directors from the CIPC Search module.",
          "Upload each required document; the system tracks expiry dates and flags missing items.",
          "Run sanctions and PEP screening from the FICA panel and capture the result.",
          "Confirm the risk rating; the status will move to Compliant only once all checks are green.",
        ],
        tip: "FICA records and supporting documents must be retained for five years from the end of the business relationship. The system enforces this retention automatically.",
      },
    ],
  },
  {
    id: "popia",
    title: "POPIA compliance",
    icon: "ShieldAlert",
    summary: "Processing register, data subject requests and breach incident tracking under POPIA Act 4 of 2013.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "POPIA tooling lets your firm act as a responsible party under the Protection of Personal Information Act 4 of 2013. It centralises your processing records, the rights of data subjects and the incident log the Information Regulator may demand at short notice.",
          "The processing register is structured in the PAIA-aligned format expected by the Regulator: purpose, lawful basis, categories of data, recipients, cross-border transfers and retention period.",
        ],
      },
      {
        heading: "Data Subject Requests",
        body: [
          "Each request is logged with a statutory clock so you never miss a response deadline. Supported request types are Access, Correction, Erasure and Objection.",
        ],
        steps: [
          "Open Compliance, POPIA, Data Subject Requests and click New Request.",
          "Capture the data subject's identity verification and the request type.",
          "Assign a handler; the system schedules reminders against the response deadline.",
          "Attach the response pack and mark the request Closed with the outcome recorded.",
        ],
      },
      {
        heading: "Breach incidents and retention",
        body: [
          "Security compromises are captured in the incident log with discovery date, affected data subjects, containment steps and a notification decision.",
          "Where the breach is likely to cause harm, the Regulator must be notified as soon as reasonably possible. The system flags incidents that have been open for 72 hours without a notification decision.",
          "Retention schedules attach to matters so client files are purged or anonymised once the retention period lapses, with an audit trail of every deletion.",
        ],
        tip: "Appoint your Information Officer in firm settings; their details are auto-included on every DSR acknowledgement letter.",
      },
    ],
  },
  {
    id: "trust",
    title: "Trust account",
    icon: "Vault",
    summary: "Section 86 Legal Practice Act trust ledger with monthly reconciliation and LPC audit reports.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "The trust module is a section 86 trust ledger built to the standards required by the Legal Practice Act 28 of 2014 and the Legal Practice Council's accounting rules. Every receipt and payment is recorded against an individual client matter and the running balance per client is maintained in real time.",
          "Trust money never appears in your business books. The module enforces the separation and produces the schedules your section 87 auditor expects to see.",
        ],
      },
      {
        heading: "Recording receipts and payments",
        steps: [
          "Open Trust, choose the client matter and click Receipt or Payment.",
          "Capture the date, amount, payment reference and source or beneficiary.",
          "Attach the bank confirmation or proof of payment to the entry.",
          "Approve the entry; two-person approval can be enabled in firm settings for payments above a threshold.",
        ],
      },
      {
        heading: "Monthly reconciliation",
        body: [
          "Reconciliation compares three figures: the bank statement closing balance, the trust ledger control account and the sum of credit balances across all client matters. The three must agree.",
        ],
        steps: [
          "Upload or capture the trust bank statement for the month.",
          "Match each line to a ledger entry; unmatched items are flagged for investigation.",
          "Resolve any client matter showing a negative balance before signing off.",
          "Sign the reconciliation; the LPC audit pack PDF is generated automatically.",
        ],
        tip: "The system warns when a reconciliation has not been signed off within five days of month-end, the trigger point for LPC enquiries.",
      },
    ],
  },
  {
    id: "time",
    title: "Time & WIP",
    icon: "Timer",
    summary: "Fee-earner time entries flowing from work-in-progress to billed with 15% VAT applied.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Time and WIP captures professional work as it happens so that fees are recovered, not lost. Each entry belongs to a fee earner, a matter and an activity type: professional fee, correspondence, drafting or disbursement.",
          "Amounts are calculated as duration multiplied by the fee earner's rate on the matter, with VAT applied at 15% in terms of the VAT Act 89 of 1991. Statuses move from WIP to Billed or Written-off.",
        ],
      },
      {
        heading: "Capturing time",
        steps: [
          "Open Time and click New Entry, or use the timer on the matter detail view.",
          "Choose the activity type and write a narrative the client will see on the invoice.",
          "Confirm the duration in six-minute units; the rate is pulled from the matter.",
          "Save the entry as WIP; mark it Pending Bill when ready for inclusion on the next invoice.",
        ],
        tip: "Narratives should be self-explanatory to the client and to a taxing master. The system warns on entries shorter than ten characters.",
      },
      {
        heading: "Moving WIP into Billing",
        body: [
          "Entries flagged Pending Bill are surfaced in the Billing view, grouped by matter. From there a draft invoice is generated with one click, sweeping the selected entries to status Billed and locking them against further edits.",
          "Write-offs are captured with a reason and reported separately so partners can monitor leakage by fee earner and practice area.",
        ],
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & invoices",
    icon: "CircleDollarSign",
    summary: "Pipeline from WIP to draft invoice, PDF delivery, payment recording and accounting export.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "The Billing view is the per-matter invoicing pipeline for client fees and disbursements. It begins with WIP swept from Time entries and ends with a paid invoice posted to your accounting system.",
          "Invoices are numbered sequentially per tenant, rendered as PDFs server-side using PDFKit and delivered through your tenant-branded SMTP relay so they arrive from your firm's domain.",
        ],
      },
      {
        heading: "The pipeline",
        steps: [
          "Select the matter and the WIP entries to bill; the system produces a draft invoice with VAT at 15%.",
          "Edit narratives or disbursements, add a covering note and approve the draft.",
          "Generate the PDF and email it to the client; the system records delivery and any bounce.",
          "Capture payment when received: EFT, card or manual; partial payments are supported and the outstanding balance is recalculated.",
          "Export the invoice and payment to your accounting integration.",
        ],
      },
      {
        heading: "Adjustments",
        body: [
          "Write-offs and credit notes are first-class objects; they post against the original invoice and against the fee earner's recovery report.",
          "Once an invoice is paid in full the underlying time entries are locked permanently. Reopening requires a credit note.",
        ],
        tip: "Consumer-facing matters fall under the Consumer Protection Act 68 of 2008; ensure your mandate terms and fee disclosures are attached to the first invoice on the matter.",
      },
    ],
  },
  {
    id: "accounting",
    title: "Accounting sync",
    icon: "Split",
    summary: "Push invoices, time and trust transactions into Sage Pastel, Xero or QuickBooks, or fall back to CSV.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Accounting Sync moves financial data out of LawPath and into your firm's general ledger. Supported integrations are Sage Pastel, Xero and QuickBooks Online. A CSV export is always available as a manual fallback.",
          "Trust transactions are exported to a dedicated trust bank ledger in your accounting system, separate from the business books, preserving the section 86 separation downstream.",
        ],
      },
      {
        heading: "Connecting an integration",
        steps: [
          "Open Settings, Integrations, Accounting and choose the provider.",
          "Authenticate via OAuth (Xero, QuickBooks) or enter the API key (Sage Pastel).",
          "Map LawPath accounts to ledger codes: fee income, VAT control, trust bank, disbursement recoveries.",
          "Run a dry export to validate mapping, then enable scheduled sync.",
        ],
      },
      {
        heading: "Export types and fallback",
        body: [
          "Three export types are available: invoices with line items and VAT, time entries for productivity reporting, and trust transactions for the section 86 ledger.",
          "If a provider connection fails, the same data is downloadable as CSV from the Exports tab so month-end is never blocked.",
        ],
        tip: "Sage, Xero and QuickBooks require commercial API credentials. These are configured by your platform administrator under Super Admin, Settings, Integrations, and then become available to all tenants.",
      },
    ],
  },
  {
    id: "cipc",
    title: "CIPC company search",
    icon: "Building2",
    summary: "Search South African companies by name or registration number and import results into FICA.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "CIPC Search queries the South African Companies and Intellectual Property Commission register for entities incorporated under the Companies Act 71 of 2008 and its predecessors. Use it to verify a corporate client's existence and standing before opening a matter.",
          "Searches accept either a company name or a registration number. Registration numbers carry a suffix indicating entity type: /07 for private companies, /06 for public companies, /10 for non-profit companies, /21 for incorporated practices and /11 for state-owned companies.",
        ],
      },
      {
        heading: "Running a search",
        steps: [
          "Open CIPC Search and enter the company name or registration number.",
          "Review the result card: registered name, status, registration date, registered address and current directors.",
          "Click View Directors to expand director details with ID numbers and appointment dates.",
          "Click Import to FICA to create a legal-entity client record pre-populated with the company and director information.",
        ],
      },
      {
        heading: "Live vs simulation mode",
        body: [
          "Live results require a commercial Lightstone or LexisNexis DataSec API key configured by your platform administrator. Without a key, the module runs in simulation mode and returns plausibly formatted sample data for training and demo use.",
          "Simulation results are clearly watermarked and may not be relied on for FICA verification.",
        ],
        tip: "Even with live data, always verify the CIPC certificate the client provides against the live result; impersonation of dormant companies is a common fraud vector.",
      },
    ],
  },
  {
    id: "documents",
    title: "Document Intelligence",
    icon: "FileSearch",
    summary: "AI-assisted contract analysis extracting parties, dates, obligations and South African law flags.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Document Intelligence is an AI review layer for contracts and memoranda. Upload a file and the model extracts the parties, key dates, payment terms, termination triggers and a list of risk flags for attorney attention.",
          "Supported formats are PDF, DOCX, TXT and Markdown, up to 50 MB per document. Larger files should be split or summarised before upload.",
        ],
      },
      {
        heading: "Running an analysis",
        steps: [
          "Open Document Intelligence and upload the file (PDF, DOCX, TXT, MD up to 50 MB). Scanned image-only PDFs are automatically OCR'd via Google Cloud Vision before analysis.",
          "Choose the analysis profile: commercial contract, lease, employment, or general review.",
          "Wait for the extraction summary; expand each finding to see the supporting clause and page reference.",
          "Export the review as a memo to the matter file or copy specific flags into your advice note.",
        ],
      },
      {
        heading: "South African law flags",
        body: [
          "The model is tuned to surface SA-specific issues: voetstoots clauses against the Consumer Protection Act 68 of 2008, missing CPA cooling-off rights, NCA 34 of 2005 compliance for credit agreements, and POPIA Act 4 of 2013 processing obligations between the parties.",
          "Every output carries an Attorney Review Required watermark. The analysis is a drafting aid, not legal advice, and the responsible attorney remains accountable for the opinion delivered to the client.",
        ],
        tip: "Sensitive documents are processed inside your tenant boundary and are not used to train the underlying model.",
      },
    ],
  },
  {
    id: "subscription",
    title: "Subscription billing",
    icon: "BadgeCheck",
    summary: "Manage your firm's LawPath plan, card on file and platform invoices via the Yoco ZAR gateway.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Subscription Billing is the StripeBilling view that controls your firm's LawPath plan and the platform fee charged by LawPath SA. It is entirely separate from the per-client invoicing covered under Billing and invoices; this view handles only the money your firm pays us.",
          "South African ZAR card transactions are processed through Yoco. Your card data never touches our servers; only a tokenised reference is stored.",
        ],
      },
      {
        heading: "Plans and billing cycle",
        body: [
          "Three plans are available: Starter for sole practitioners, Practice for small firms, and Firm for established practices with multiple fee earners. Pricing, included seats and feature limits for each plan are shown on the Plans tab.",
          "Billing runs monthly on the anniversary of your sign-up date. Plan changes take effect immediately and are pro-rated on the next invoice.",
        ],
      },
      {
        heading: "Managing payment and invoices",
        steps: [
          "Open Subscription Billing and review your current plan and renewal date.",
          "Click Change Plan to upgrade, downgrade or cancel at the end of the cycle.",
          "Click Manage Card to add or replace the card on file through the Yoco vault.",
          "Open Invoice History to download tax invoices for accounting; each invoice includes 15% VAT.",
        ],
        tip: "If a charge fails, the platform enters a seven-day grace period before downgrading to read-only mode; matter and trust data are never deleted on downgrade.",
      },
    ],
  },
];
