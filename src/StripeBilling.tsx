// StripeBilling.tsx → Yoco billing (ZAR-native South African payment gateway)
// Replicated from geodex/SpellGameKit production Yoco integration.

import { CheckCircle2, CreditCard, ExternalLink, Shield } from "lucide-react";
import { useEffect, useState } from "react";

const TOKEN_KEY = "lawpath.auth.token";

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const res = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(options.headers || {}) } });
  return res.json();
}

type BillingStatus = {
  plan: string;
  planStatus: string;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  yocoConfigured: boolean;
  plans: Record<string, { name: string; priceCents: number; maxUsers: number }>;
};

const PLAN_FEATURES: Record<string, string[]> = {
  solo: [
    "1 user account",
    "All matter types (conveyancing, litigation, commercial)",
    "Trust account ledger",
    "FICA/KYC compliance",
    "Client portal",
    "AI legal assistant",
    "e-Signature (5 requests/month)"
  ],
  practice: [
    "Up to 5 user accounts",
    "Everything in Solo",
    "Time recording & WIP management",
    "POPIA compliance centre",
    "Conveyancing pipeline",
    "Practice analytics",
    "SAFLII corpus access",
    "Email notifications",
    "e-Signature (unlimited)"
  ],
  firm: [
    "Unlimited users",
    "Everything in Practice",
    "WhatsApp Business integration",
    "Estate agent referral network",
    "Accounting integration (Sage Pastel, Xero)",
    "SAFLII + legislation corpus (full)",
    "Custom AI training (firm precedents)",
    "Priority support",
    "PDF document generation"
  ]
};

const STATUS_LABEL: Record<string, { label: string; colour: string }> = {
  trialing: { label: "Free trial",       colour: "var(--gold)"  },
  active:   { label: "Active",           colour: "var(--green)" },
  past_due: { label: "Payment overdue",  colour: "var(--rose)"  },
  cancelled:{ label: "Cancelled",        colour: "var(--rose)"  },
  paused:   { label: "Paused",           colour: "var(--muted)" },
  trial:    { label: "Free trial",       colour: "var(--gold)"  }
};

