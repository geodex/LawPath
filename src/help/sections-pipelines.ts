import type { HelpTopic } from "./types";

export const PIPELINE_TOPICS: HelpTopic[] = [
  {
    id: "conveyancing",
    title: "Conveyancing pipeline",
    icon: "Home",
    summary:
      "End-to-end transfer, bond and sectional title workflow from intake to Deeds Office registration.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "The conveyancing pipeline manages every transfer matter through the standard South African flow: Intake, FICA, Sale agreement, Rates clearance, Levy clearance, SARS Transfer Duty, Lodgement and Registration. Each stage carries its own checklist, document slots and party roles (seller, purchaser, agent, bondholder, transferring attorney).",
          "It is wired into the Trust Account for the purchaser deposit and the SARS Transfer Duty payment, into Document Intelligence for OCR of the offer to purchase and rates figures, and into the e-Signature view for power of attorney and section 15 affidavits.",
        ],
      },
      {
        heading: "Stage tracking and clearances",
        body: [
          "Rates clearance certificates are valid for the period prescribed by the municipality (typically until the stated expiry on the certificate); levy clearances under the Sectional Titles Schemes Management Act follow the body corporate's stated date. The pipeline shows an amber warning 14 days before expiry and a red flag once expired so lodgement is not delayed.",
        ],
        tip: "Set the target registration date on intake; the system back-calculates SARS, rates and bond instruction deadlines from it.",
      },
      {
        heading: "How to use it",
        steps: [
          "Open Matters, click New matter and choose Transfer, Bond or Sectional title transfer.",
          "Capture the parties, purchase price and target registration date; FICA tasks are auto-created per party.",
          "Upload the signed offer to purchase to Document Intelligence to auto-populate price, deposit and commission.",
          "Move the matter through each stage; the trust deposit and transfer duty payments post against the matter ledger.",
          "After lodgement, capture the Deeds Office barcode; on registration the estate agent commission is released.",
        ],
      },
    ],
  },
  {
    id: "litigation",
    title: "Litigation pipeline",
    icon: "Gavel",
    summary:
      "Track opposed motions, trials, urgent applications and Rule 43 matters with court-day-accurate deadlines.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "The litigation pipeline supports the matter types you actually run: opposed and unopposed motion, action proceedings, urgent applications, Rule 43 maintenance pendente lite, reviews and appeals. It works across the High Court divisions (Gauteng, Western Cape, KZN, ECD and others) and the Magistrates' Court, with rules and tariffs per forum.",
        ],
      },
      {
        heading: "Dies induciae and court diary",
        body: [
          "Once a service date is captured, the system computes downstream dates using court days. Rule 6(5)(d)(i) notice of intention to oppose (10 court days), Rule 6(5)(e) answering affidavit (15 court days from notice of opposition), and replying affidavit periods are all pre-loaded. Public holidays and the court recess are excluded automatically.",
          "The court date register collates every set down hearing across the firm, with reminders to the responsible attorney and candidate attorney 7, 3 and 1 day before.",
        ],
        tip: "For Rule 43 applications the pipeline keeps the founding affidavit, sworn replying and financial disclosure schedule separately so they can be served as a single bundle.",
      },
      {
        heading: "Cost orders and outcomes",
        body: [
          "Capture the cost order at the end of each interlocutory and at judgment: costs in the cause, costs reserved, no order as to costs, attorney and own client, or de bonis propriis. The outcome feeds the bill of costs and informs the realisation rate reported in Practice analytics.",
        ],
      },
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp communications",
    icon: "Send",
    summary:
      "Client messaging over the Meta Cloud API with per-tenant numbers, opt-in tracking and pre-approved templates.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Each tenant connects its own WhatsApp Business number through the Meta Cloud API. Inbound and outbound messages are threaded against the client record and the related matter so the whole firm sees a single conversation history.",
          "Outbound messages outside the 24-hour customer service window must use a pre-approved template. LawPath ships three: transfer_update, fica_request and appointment_reminder; tenants may submit further templates through the Settings panel.",
        ],
      },
      {
        heading: "Opt-in and fallback",
        body: [
          "No outbound message is sent until the client's opt-in is recorded against their profile, in line with Meta's commerce policy and POPIA's lawful processing requirements. If the client has no mobile number or has not opted in, the system silently falls back to email through the configured sender identity.",
        ],
        tip: "Capture opt-in during FICA intake so transfer-update messages start flowing immediately on instruction.",
      },
      {
        heading: "How to use it",
        steps: [
          "Open the client, tick WhatsApp opt-in and save.",
          "From the matter, choose Send update and pick a template; merge fields populate from matter data.",
          "Inbound replies appear in the matter activity feed and notify the responsible fee earner.",
        ],
      },
    ],
  },
  {
    id: "e-signature",
    title: "e-Signature",
    icon: "FilePenLine",
    summary:
      "Order-aware electronic signature flow with OTP authentication and a full audit trail under the ECT Act.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Documents are routed to signatories in the order you define. Each signatory receives an email link and a one-time PIN sent to the same mobile number captured for them; the next signatory is only notified once the previous has signed.",
          "Signatories may draw a signature on the touchscreen, type their name in a script font or upload an image of an existing signature. Every action is timestamped and IP-logged.",
        ],
      },
      {
        heading: "Audit trail and ECT Act",
        body: [
          "The audit log records request_created, otp_sent, otp_verified, signed and completed events with UTC timestamps, IP and user agent. For non-statute documents (commercial agreements, retainer letters, mandates) this constitutes an advanced electronic signature equivalent acceptable under the Electronic Communications and Transactions Act 25 of 2002.",
          "Wet-ink signature is still required for instruments excluded by Schedule 1 of the ECT Act, including wills under the Wills Act 7 of 1953, antenuptial contracts, alienation of land agreements and bills of exchange. The system blocks e-signature routing for matter types flagged as wet-ink only.",
        ],
        tip: "For powers of attorney to pass transfer, the Deeds Office still requires wet-ink originals; use e-signature only for the FICA and instruction pack.",
      },
      {
        heading: "How to use it",
        steps: [
          "Upload the PDF and drag signature, initial and date fields onto each page.",
          "Add signatories in the order they must sign and confirm their email and mobile.",
          "Send for signature; track progress and download the signed PDF with embedded audit certificate.",
        ],
      },
    ],
  },
  {
    id: "research-db",
    title: "Legal research database",
    icon: "LibraryBig",
    summary:
      "Deep vector-indexed corpus of SA case law, legislation and tenant precedents with cited answers.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "The research database indexes SAFLII case law across the Constitutional Court, Supreme Court of Appeal, High Court divisions and specialist courts; the Constitution of the Republic of South Africa, 1996; primary legislation and Government Gazette amendments; LPC rules and code of conduct; and your tenant's own precedent bank.",
          "Every answer cites the source paragraph and provides a direct link back to the original document so it can be verified before being relied on in a heads of argument.",
        ],
      },
      {
        heading: "How it differs from the Research desk",
        body: [
          "The Research desk is the lightweight conversational tool for quick questions. The research database is the heavier authority lookup intended for opinion drafting and litigation research: broader corpus, slower, paragraph-level citations and the ability to scope searches to a specific court, period or statute.",
        ],
        tip: "Add your firm's past opinions to the precedent bank; they are embedded into the index and surface as internal authorities alongside SAFLII results.",
      },
      {
        heading: "How to use it",
        steps: [
          "Open Research database and choose Authority lookup or Drafting assistant.",
          "Scope the search (e.g. SCA only, Companies Act 71 of 2008, last five years).",
          "Review each citation before pasting into your document; click through to read the surrounding paragraph in context.",
        ],
      },
    ],
  },
  {
    id: "agents",
    title: "Estate agent network",
    icon: "UsersRound",
    summary:
      "Manage referring estate agents, their FFC and PPRA compliance, and commission tracking on transfers.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Register every estate agent or agency that refers transfer work. Each record captures the principal, FFC number and expiry, PPRA registration, area of operation and default commission rate or split.",
          "Agents can be granted a portal access token to view the status of their pending transfers without the firm sharing email updates manually.",
        ],
      },
      {
        heading: "Commission tracking",
        body: [
          "When an agent is linked to a transfer matter the commission is created as pending. It moves to approved once registration is captured in the conveyancing pipeline, and to paid once the trust transfer is processed. Outstanding commissions appear on the agent's statement and in Practice analytics.",
        ],
        tip: "Block payouts to agents whose FFC has lapsed; the system warns on linking and prevents commission release until a refreshed FFC is loaded.",
      },
      {
        heading: "How to use it",
        steps: [
          "Open Agents, add the agency and at least one principal with FFC and PPRA details.",
          "Set the default commission rate and bank details for payout.",
          "On a transfer matter, link the referring agent; commission entries are created automatically.",
        ],
      },
    ],
  },
  {
    id: "analytics",
    title: "Practice analytics",
    icon: "TrendingUp",
    summary:
      "Fee-earner productivity, matter cycle times, debtors aging and trust balance trend for partner review.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Practice analytics consolidates the figures partners actually want at the monthly meeting. Per fee earner: WIP, billed, collected, realisation rate (billed over WIP) and collection rate (collected over billed). Per matter type: average cycle time from instruction to closure, broken down by stage.",
          "Debtors aging is reported in the standard 30 / 60 / 90 / 120+ buckets, and the trust balance trend shows monthly opening and closing balances against the section 86(4) trust investment account.",
        ],
      },
      {
        heading: "Snapshots and export",
        body: [
          "Snapshots are generated on the first of each month and stored against the tenant. Every chart and table can be exported to CSV for board packs or auditor queries; the trust balance series is the source for the annual LPC audit.",
        ],
        tip: "Compare realisation rate across fee earners before setting next year's billing targets; a sub-80% rate usually points to write-offs at billing rather than time capture issues.",
      },
    ],
  },
  {
    id: "staff",
    title: "Staff management",
    icon: "UserPlus",
    summary:
      "Invite, role and deactivate users across tenant_admin, attorney, candidate attorney, legal secretary and billing admin.",
    sections: [
      {
        heading: "What this feature is",
        body: [
          "Staff management is where the tenant administrator invites everyone else in the firm and controls what they can see. Roles are tenant_admin, attorney, candidate_attorney, legal_secretary and billing_admin; each carries a different default permission set across matters, trust, billing and settings.",
        ],
      },
      {
        heading: "Invites and role changes",
        body: [
          "Invites are sent by email with a one-time token. The token expires after the period configured by the tenant (default 72 hours) and can be revoked or resent at any time. Only a tenant_admin may invite a new user or change a user's role; attorneys cannot self-elevate.",
        ],
        tip: "Candidate attorneys should be linked to their principal; the link drives supervision sign-off on opinions and trust withdrawals.",
      },
      {
        heading: "Deactivation",
        body: [
          "When a staff member leaves, deactivate rather than delete. The user can no longer log in but every matter activity, time entry, trust transaction and signature event remains attributable to them, preserving the audit trail required by the LPC.",
        ],
        steps: [
          "Open Staff, click Invite and pick the role and (for candidates) principal.",
          "Send the invite; the user sets a password through the one-time link.",
          "To offboard, open the user and click Deactivate; reassign open matters where required.",
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings & admin",
    icon: "Settings",
    summary:
      "Tenant profile, sender identity and delivery on every plan; platform-level keys and transports for super admins.",
    sections: [
      {
        heading: "What tenant admins see",
        body: [
          "Tenant admins manage the firm profile (name, registered address, LPC practice number, VAT number, list of fee earners with practice numbers) and the sender identity used for outbound email: from address, reply-to, footer block and default signature.",
          "A Test email button verifies the sender setup against the configured SMTP transport, and the Delivery events panel surfaces bounces, deferrals and opens for the last 30 days so a misconfigured DNS record is caught before clients notice.",
        ],
        tip: "Set the LPC and VAT numbers correctly on day one; they appear on every tax invoice, statement and trust receipt the system issues.",
      },
      {
        heading: "What platform super admins see additionally",
        body: [
          "Super admins additionally see the underlying SMTP transport configuration, third-party API keys (OpenAI, Gemini, Grok, VerifyNow, Lightstone, exchange rate provider) and the WhatsApp Business credentials (phone number ID, system user token, webhook verify token).",
          "They also control the RAG and AI training panel that governs which tenant data is allowed into shared embeddings, and the VerifyNow usage monitor that tracks FICA verification consumption per tenant for billing.",
        ],
        steps: [
          "Tenant admin: Settings, Firm profile, capture all statutory numbers and save.",
          "Tenant admin: Settings, Email, set the sender identity and run a test email.",
          "Super admin: Platform, API keys, rotate any key by pasting the new value and saving; the old key is invalidated immediately.",
        ],
      },
    ],
  },
];
