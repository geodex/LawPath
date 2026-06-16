import type { HelpTopic } from "./types";

export const CORE_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: "Rocket",
    summary: "Set up your firm, learn the layout, and start billing within an hour.",
    sections: [
      {
        heading: "Your first login",
        body: [
          "On first login you land on a near-empty workspace scoped to your firm's tenant. Nothing is shared with any other practice on LawPath.",
          "Before you draft your first matter, complete the tenant profile under Settings. The VAT number, LPC practice number, and trust account details flow into every invoice, mandate, and letterhead the system generates.",
        ],
      },
      {
        heading: "The onboarding wizard",
        body: [
          "The wizard walks you through the minimum viable setup: firm details, fee earners, default hourly rates, and one test client.",
        ],
        steps: [
          "Add your firm's letterhead logo and registered address.",
          "Capture each fee earner with their tariff and admission date.",
          "Load opening trust and business balances (or zero if starting fresh).",
          "Create one client and one matter to confirm the chain works end-to-end.",
        ],
        tip: "Capture the LPC reference for every fee earner — it appears on costs orders and you do not want to chase it during a taxation.",
      },
      {
        heading: "Finding your way around",
        body: [
          "The left sidebar lists features: Dashboard, Matters, Drafting, Research, Clients, Secretary, Calendar, Litigation, Conveyancing, Billing, Settings.",
          "The topbar carries workspace actions: global search, notifications, the theme toggle (sun/moon), and the help icon you are reading from now.",
          "The amber circular button bottom-right is the AI assistant. It follows you across every view and is always tenant-scoped.",
        ],
      },
    ],
  },
  {
    id: "overview",
    title: "Dashboard",
    icon: "Home",
    summary: "Your firm at a glance — WIP, matters, invoices, and what moved today.",
    sections: [
      {
        heading: "The hero banner",
        body: [
          "The banner greets the logged-in user and surfaces the single most important call to action — usually an overdue invoice, an unsigned mandate, or a litigation deadline falling inside the dies induciae.",
        ],
      },
      {
        heading: "Metric cards",
        body: [
          "Four cards summarise the practice in real time. The numbers refresh whenever you touch the underlying records — no nightly batch.",
        ],
        steps: [
          "WIP — unbilled time and disbursements valued at each fee earner's tariff.",
          "Active matters — files with status Open, excluding archived and concluded matters.",
          "Outstanding invoices — total of issued invoices not yet receipted, split by age bucket.",
          "Research saved — research packs captured to a matter in the current month.",
        ],
        tip: "Click any metric to drill into the underlying list filtered to exactly that cohort.",
      },
      {
        heading: "Recent matter cards",
        body: [
          "Each card shows the matter reference, client, responsible attorney, and the last meaningful event (a note, an appointment, a document, a receipt). Click through to the matter dossier.",
        ],
      },
      {
        heading: "Activity feed and quick-actions",
        body: [
          "The activity feed is a chronological log of everything your tenant did — drafts generated, invoices sent, FICA documents uploaded, appointments concluded.",
          "Quick-actions in the top right let you start a new matter, capture time, draft a letter, or open the AI assistant without navigating away.",
        ],
      },
    ],
  },
  {
    id: "drafting",
    title: "Contracts & drafting",
    icon: "FilePenLine",
    summary: "Generate South African contracts from vetted templates, edit, and export.",
    sections: [
      {
        heading: "The template library",
        body: [
          "Drafting ships with a library of SA-specific templates: sale of shares, sale of immovable property, commercial lease, residential lease, employment contract, restraint of trade, NDA, loan agreement, suretyship, and shareholders' agreement.",
          "Each template has been reviewed by an admitted attorney; the reviewer's initials and the review date appear on the template card.",
        ],
      },
      {
        heading: "Generating a draft",
        body: [
          "You provide structured inputs — parties, purchase price, suspensive conditions, special terms — and the engine returns a clean Word-style draft with numbered clauses.",
        ],
        steps: [
          "Pick a template and confirm the governing law (default: South Africa).",
          "Capture each party with full FICA-grade details (ID/registration number, address, representative capacity).",
          "Select the optional clauses you want included (voetstoots, CPA cooling-off where applicable, NCA disclosures, arbitration vs litigation).",
          "Generate, then refine the draft inline before saving to the matter.",
          "Export to PDF or DOCX for signature.",
        ],
        tip: "Voetstoots is automatically suppressed where the seller is a CPA-defined supplier — override only with a recorded reason.",
      },
      {
        heading: "Editing and version control",
        body: [
          "Every save creates a new version. The matter dossier shows the full version history with the editor and timestamp, which is invaluable when a client queries a clause six months later.",
        ],
      },
      {
        heading: "Reviewed-by attribution",
        body: [
          "Outputs carry a footer noting which fee earner generated and which fee earner reviewed the draft. The reviewer field stays empty until an admitted attorney explicitly signs it off.",
        ],
      },
    ],
  },
  {
    id: "research",
    title: "Research desk",
    icon: "Search",
    summary: "Ask a legal question, get a cited research pack you can save to a matter.",
    sections: [
      {
        heading: "What the desk is for",
        body: [
          "The Research desk is the quick-answer surface — a fee earner types a question in natural language and gets a structured response in under a minute. For deep statute-by-statute work, use the Legal Research database instead.",
        ],
      },
      {
        heading: "How a query is answered",
        body: [
          "The question is embedded and matched against the firm's connected sources: SA case law, LexisNexis and Juta commentary (where licensed), statutes, regulations, and any internal precedents your firm has uploaded.",
          "The top-ranked passages are passed to the model as retrieval context. The model then produces a research pack containing a short answer, the supporting authorities, and a list of open questions.",
        ],
      },
      {
        heading: "Working with the pack",
        body: [
          "Every citation is clickable and resolves to the source passage so you can verify rather than trust.",
        ],
        steps: [
          "Read the short answer, then expand each authority to confirm the proposition.",
          "Edit the pack inline — strike out anything you do not want on file.",
          "Save the pack to a matter; it appears under that matter's Research tab.",
          "Optionally attach the pack to an opinion or letter you are drafting.",
        ],
        tip: "Always cite the SALR or authoritative reporter citation — the AI sometimes prefers the AllSA citation when both exist.",
      },
    ],
  },
  {
    id: "clients",
    title: "Clients (CRM)",
    icon: "Users",
    summary: "Your client book with FICA status, beneficial owners, and matter links.",
    sections: [
      {
        heading: "Searching the book",
        body: [
          "The client list supports free-text search and faceted filters: client type (individual, company, trust, close corporation, body corporate), FICA status (verified, pending, expired, exempt), and category (private, commercial, estates, conveyancing, litigation).",
        ],
        tip: "Filter by FICA status: expired to find clients who must be re-verified before you take new instructions.",
      },
      {
        heading: "Adding an individual",
        body: [
          "Capture full names, ID or passport number, date of birth, physical and postal addresses, contact details, and marital status (in or out of community of property — it matters for litigation citations and conveyancing).",
        ],
      },
      {
        heading: "Adding a legal entity",
        body: [
          "For a juristic client the system requires the registration number, registered address, authorised representative, and the FICA-mandated beneficial ownership chain.",
        ],
        steps: [
          "Capture the entity's registered details and CIPC status.",
          "Add each beneficial owner holding 5% or more, with their own FICA documents.",
          "Upload the resolution or mandate authorising the representative to instruct your firm.",
          "Mark FICA verified once all documents are on file and the risk rating is captured.",
        ],
      },
      {
        heading: "Linking and archiving",
        body: [
          "A client can have any number of matters; opening a new matter from the client card pre-populates the parties.",
          "Archiving hides a client from the active list without deleting any records — useful once all matters are concluded and the file is in long-term storage.",
        ],
      },
    ],
  },
  {
    id: "secretary",
    title: "Secretary & tasks",
    icon: "Archive",
    summary: "Day-to-day office tasks with owners, due dates, and priorities.",
    sections: [
      {
        heading: "What lives here",
        body: [
          "The Secretary view is the firm's task list — collecting documents from a client, paying a sheriff, ordering a deeds office search, drafting a covering letter, following up on outstanding FICA documents.",
          "Every task has a title, an owner (a fee earner or secretary), a due date, and a priority of Normal or Urgent.",
        ],
      },
      {
        heading: "Working a task",
        body: [
          "Tasks can be linked to a matter, in which case they also appear on that matter's task tab. Activity is logged when a task is created, reassigned, or completed.",
        ],
        steps: [
          "Capture the task with a clear, action-oriented title.",
          "Assign an owner — unassigned tasks fall to the practice manager queue.",
          "Set a realistic due date; Urgent tasks bubble to the top of every dashboard.",
          "Mark Done when complete; the close timestamp is preserved for audit.",
        ],
      },
      {
        heading: "Not for litigation deadlines",
        body: [
          "Court deadlines — notice of intention to defend, plea, discovery, heads of argument — do not belong here. Capture them inside the Litigation pipeline, where the system understands court rules, computes the dies induciae and counts only court days where required (for example Rule 6(5)(d) of the High Court rules).",
        ],
        tip: "If a task is really a court deadline in disguise, move it to Litigation — you do not want a missed plea hidden in a secretary's to-do list.",
      },
    ],
  },
  {
    id: "calendar",
    title: "Calendar & appointments",
    icon: "CalendarDays",
    summary: "Schedule consultations, link them to matters, and track outcomes.",
    sections: [
      {
        heading: "Capturing an appointment",
        body: [
          "Every appointment records a title, the counterparty or client, start and end time, and the mode of meeting.",
        ],
        steps: [
          "Pick the mode: Office, Teams, Phone, or Deeds office.",
          "Link the appointment to a matter so it appears on that file's timeline.",
          "Invite internal attendees; their calendars block out automatically.",
          "Save — a confirmation goes to the client if their email is on file.",
        ],
      },
      {
        heading: "Statuses and outcomes",
        body: [
          "Appointments move through a lifecycle so you can later report on conversion and no-shows.",
        ],
        steps: [
          "Confirmed — client has acknowledged.",
          "Held — the meeting took place; capture the attendance note.",
          "Rescheduled — moved to a new slot, preserving the original record.",
          "Cancelled — called off with reasons.",
          "No show — client did not arrive; the system flags the client for follow-up.",
        ],
      },
      {
        heading: "Reminders",
        body: [
          "When the email transport is configured in Settings, the system sends a reminder to the client 24 hours before the appointment and a calendar invite at the point of booking. Without a configured transport the reminders are queued but not sent.",
        ],
        tip: "Deeds office appointments default to a 30-minute buffer either side so registration windows are not missed.",
      },
    ],
  },
  {
    id: "ai-assistant",
    title: "AI assistant",
    icon: "Sparkles",
    summary: "Your tenant-scoped legal copilot — always one click away.",
    sections: [
      {
        heading: "Where to find it",
        body: [
          "The amber circular button anchored bottom-right is the AI assistant. It follows you across every view and opens a side panel without losing your place.",
        ],
      },
      {
        heading: "What it knows about",
        body: [
          "The assistant's context window is built from your tenant only: open matters, saved research packs, RAG sources your firm has connected, outstanding tasks, draft and issued invoices, and recent activity.",
          "Tenant context never crosses into another firm. A query from your workspace cannot retrieve a passage from another tenant's matters, even if both firms use the same template.",
        ],
      },
      {
        heading: "Using the assistant",
        body: [
          "The panel offers quick-prompts for the most common asks — summarise this matter, draft a follow-up letter, compute prescription, list outstanding FICA per client.",
        ],
        steps: [
          "Pick a quick-prompt or type a free-form question.",
          "Review the cited sources before acting on the answer.",
          "Save the conversation to a matter if it produced useful output.",
        ],
        tip: "Conversations are retained per fee earner so you can return to a thread you started yesterday.",
      },
      {
        heading: "Models and keys",
        body: [
          "By default the assistant routes to OpenAI, Gemini, and Grok, depending on the prompt class. The keys are provisioned centrally by the Super Admin; tenants do not need to bring their own. If your firm has bespoke keys, they can be set at the tenant level and override the defaults.",
        ],
      },
    ],
  },
  {
    id: "theme-and-help",
    title: "Theme & help",
    icon: "Sun",
    summary: "Light or dark, and where to find this guide when you need it again.",
    sections: [
      {
        heading: "Switching the theme",
        body: [
          "The sun / moon icon in the topbar toggles between light and dark theme. The choice is stored in your browser's localStorage so the workspace remembers your preference on the next login.",
          "Switching the theme is purely cosmetic — no data, permissions, or AI behaviour change with the theme.",
        ],
        tip: "Court chambers tend to be brightly lit; the light theme is friendlier on a laptop screen in those conditions.",
      },
      {
        heading: "Opening help",
        body: [
          "The question-mark icon in the topbar opens this help panel. Topics are grouped by area — Core covers the daily workspace, with separate sections for Litigation, Conveyancing, Billing, and administration.",
        ],
      },
      {
        heading: "Keyboard accessibility",
        body: [
          "The help panel is designed to close on Escape so you can dismiss it without reaching for the mouse.",
        ],
        tip: "Escape-to-close is the intended behaviour and is documented here, but is not yet wired through to the modal — expect it to land in a near-term release.",
      },
    ],
  },
];
