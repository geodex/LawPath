import { useEffect, useState } from "react";
import {
  AlertTriangle, Banknote, Gavel, Home, Landmark, Receipt, RefreshCw,
  Shield, Sparkles, Sun, CheckCircle2, ArrowRight
} from "lucide-react";
import { getTodayBrief } from "./api";
import type { TodayBrief, TodayItem, ViewKey } from "./types";

const ICONS: Record<string, React.ElementType> = {
  gavel: Gavel, landmark: Landmark, receipt: Receipt,
  home: Home, shield: Shield, banknote: Banknote
};

const SEVERITY_ORDER: TodayItem["severity"][] = ["critical", "warning", "info"];
const SEVERITY_LABELS: Record<TodayItem["severity"], string> = {
  critical: "Needs action now",
  warning: "This week",
  info: "On the radar"
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

interface Props {
  userName?: string;
  setActiveView: (view: ViewKey) => void;
}

export function Today({ userName, setActiveView }: Props) {
  const [data, setData] = useState<TodayBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await getTodayBrief();
      setData(res);
    } catch {
      setData({ items: [], counts: { critical: 0, warning: 0, info: 0, total: 0 }, brief: null, generatedAt: new Date().toISOString() });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const firstName = (userName || "").trim().split(/\s+/)[0] || "";

  return (
    <div className="today-view">
      <section className="today-hero">
        <div>
          <p className="eyebrow"><Sun size={14} style={{ display: "inline", marginRight: 5 }} />{new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h2>{greeting()}{firstName ? `, ${firstName}` : ""}.</h2>
          {data && data.counts.total > 0 ? (
            <p className="today-hero-sub">
              {data.counts.critical > 0 && <><strong className="today-count-critical">{data.counts.critical}</strong> need{data.counts.critical === 1 ? "s" : ""} action now · </>}
              {data.counts.warning > 0 && <><strong className="today-count-warning">{data.counts.warning}</strong> this week · </>}
              <strong>{data.counts.total}</strong> item{data.counts.total === 1 ? "" : "s"} on your desk
            </p>
          ) : !loading ? (
            <p className="today-hero-sub">Nothing urgent on your desk. A clear runway.</p>
          ) : (
            <p className="today-hero-sub">Reviewing your matters…</p>
          )}
        </div>
        <button className="ghost small" onClick={load} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? "spin" : ""} /> {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </section>

      {data?.brief && (
        <section className="today-brief">
          <p className="eyebrow"><Sparkles size={14} style={{ display: "inline", marginRight: 5 }} />Your brief</p>
          <p>{data.brief}</p>
        </section>
      )}

      {loading ? (
        <div className="today-loading"><RefreshCw size={20} className="spin" /><span>Gathering deadlines, clearances and unbilled work…</span></div>
      ) : data && data.items.length === 0 ? (
        <div className="today-empty">
          <CheckCircle2 size={40} />
          <h3>You're on top of everything</h3>
          <p>No overdue deadlines, expiring clearances, FICA renewals or aged WIP. When something needs you, it'll appear here first.</p>
        </div>
      ) : (
        SEVERITY_ORDER.map(sev => {
          const group = (data?.items || []).filter(i => i.severity === sev);
          if (!group.length) return null;
          return (
            <section key={sev} className={`today-group today-group-${sev}`}>
              <h3 className="today-group-head">
                {sev === "critical" && <AlertTriangle size={16} />}
                {SEVERITY_LABELS[sev]}
                <span className="today-group-count">{group.length}</span>
              </h3>
              <div className="today-cards">
                {group.map(item => {
                  const Icon = ICONS[item.icon] || AlertTriangle;
                  return (
                    <button key={item.id} className={`today-card today-card-${sev}`} onClick={() => setActiveView(item.view)}>
                      <div className="today-card-icon"><Icon size={18} /></div>
                      <div className="today-card-body">
                        <div className="today-card-title">{item.title}</div>
                        <div className="today-card-detail">{item.detail}</div>
                      </div>
                      <div className="today-card-meta">
                        {item.dueLabel && <span className={`today-due today-due-${sev}`}>{item.dueLabel}</span>}
                        <ArrowRight size={14} className="today-card-arrow" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
