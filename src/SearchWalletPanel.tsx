import { AlertTriangle, CreditCard, History, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getSearchWallet, getSearchWalletLedger, setAutoTopup, topUpSearchWallet, SearchWallet, WalletLedgerEntry } from "./api";

type Props = {
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
  /** Bumped by the parent after a search, so the balance reflects the debit. */
  refreshKey?: number;
};

const money = (cents: number) => `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

const TOPUP_AMOUNTS = [25000, 50000, 100000, 250000];

const ENTRY_LABELS: Record<WalletLedgerEntry["entryType"], string> = {
  topup: "Top-up",
  search: "Search",
  refund: "Refund",
  adjustment: "Adjustment",
  opening: "Opening balance"
};

export function SearchWalletPanel({ showToast, refreshKey = 0 }: Props) {
  const [wallet, setWallet] = useState<SearchWallet | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getSearchWallet().then(setWallet).catch(() => setWallet(null));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (showLedger) getSearchWalletLedger().then(r => setLedger(r.entries)).catch(() => setLedger([]));
  }, [showLedger, refreshKey]);

  async function handleTopUp(amountCents: number) {
    setBusy(true);
    try {
      const res = await topUpSearchWallet(amountCents);
      // Yoco hosts the card form — we never see card details.
      window.location.href = res.checkoutUrl;
    } catch (err: unknown) {
      showToast("error", "Top-up failed", err instanceof Error ? err.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  if (!wallet) return null;

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-head">
        <h3><Wallet size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Search credit</h3>
        <button className="ghost small" onClick={() => setShowLedger(v => !v)}>
          <History size={14} /> {showLedger ? "Hide" : "Statement"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <strong style={{
          fontSize: "1.6rem",
          fontFamily: "var(--font-serif)",
          color: wallet.balanceCents < 0 ? "var(--rose)" : wallet.low ? "var(--gold)" : "var(--green)"
        }}>
          {money(wallet.balanceCents)}
        </strong>
        {wallet.low && (
          <span className="pill" style={{ background: "var(--gold-bg)", color: "var(--gold)" }}>
            <AlertTriangle size={11} style={{ verticalAlign: "-1px" }} /> low
          </span>
        )}
      </div>

      {wallet.balanceCents < 0 && (
        <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--rose)" }}>
          This is an amount owing for searches already run.
        </p>
      )}
      {!wallet.enforced && (
        <p style={{ margin: "8px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
          Searches are not yet blocked when this runs out — your balance shows what has been used.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {TOPUP_AMOUNTS.map(cents => (
          <button key={cents} className="ghost small" disabled={busy} onClick={() => handleTopUp(cents)}>
            {money(cents)}
          </button>
        ))}
        <button className="primary small" disabled={busy} onClick={() => handleTopUp(TOPUP_AMOUNTS[1])}>
          <CreditCard size={14} /> {busy ? "Opening…" : "Top up by card"}
        </button>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, fontSize: "0.85rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={wallet.autoTopupEnabled}
          disabled={busy}
          onChange={async (e) => {
            const enabled = e.target.checked;
            setBusy(true);
            try {
              setWallet(await setAutoTopup(enabled, wallet.autoTopupAmountCents));
              showToast("success", "Auto top-up", enabled ? "We'll email a ready-to-pay link when your credit runs low." : "Auto top-up off.");
            } catch (err: unknown) {
              showToast("error", "Auto top-up", err instanceof Error ? err.message : "Could not save.");
            } finally { setBusy(false); }
          }}
          // Sized explicitly: the global `input { width: 100% }` rule would
          // otherwise stretch this checkbox across the panel.
          style={{ width: 16, height: 16, flexShrink: 0, margin: "2px 0 0", padding: 0 }}
        />
        <span>
          Email me a {money(wallet.autoTopupAmountCents)} top-up link when credit runs low.
          <span style={{ display: "block", color: "var(--muted)", fontSize: "0.78rem", marginTop: 2 }}>
            One click to pay — we never store your card, and nothing is charged without you.
          </span>
        </span>
      </label>

      {showLedger && (
        <div style={{ marginTop: 16 }}>
          {ledger.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic", fontSize: "0.88rem" }}>
              No movements yet.
            </p>
          ) : (
            <table className="cipc-directors-table">
              <thead>
                <tr><th>Date</th><th>Description</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>Balance</th></tr>
              </thead>
              <tbody>
                {ledger.map(e => (
                  <tr key={e.id}>
                    <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(e.createdAt).toLocaleDateString("en-ZA")}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{ENTRY_LABELS[e.entryType]}</span>
                      {e.description && <span style={{ color: "var(--muted)" }}> · {e.description}</span>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap", color: e.amountCents < 0 ? "var(--rose)" : "var(--green)", fontWeight: 600 }}>
                      {e.amountCents < 0 ? "−" : "+"}{money(Math.abs(e.amountCents))}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap", color: "var(--muted)" }}>
                      {money(e.balanceAfterCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
