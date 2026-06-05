import { CheckCircle2, CreditCard, Shield, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";

type BillingStatus = {
  plan: string;
  planStatus: string;
  trialEndsAt: string;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plans: Record<string, { name: string; priceCents: number; priceId: string }>;
};

type Props = {
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("lawpath.auth.token") ?? "";
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const PLAN_META: Record<
  string,
  {
    icon: React.ReactNode;
    label: string;
    price: string;
    features: string[];
    highlight: boolean;
  }
> = {
  solo: {
    icon: <Shield size={22} />,
    label: "Solo",
    price: "R 799/month",
    features: ["1 user", "Matter management", "Billing & invoicing", "Client portal"],
    highlight: false,
  },
  practice: {
    icon: <Users size={22} />,
    label: "Practice",
    price: "R 2,499/month",
    features: [
      "Up to 5 users",
      "Trust account",
      "FICA / KYC compliance",
      "Conveyancing pipeline",
    ],
    highlight: true,
  },
  firm: {
    icon: <TrendingUp size={22} />,
    label: "Firm",
    price: "R 5,999/month",
    features: [
      "Unlimited users",
      "WhatsApp communications",
      "Practice analytics",
      "Accounting integration",
    ],
    highlight: false,
  },
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "trialing":
      return "pill" as const;
    case "active":
      return "pill" as const;
    case "past_due":
      return "pill" as const;
    case "canceled":
    case "cancelled":
      return "pill" as const;
    default:
      return "pill" as const;
  }
}

function statusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "trialing":
      return { background: "#fdf3dc", color: "#b8860b", fontWeight: 800 };
    case "active":
      return { background: "#e8f4ee", color: "#1f6f5b", fontWeight: 800 };
    case "past_due":
      return { background: "#fdf0f2", color: "#c0525f", fontWeight: 800 };
    case "canceled":
    case "cancelled":
      return { background: "#fdf0f2", color: "#c0525f", fontWeight: 800 };
    default:
      return { background: "#f0f2f0", color: "#6b7280", fontWeight: 800 };
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    trialing: "Trial",
    active: "Active",
    past_due: "Past due",
    canceled: "Cancelled",
    cancelled: "Cancelled",
    incomplete: "Incomplete",
    unpaid: "Unpaid",
  };
  return map[status] ?? status;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function StripeBilling({ showToast }: Props) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/billing/status");
        setStatus(data);
        const hasPlans = data.plans && Object.keys(data.plans).length > 0;
        setStripeConfigured(hasPlans);
      } catch {
        showToast("error", "Billing error", "Could not load billing status.");
        setStripeConfigured(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubscribe(planKey: string) {
    if (!status) return;
    setCheckoutLoading(planKey);
    try {
      const { checkoutUrl } = await apiFetch("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          plan: planKey,
          successUrl: window.location.href + "?billing=success",
          cancelUrl: window.location.href + "?billing=cancel",
        }),
      });
      window.location.href = checkoutUrl;
    } catch {
      showToast("error", "Checkout failed", "Could not start Stripe checkout. Please try again.");
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const { portalUrl } = await apiFetch("/api/billing/portal", { method: "POST" });
      window.location.href = portalUrl;
    } catch {
      showToast("error", "Portal error", "Could not open billing portal. Please try again.");
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="panel" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
        Loading billing…
      </div>
    );
  }

  const currentPlan = status?.plan ?? "none";
  const planStatus = status?.planStatus ?? "";

  return (
    <div className="tier1-section">
      {/* Stripe not configured notice */}
      {!stripeConfigured && (
        <div
          style={{
            borderLeft: "4px solid #b8860b",
            background: "#fdf9ec",
            padding: "14px 18px",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: "0.9rem",
          }}
        >
          <strong style={{ color: "#b8860b" }}>Stripe billing not configured.</strong> Set{" "}
          <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_PRICE_SOLO</code>,{" "}
          <code>STRIPE_PRICE_PRACTICE</code>, <code>STRIPE_PRICE_FIRM</code> in <code>.env</code>.
        </div>
      )}

      {/* Current plan banner */}
      {status && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CreditCard size={20} color="var(--green)" />
              <span style={{ fontWeight: 800, fontSize: "1rem" }}>Current subscription</span>
            </div>
            {status.stripeCustomerId && (
              <button
                className="ghost small"
                onClick={handlePortal}
                disabled={portalLoading}
              >
                {portalLoading ? "Redirecting…" : "Manage billing"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "1.1rem", textTransform: "capitalize" }}>
              {PLAN_META[currentPlan]?.label ?? currentPlan}
            </span>
            <span className={statusBadgeClass(planStatus)} style={statusBadgeStyle(planStatus)}>
              {statusLabel(planStatus)}
            </span>
            {planStatus === "trialing" && status.trialEndsAt && (
              <span style={{ color: "var(--muted)", fontSize: "0.87rem" }}>
                Trial ends {fmtDate(status.trialEndsAt)}
              </span>
            )}
            {planStatus === "active" && status.currentPeriodEnd && (
              <span style={{ color: "var(--muted)", fontSize: "0.87rem" }}>
                {status.cancelAtPeriodEnd
                  ? `Cancels ${fmtDate(status.currentPeriodEnd)}`
                  : `Renews ${fmtDate(status.currentPeriodEnd)}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Plan cards */}
      <p className="eyebrow" style={{ marginBottom: 12 }}>
        Available plans
      </p>
      <div
        className="metrics"
        style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 24 }}
      >
        {(["solo", "practice", "firm"] as const).map((planKey) => {
          const meta = PLAN_META[planKey];
          const isCurrent = currentPlan === planKey;
          return (
            <div
              key={planKey}
              className="metric"
              style={{
                border: isCurrent ? "2px solid var(--green)" : "1px solid var(--line)",
                borderRadius: 10,
                padding: "22px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
              }}
            >
              {meta.highlight && !isCurrent && (
                <span
                  className="pill"
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--green)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    padding: "3px 12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Most popular
                </span>
              )}
              {isCurrent && (
                <span
                  className="pill"
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--green)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    padding: "3px 12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Current plan
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--green)" }}>
                {meta.icon}
                <span style={{ fontWeight: 800, fontSize: "1rem" }}>{meta.label}</span>
              </div>
              <div>
                <span style={{ fontWeight: 900, fontSize: "1.4rem" }}>{meta.price}</span>
              </div>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {meta.features.map((f) => (
                  <li
                    key={f}
                    style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.87rem" }}
                  >
                    <CheckCircle2 size={14} color="var(--green)" style={{ flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button className="ghost small" disabled style={{ opacity: 0.55 }}>
                  Current plan
                </button>
              ) : (
                <button
                  className="primary small"
                  onClick={() => handleSubscribe(planKey)}
                  disabled={!!checkoutLoading || !stripeConfigured}
                >
                  {checkoutLoading === planKey ? "Redirecting…" : "Subscribe"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Manage billing button (for existing customers without banner) */}
      {status?.stripeCustomerId && (
        <div style={{ marginBottom: 20 }}>
          <button className="ghost" onClick={handlePortal} disabled={portalLoading}>
            <CreditCard size={16} />
            {portalLoading ? "Redirecting…" : "Manage billing & invoices"}
          </button>
        </div>
      )}

      {/* Stripe security notice */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          color: "var(--muted)",
          fontSize: "0.83rem",
          borderTop: "1px solid var(--line)",
          paddingTop: 16,
        }}
      >
        <Shield size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Payments are securely processed by Stripe. LawPath SA never stores card details. Pricing
          in ZAR including VAT.
        </span>
      </div>
    </div>
  );
}
