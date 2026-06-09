import type { Appointment, ContractDraft, Invoice, Matter, ResearchItem, WorkTask } from "./types";

export const matters: Matter[] = [
  {
    id: "M-1048",
    title: "Mokoena to Dlamini transfer",
    client: "Thandi Mokoena",
    role: "Seller",
    matterType: "Conveyancing",
    property: "12 Protea Close, Sandton",
    estateAgent: "Cape & City Realty",
    stage: "Rates clearance",
    progress: 62,
    nextStep: "Awaiting municipal clearance certificate",
    due: "2026-06-12",
    portalAccess: true,
    risk: "Medium"
  },
  {
    id: "M-1049",
    title: "Ndlovu shareholder agreement",
    client: "Sipho Ndlovu",
    role: "Founder",
    matterType: "Commercial",
    property: "N/A",
    estateAgent: "N/A",
    stage: "Drafting",
    progress: 38,
    nextStep: "Insert reserved matters and tag-along rights",
    due: "2026-06-10",
    portalAccess: false,
    risk: "Low"
  },
  {
    id: "M-1050",
    title: "Estate late Naidoo",
    client: "Priya Naidoo",
    role: "Executor",
    matterType: "Estate",
    property: "Durban North",
    estateAgent: "N/A",
    stage: "Master query",
    progress: 74,
    nextStep: "Upload amended liquidation account",
    due: "2026-06-18",
    portalAccess: true,
    risk: "High"
  }
];

export const contracts: ContractDraft[] = [
  {
    id: "C-210",
    name: "Residential offer to purchase",
    category: "Conveyancing",
    partyA: "Thandi Mokoena",
    partyB: "Lerato Dlamini",
    status: "Ready for review",
    updated: "2026-06-03",
    body: "Offer to purchase immovable property in South Africa, including suspensive conditions, occupational rent, risk transfer, voetstoots limitations, FICA onboarding and POPIA consent."
  },
  {
    id: "C-211",
    name: "Shareholder agreement",
    category: "Commercial",
    partyA: "Ndlovu Holdings (Pty) Ltd",
    partyB: "Founding shareholders",
    status: "Drafting",
    updated: "2026-06-02",
    body: "Shareholder agreement covering governance, reserved matters, share transfers, pre-emptive rights, deadlock, restraint, confidentiality and dispute resolution."
  }
];

export const research: ResearchItem[] = [
  {
    id: "R-001",
    title: "Conveyancing delay authority bundle",
    court: "SCA / High Court",
    year: "2024",
    tags: ["conveyancing", "mandate", "damages"],
    summary: "Practitioner delay, mandate scope, causation and damages. Useful for negligence risk letters and client progress explanations."
  },
  {
    id: "R-002",
    title: "POPIA client portal processing note",
    court: "Information Regulator guidance",
    year: "2025",
    tags: ["popia", "privacy", "portal"],
    summary: "Client portals should limit access by matter, log activity, avoid oversharing identity documents and use consent-driven sharing."
  }
];

export const tasks: WorkTask[] = [
  { id: "T-1", title: "Call municipality about clearance figures", owner: "Legal secretary", due: "Today", done: false, priority: "Urgent" },
  { id: "T-2", title: "Prepare FICA chase email for Mokoena", owner: "Candidate attorney", due: "Tomorrow", done: false, priority: "Normal" },
  { id: "T-3", title: "File signed mandate in estate matter", owner: "Legal secretary", due: "Friday", done: true, priority: "Normal" }
];

export const invoices: Invoice[] = [];

export const appointments: Appointment[] = [
  { id: "A-1", title: "Signing appointment: transfer docs", person: "Thandi Mokoena", time: "2026-06-05 10:00", mode: "Office" },
  { id: "A-2", title: "Consultation: shareholder terms", person: "Sipho Ndlovu", time: "2026-06-06 14:30", mode: "Teams" }
];
