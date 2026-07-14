import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, CornerDownLeft, Home, Scale, CircleDollarSign, ShieldCheck,
  FilePenLine, ArrowRight
} from "lucide-react";
import type {
  ConveyancingMatter, ContractDraft, FicaClient, Invoice,
  LitigationMatter, Matter, NavItem, ViewKey
} from "./types";

type Result = {
  id: string;
  label: string;
  sublabel: string;
  group: string;
  view: ViewKey;
  icon: React.ElementType;
};

interface Props {
  open: boolean;
  onClose: () => void;
  nav: NavItem[];
  isVisible: (key: ViewKey) => boolean;
  matters: Matter[];
  conveyancingMatters: ConveyancingMatter[];
  litigationMatters: LitigationMatter[];
  invoices: Invoice[];
  contracts: ContractDraft[];
  ficaClients: FicaClient[];
  setActiveView: (view: ViewKey) => void;
}

const money = (cents: number) => `R ${(cents / 100).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

export function CommandPalette({
  open, onClose, nav, isVisible, matters, conveyancingMatters,
  litigationMatters, invoices, contracts, ficaClients, setActiveView
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after the element mounts.
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];
    const hit = (...fields: (string | number | undefined | null)[]) =>
      !q || fields.some(f => String(f ?? "").toLowerCase().includes(q));

    // Navigation
    for (const item of nav) {
      if (!isVisible(item.key)) continue;
      if (hit(item.label, item.key)) {
        out.push({ id: `nav-${item.key}`, label: item.label, sublabel: "Go to page", group: "Navigate", view: item.key, icon: item.icon || ArrowRight });
      }
    }
    // Conveyancing matters
    for (const m of conveyancingMatters) {
      if (hit(m.matterRef, m.sellerName, m.buyerName, m.erfNumber, m.propertyDescription)) {
        out.push({ id: `conv-${m.id}`, label: `${m.sellerName} → ${m.buyerName}`, sublabel: `${m.matterRef} · Conveyancing`, group: "Matters", view: "conveyancing", icon: Home });
      }
    }
    // Litigation matters
    for (const m of litigationMatters) {
      if (hit(m.matterRef, m.caseNumber, m.plaintiff, m.defendant)) {
        out.push({ id: `lit-${m.id}`, label: `${m.plaintiff} v ${m.defendant}`, sublabel: `${m.matterRef}${m.caseNumber ? ` · ${m.caseNumber}` : ""} · Litigation`, group: "Matters", view: "litigation", icon: Scale });
      }
    }
    // Generic matters
    for (const m of matters) {
      if (hit(m.title, m.client, m.matterType)) {
        out.push({ id: `mat-${m.id}`, label: m.title, sublabel: `${m.client} · ${m.matterType}`, group: "Matters", view: "overview", icon: Home });
      }
    }
    // Invoices
    for (const inv of invoices) {
      if (hit(inv.invoiceNumber, inv.clientName)) {
        out.push({ id: `inv-${inv.id}`, label: inv.invoiceNumber || "Invoice", sublabel: `${inv.clientName} · ${money(inv.amountCents)} · ${inv.status}`, group: "Billing", view: "billing", icon: CircleDollarSign });
      }
    }
    // FICA clients
    for (const f of ficaClients) {
      if (hit(f.clientName, f.idNumber)) {
        out.push({ id: `fica-${f.id}`, label: f.clientName, sublabel: `FICA · ${f.ficaStatus} · ${f.riskRating} risk`, group: "Compliance", view: "fica", icon: ShieldCheck });
      }
    }
    // Contracts
    for (const c of contracts) {
      if (hit(c.name)) {
        out.push({ id: `draft-${c.id}`, label: c.name, sublabel: "Contract draft", group: "Documents", view: "drafting", icon: FilePenLine });
      }
    }
    return out.slice(0, 40);
  }, [query, nav, isVisible, matters, conveyancingMatters, litigationMatters, invoices, contracts, ficaClients]);

  useEffect(() => { setActive(0); }, [query]);

  function choose(r: Result | undefined) {
    if (!r) return;
    setActiveView(r.view);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  // Keep the active row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  // Group results for display while keeping a flat index for keyboard nav.
  let flatIdx = -1;
  const groups: { name: string; items: { r: Result; idx: number }[] }[] = [];
  for (const r of results) {
    flatIdx++;
    const g = groups.find(x => x.name === r.group);
    const entry = { r, idx: flatIdx };
    if (g) g.items.push(entry);
    else groups.push({ name: r.group, items: [entry] });
  }

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input-row">
          <Search size={18} className="cmdk-search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search matters, clients, invoices — or jump to a page…"
            className="cmdk-input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk-esc">ESC</kbd>
        </div>
        <div className="cmdk-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmdk-empty">No matches for "{query}"</div>
          ) : (
            groups.map(g => (
              <div key={g.name} className="cmdk-group">
                <div className="cmdk-group-label">{g.name}</div>
                {g.items.map(({ r, idx }) => {
                  const Icon = r.icon;
                  return (
                    <button
                      key={r.id}
                      data-idx={idx}
                      className={`cmdk-item${idx === active ? " active" : ""}`}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(r)}
                    >
                      <span className="cmdk-item-icon"><Icon size={16} /></span>
                      <span className="cmdk-item-text">
                        <span className="cmdk-item-label">{r.label}</span>
                        <span className="cmdk-item-sub">{r.sublabel}</span>
                      </span>
                      {idx === active && <CornerDownLeft size={14} className="cmdk-item-enter" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
