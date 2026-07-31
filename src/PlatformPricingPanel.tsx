import { useEffect, useState } from "react";
import { Percent, Save } from "lucide-react";
import { getPricingConfig, savePricingConfig } from "./api";

interface Props {
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}

// Stored as decimals (0.15 = 15%); the form exposes them as percentage strings.
export function PlatformPricingPanel({ showToast }: Props) {
  const [vatPct, setVatPct] = useState("15");
  const [markupPct, setMarkupPct] = useState("0");
  const [creditCostR, setCreditCostR] = useState("2.99");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getPricingConfig();
        setVatPct((cfg.vatRate * 100).toFixed(2).replace(/\.?0+$/, ""));
        setMarkupPct((cfg.markupRate * 100).toFixed(2).replace(/\.?0+$/, ""));
        setCreditCostR(((cfg.verifyNowCreditCostCents ?? 299) / 100).toFixed(2));
        setUpdatedAt(cfg.updatedAt || null);
      } catch (err) {
        showToast("error", "Could not load pricing", err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  async function handleSave() {
    const vatRate = Number(vatPct) / 100;
    const markupRate = Number(markupPct) / 100;
    const verifyNowCreditCostCents = Math.round(Number(creditCostR) * 100);
    if (!isFinite(vatRate)    || vatRate    < 0 || vatRate    > 1) { showToast("error", "Invalid VAT", "VAT must be between 0 and 100."); return; }
    if (!isFinite(markupRate) || markupRate < 0 || markupRate > 500) { showToast("error", "Invalid markup", "Markup must be between 0 and 500."); return; }
    if (!isFinite(verifyNowCreditCostCents) || verifyNowCreditCostCents < 0) { showToast("error", "Invalid credit cost", "Credit cost must be zero or more."); return; }
    setSaving(true);
    try {
      const saved = await savePricingConfig({ vatRate, markupRate, verifyNowCreditCostCents });
      setUpdatedAt(saved.updatedAt || new Date().toISOString());
      showToast("success", "Pricing updated", `VAT ${(saved.vatRate * 100).toFixed(2)}%, markup ${(saved.markupRate * 100).toFixed(2)}%`);
    } catch (err) {
      showToast("error", "Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // Worked examples at the rates above, using real current base costs: a
  // SearchWorks deeds search (priced per call) and a VerifyNow vehicle lookup
  // (10 credits, so it moves with the credit cost).
  const m = Number(markupPct) / 100 || 0;
  const v = Number(vatPct) / 100 || 0;
  const price = (baseR: number) => {
    const markup = baseR * m;
    const net = baseR + markup;
    const vat = net * v;
    return { base: baseR, markup, net, vat, total: net + vat };
  };
  const deeds = price(25.60);                                  // Deeds Office Search
  const plate = price(10 * (Number(creditCostR) || 0));        // VerifyNow vehicle = 10 credits

  return (
    <section className="rag-shell">
      <div className="panel-head">
        <div>
          <h2><Percent size={20} /> Pricing & margin</h2>
          <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
            VAT + platform markup applied to all external-provider usage. Used to compute the pay-per-search fee charged to tenants.
          </p>
        </div>
        {updatedAt && <small className="muted">Updated {new Date(updatedAt).toLocaleString("en-ZA")}</small>}
      </div>

      <div className="integration-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <article className="integration-card">
          <div className="integration-head">
            <Percent size={18} />
            <div>
              <strong>Rates</strong>
              <span>South Africa VAT is 15% standard. Markup is the platform's margin on top of provider cost + VAT.</span>
            </div>
          </div>
          <label>VAT rate (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={vatPct}
              onChange={(e) => setVatPct(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>Platform markup (%)
            <input
              type="number"
              min="0"
              max="500"
              step="0.01"
              value={markupPct}
              onChange={(e) => setMarkupPct(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>VerifyNow credit cost (R)
            <input
              type="number"
              min="0"
              step="0.01"
              value={creditCostR}
              onChange={(e) => setCreditCostR(e.target.value)}
              disabled={loading}
            />
          </label>
          <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
            R2.99 is VerifyNow&apos;s pay-as-you-go rate. Lower this after buying a volume credit pack so margin
            reporting reflects what you actually pay. SearchWorks prices per call, so it is unaffected.
          </p>
          <button className="primary small" onClick={handleSave} disabled={loading || saving} style={{ marginTop: 12 }}>
            <Save size={14} /> {saving ? "Saving…" : "Save rates"}
          </button>
        </article>

        <article className="integration-card">
          <div className="integration-head">
            <Percent size={18} />
            <div>
              <strong>Worked examples</strong>
              <span>What a firm pays, and what you keep, at the rates above.</span>
            </div>
          </div>
          <dl className="pricing-breakdown">
            <dt style={{ gridColumn: "1 / -1", fontWeight: 700 }}>Deeds Office Search (SearchWorks)</dt>
            <dt>Provider base cost</dt><dd>R {deeds.base.toFixed(2)}</dd>
            <dt>+ Markup ({markupPct}%)</dt><dd>R {deeds.markup.toFixed(2)}</dd>
            <dt>+ VAT ({vatPct}%)</dt><dd>R {deeds.vat.toFixed(2)}</dd>
            <dt className="pricing-total-key">Firm pays</dt>
            <dd className="pricing-total-val">R {deeds.total.toFixed(2)}</dd>
            <dt>Your margin</dt><dd>R {deeds.markup.toFixed(2)}</dd>

            <dt style={{ gridColumn: "1 / -1", fontWeight: 700, paddingTop: 10 }}>Vehicle lookup (VerifyNow, 10 credits)</dt>
            <dt>Provider base cost</dt><dd>R {plate.base.toFixed(2)}</dd>
            <dt>+ Markup ({markupPct}%)</dt><dd>R {plate.markup.toFixed(2)}</dd>
            <dt>+ VAT ({vatPct}%)</dt><dd>R {plate.vat.toFixed(2)}</dd>
            <dt className="pricing-total-key">Firm pays</dt>
            <dd className="pricing-total-val">R {plate.total.toFixed(2)}</dd>
            <dt>Your margin</dt><dd>R {plate.markup.toFixed(2)}</dd>
          </dl>
          <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
            <code>charge = base × (1 + markup) × (1 + VAT)</code>, applied to VerifyNow and SearchWorks alike.
            A change here prices FUTURE searches only — searches already run keep the price they were charged at,
            so an invoice already sent to a client never moves.
          </p>
        </article>
      </div>
    </section>
  );
}
