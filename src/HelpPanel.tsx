import * as Lucide from "lucide-react";
import { ReactElement, useMemo, useState } from "react";
import { HELP_TOPICS } from "./help/index";
import type { HelpTopic } from "./help/types";

type Props = {
  open: boolean;
  onClose: () => void;
};

function resolveIcon(name: string, size = 16): ReactElement {
  const C = (Lucide as unknown as Record<string, React.ComponentType<{ size?: number }>>)[name];
  if (!C) return <Lucide.Circle size={size} />;
  return <C size={size} />;
}

export function HelpPanel({ open, onClose }: Props) {
  const [activeId, setActiveId] = useState<string>(HELP_TOPICS[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_TOPICS;
    return HELP_TOPICS.filter((t) => {
      if (t.title.toLowerCase().includes(q)) return true;
      if (t.summary.toLowerCase().includes(q)) return true;
      return t.sections.some(
        (s) =>
          s.heading.toLowerCase().includes(q) ||
          (s.body || []).some((p) => p.toLowerCase().includes(q)) ||
          (s.steps || []).some((p) => p.toLowerCase().includes(q)) ||
          (s.tip || "").toLowerCase().includes(q)
      );
    });
  }, [query]);

  const active: HelpTopic | undefined = useMemo(
    () => filteredTopics.find((t) => t.id === activeId) ?? filteredTopics[0],
    [filteredTopics, activeId]
  );

  if (!open) return null;

  return (
    <div className="modal-overlay help-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <div>
            <p className="eyebrow">LawPath SA</p>
            <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Help &amp; Documentation</h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.88rem" }}>
              Click a feature on the left to learn how it works.
            </p>
          </div>
          <button className="ghost small" onClick={onClose} aria-label="Close help">
            <Lucide.X size={18} />
          </button>
        </div>

        <div className="help-body">
          <aside className="help-sidebar">
            <label className="help-search">
              <Lucide.Search size={14} />
              <input
                type="text"
                placeholder="Search help…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <nav className="help-nav">
              {filteredTopics.length === 0 && (
                <p className="help-empty">No topics match "{query}".</p>
              )}
              {filteredTopics.map((topic) => (
                <button
                  key={topic.id}
                  className={`help-nav-item${active?.id === topic.id ? " active" : ""}`}
                  onClick={() => setActiveId(topic.id)}
                >
                  {resolveIcon(topic.icon, 15)}
                  <span>{topic.title}</span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="help-content">
            {active ? (
              <>
                <header className="help-content-head">
                  <span className="help-content-icon">{resolveIcon(active.icon, 22)}</span>
                  <div>
                    <h3 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "1.5rem" }}>
                      {active.title}
                    </h3>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.92rem", lineHeight: 1.5 }}>
                      {active.summary}
                    </p>
                  </div>
                </header>

                {active.sections.map((section, idx) => (
                  <article key={idx} className="help-section">
                    <h4>{section.heading}</h4>
                    {(section.body || []).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {section.steps && section.steps.length > 0 && (
                      <ol className="help-steps">
                        {section.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    )}
                    {section.tip && (
                      <aside className="help-tip">
                        <Lucide.Lightbulb size={14} />
                        <span>{section.tip}</span>
                      </aside>
                    )}
                  </article>
                ))}
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
