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
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getPricingConfig();
        setVatPct((cfg.vatRate * 100).toFixed(2).replace(/\.?0+$/, ""));
        setMarkupPct((cfg.markupRate * 100).toFixed(2).replace(/\.?0+$/, ""));
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
    if (!isFinite(vatRate)    || vatRate    < 0 || vatRate    > 1) { showToast("error", "Invalid VAT", "VAT must be between 0 and 100."); return; }
    if (!isFinite(markupRate) || markupRate < 0 || markupRate > 500) { showToast("error", "Invalid markup", "Markup must be between 0 and 500."); return; }
    setSaving(true);
    try {
      const saved = await savePricingConfig({ vatRate, markupRate });
      setUpdatedAt(saved.updatedAt || new Date().toISOString());
      showToast("success", "Pricing updated", `VAT ${(saved.vatRate * 100).toFixed(2)}%, markup ${(saved.markupRate * 100).toFixed(2)}%`);
    } catch (err) {
      showToast("error", "Save failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // Worked example using R 22.80 (DeedsOfficeSearch base rate)
  const baseR = 22.80;
  const vatR = baseR * (Number(vatPct) / 100 || 0);
  const subtotalR = baseR + vatR;
  const markupR = subtotalR * (Number(markupPct) / 100 || 0);
  const finalR = subtotalR + markupR;

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
          <button className="primary small" onClick={handleSave} disabled={loading || saving} style={{ marginTop: 12 }}>
            <Save size={14} /> {saving ? "Saving…" : "Save rates"}
          </button>
        </article>

        <article className="integration-card">
          <div className="integration-head">
            <Percent size={18} />
            <div>
              <strong>Worked example</strong>
              <span>SearchWorks DeedsOfficeSearch base rate at the rates above.</span>
            </div>
          </div>
          <dl className="pricing-breakdown">
            <dt>Provider base cost</dt><dd>R {baseR.toFixed(2)}</dd>
            <dt>+ VAT ({vatPct}%)</dt><dd>R {vatR.toFixed(2)}</dd>
            <dt>Subtotal (base + VAT)</dt><dd>R {subtotalR.toFixed(2)}</dd>
            <dt>+ Platform markup ({markupPct}%)</dt><dd>R {markupR.toFixed(2)}</dd>
            <dt className="pricing-total-key">Tenant pay-per-search</dt>
            <dd className="pricing-total-val">R {finalR.toFixed(2)}</dd>
          </dl>
          <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
            Formula: <code>tenant_charge = base × (1 + VAT) × (1 + markup)</code>. Currently applied to SearchWorks usage (and Voca when wired). VerifyNow + Lightstone need per-call cost tracking before markup applies.
          </p>
        </article>
      </div>
    </section>
  );
}