export function StripeBilling({ showToast }: { showToast: (type: "success" | "error" | "info", title: string, msg: string) => void }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/billing/status")
      .then(data => setStatus(data))
      .catch(() => showToast("error", "Billing error", "Could not load billing status."))
      .finally(() => setLoading(false));

    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      showToast("success", "Subscription activated", "Welcome to LawPath SA. Your subscription is now active.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("billing") === "cancelled") {
      showToast("info", "Checkout cancelled", "Your subscription was not changed.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleSubscribe(plan: string) {
    if (!status?.yocoConfigured) {
      showToast("error", "Yoco not configured", "Set YOCO_SECRET_KEY in .env then restart the API.");
      return;
    }
    setCheckingOut(plan);
    try {
      const data = await apiFetch("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        showToast("error", "Checkout failed", data.error || "Could not create Yoco checkout session.");
      }
    } catch {
      showToast("error", "Checkout error", "Could not reach billing server.");
    } finally {
      setCheckingOut(null);
    }
  }

  const currentPlan = status?.plan || "trial";
  const planStatus = status?.planStatus || "trialing";
  const statusStyle = STATUS_LABEL[planStatus] ?? STATUS_LABEL.trialing;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading billing...</div>;

  return (
    <>
      {/* Current plan banner */}
      <section className="panel tier1-section">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Current subscription</p>
            <h3 style={{ margin: 0 }}>
              {status?.plans?.[currentPlan]?.name ?? "Free trial"}
              {status?.plans?.[currentPlan]?.priceCents
                ? <span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--muted)", marginLeft: 10 }}>R {((status.plans[currentPlan].priceCents) / 100).toLocaleString("en-ZA")}/month</span>
                : null}
            </h3>
          </div>
          <span className="pill" style={{ background: `${statusStyle.colour}22`, color: statusStyle.colour, fontWeight: 800 }}>
            {statusStyle.label}
          </span>
        </div>
        <div style={{ fontSize: "0.87rem", color: "var(--muted)" }}>
          {status?.trialEndsAt && planStatus === "trialing" && (
            <span>Trial ends: {new Date(status.trialEndsAt).toLocaleDateString("en-ZA")}</span>
          )}
          {status?.currentPeriodEnd && planStatus === "active" && (
            <span>Next renewal: {new Date(status.currentPeriodEnd).toLocaleDateString("en-ZA")}</span>
          )}
        </div>
        {planStatus === "past_due" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#fdf0f2", border: "1px solid var(--rose)", borderRadius: 8, fontSize: "0.87rem", color: "var(--rose)" }}>
            ⚠ Your last payment failed. Please re-subscribe to avoid service interruption.
          </div>
        )}
      </section>

      {/* Yoco not configured warning */}
      {!status?.yocoConfigured && (
        <div style={{ padding: "14px 18px", background: "#fdf9ec", borderLeft: "4px solid var(--gold)", borderRadius: 8, marginBottom: 18, fontSize: "0.87rem" }}>
          <strong>Yoco not configured</strong>
          <p style={{ margin: "6px 0 0" }}>Add these to your <code>.env</code> file and restart the API:</p>
          <pre style={{ margin: "8px 0 0", fontSize: "0.83rem", background: "#f8f4e4", padding: "8px 12px", borderRadius: 6 }}>{`YOCO_SECRET_KEY=sk_live_...\nYOCO_WEBHOOK_SECRET=whsec_...`}</pre>
          <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
            Get your keys: <strong>Yoco App → Sales → Payment Gateways</strong>.
            Register webhook at <strong>payments.yoco.com/api/webhooks</strong> → <code>/api/billing/webhook</code>.
          </p>
        </div>
      )}

      {/* Plan cards */}
      <section className="tier1-section">
        <p className="eyebrow">Choose a plan — all prices in ZAR</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {(["solo", "practice", "firm"] as const).map(planKey => {
            const planData = status?.plans?.[planKey];
            const isCurrent = currentPlan === planKey && planStatus === "active";
            return (
              <div key={planKey} style={{
                border: `2px solid ${isCurrent ? "var(--green)" : planKey === "practice" ? "var(--gold)" : "var(--line)"}`,
                borderRadius: 12, padding: "22px 20px",
                background: isCurrent ? "linear-gradient(135deg,#f0fdf4,#eaf1ed)" : "var(--panel)",
                position: "relative"
              }}>
                {isCurrent && (
                  <span style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--green)", color: "#fff", padding: "2px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                    Current plan
                  </span>
                )}
                {planKey === "practice" && !isCurrent && (
                  <span style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--gold)", color: "#fff", padding: "2px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                    Most popular
                  </span>
                )}
                <h3 style={{ margin: "0 0 4px", color: "var(--green-dark)" }}>{planData?.name ?? planKey}</h3>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: "var(--green)", margin: "8px 0" }}>
                  R {((planData?.priceCents ?? 0) / 100).toLocaleString("en-ZA")}
                  <span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--muted)" }}>/month</span>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 14 }}>
                  {planKey === "solo" ? "Sole practitioner" : planKey === "practice" ? "Up to 5 attorneys" : "Unlimited users"} · ZAR incl. VAT
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", display: "grid", gap: 6 }}>
                  {(PLAN_FEATURES[planKey] ?? []).map(f => (
                    <li key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.85rem" }}>
                      <CheckCircle2 size={14} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <button className="ghost small" style={{ width: "100%" }} disabled>Current plan</button>
                ) : (
                  <button className="primary" style={{ width: "100%" }}
                    disabled={!status?.yocoConfigured || checkingOut === planKey}
                    onClick={() => handleSubscribe(planKey)}>
                    <CreditCard size={16} />
                    {checkingOut === planKey ? "Opening Yoco..." : `Subscribe — R ${((planData?.priceCents ?? 0) / 100).toLocaleString("en-ZA")}/mo`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {planStatus === "active" && (
        <section className="tier1-section panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>Manage payments</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.87rem", color: "var(--muted)" }}>View history, update card or cancel via the Yoco dashboard.</p>
          </div>
          <a href="https://payments.yoco.com/" target="_blank" rel="noreferrer noopener" className="ghost small" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <ExternalLink size={14} /> Yoco dashboard
          </a>
        </section>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 18px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, fontSize: "0.83rem", color: "var(--muted)" }}>
        <Shield size={16} style={{ color: "var(--green)", flexShrink: 0, marginTop: 1 }} />
        <span>
          Payments processed by <strong>Yoco</strong> — South Africa's leading payment gateway. LawPath SA never stores card details.
          All amounts in ZAR including VAT. Yoco is PCI-DSS compliant and regulated by the SARB.
        </span>
      </div>
    </>
  );
}
