import { CheckCheck, MessageSquare, Phone, Plus, Send, UserCheck, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { createWhatsAppContact, sendWhatsAppMessage } from "./api";
import type { WhatsAppContact, WhatsAppMessage, WhatsAppTemplate } from "./types";

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const formatTime = (iso: string) => iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "";

interface Props {
  contacts: WhatsAppContact[];
  setContacts: React.Dispatch<React.SetStateAction<WhatsAppContact[]>>;
  messages: WhatsAppMessage[];
  setMessages: React.Dispatch<React.SetStateAction<WhatsAppMessage[]>>;
  templates: WhatsAppTemplate[];
  log: (msg: string) => void;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
}

const categoryColour = (cat: WhatsAppTemplate["category"]): React.CSSProperties => {
  switch (cat) {
    case "transfer_update":
    case "bond_update":
      return { background: "#d1fae5", color: "#065f46" };
    case "appointment_reminder":
    case "payment_reminder":
      return { background: "#dbeafe", color: "#1e40af" };
    case "fica_request":
      return { background: "#ffe4e6", color: "#9f1239" };
    default:
      return { background: "#f3f4f6", color: "#6b7280" };
  }
};

const StatusIcon = ({ status }: { status: WhatsAppMessage["status"] }) => {
  if (status === "sent") return <span title="Sent" style={{ fontSize: "11px", color: "#6b7280" }}>✓</span>;
  if (status === "delivered") return <span title="Delivered" style={{ fontSize: "11px", color: "#6b7280" }}>✓✓</span>;
  if (status === "read") return <span title="Read" style={{ fontSize: "11px", color: "#3b82f6" }}>✓✓</span>;
  if (status === "failed") return <span title="Failed" style={{ fontSize: "11px", color: "#f43f5e" }}>✗</span>;
  return <span title="Queued" style={{ fontSize: "11px", color: "#9ca3af" }}>⏱</span>;
};

export function WhatsAppComms({ contacts, setContacts, messages, setMessages, templates, log, showToast }: Props) {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [sendTab, setSendTab] = useState<"template" | "custom">("template");

  // Add contact form state
  const [newClientName, setNewClientName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newMatterRef, setNewMatterRef] = useState("");
  const [newOptIn, setNewOptIn] = useState(false);
  const [addingContact, setAddingContact] = useState(false);

  // Template send state
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [templateVarValues, setTemplateVarValues] = useState<Record<string, string>>({});
  const [sendingTemplate, setSendingTemplate] = useState(false);

  // Custom send state
  const [customBody, setCustomBody] = useState("");
  const [sendingCustom, setSendingCustom] = useState(false);

  const today = new Date().toDateString();
  const totalContacts = contacts.length;
  const optedIn = contacts.filter(c => c.optIn).length;
  const sentToday = messages.filter(m => m.direction === "outbound" && new Date(m.sentAt).toDateString() === today).length;
  const undelivered = messages.filter(m => m.status === "failed").length;

  const selectedContact = contacts.find(c => c.id === selectedContactId) ?? null;
  const contactMessages = messages.filter(m => m.contactId === selectedContactId);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;

  const handleAddContact = async (e: FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim() || !newPhone.trim()) return;
    setAddingContact(true);
    try {
      const result = await createWhatsAppContact({
        clientName: newClientName.trim(),
        phoneNumber: newPhone.trim(),
        matterRef: newMatterRef.trim(),
        optIn: newOptIn,
        optInDate: newOptIn ? new Date().toISOString() : "",
      });
      setContacts(prev => [...prev, result.contact]);
      log(`WhatsApp contact added: ${result.contact.clientName}`);
      showToast("success", "Contact added", `${result.contact.clientName} has been added.`);
    } catch {
      // Simulate locally if API not configured
      const contact: WhatsAppContact = {
        id: uid("CTT"),
        clientName: newClientName.trim(),
        phoneNumber: newPhone.trim(),
        matterRef: newMatterRef.trim(),
        optIn: newOptIn,
        optInDate: newOptIn ? new Date().toISOString() : "",
      };
      setContacts(prev => [...prev, contact]);
      log(`WhatsApp contact created locally: ${contact.clientName}`);
      showToast("info", "Contact added locally", "Configure WhatsApp API in Settings to sync contacts.");
    } finally {
      setAddingContact(false);
      setNewClientName("");
      setNewPhone("");
      setNewMatterRef("");
      setNewOptIn(false);
      setShowAddForm(false);
    }
  };

  const handleSendTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !selectedTemplate) return;
    setSendingTemplate(true);

    let body = selectedTemplate.body;
    for (const v of selectedTemplate.variables) {
      const val = templateVarValues[v] ?? `{{${v}}}`;
      body = body.replace(`{{${v}}}`, val);
    }

    try {
      const result = await sendWhatsAppMessage({
        contactId: selectedContact.id,
        messageBody: body,
        templateId: selectedTemplate.id,
        matterRef: selectedContact.matterRef,
      });
      setMessages(prev => [...prev, result.message]);
      log(`WhatsApp template sent to ${selectedContact.clientName}`);
      showToast("success", "Message sent", `Template sent to ${selectedContact.clientName}.`);
    } catch {
      const msg: WhatsAppMessage = {
        id: uid("MSG"),
        contactId: selectedContact.id,
        clientName: selectedContact.clientName,
        phoneNumber: selectedContact.phoneNumber,
        matterRef: selectedContact.matterRef,
        direction: "outbound",
        messageBody: body,
        templateId: selectedTemplate.id,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, msg]);
      log(`WhatsApp template simulated to ${selectedContact.clientName}`);
      showToast("info", "Message simulated", "Configure WhatsApp API in Settings to send live messages.");
    } finally {
      setSendingTemplate(false);
      setTemplateVarValues({});
    }
  };

  const handleSendCustom = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedContact || !customBody.trim()) return;
    setSendingCustom(true);
    try {
      const result = await sendWhatsAppMessage({
        contactId: selectedContact.id,
        messageBody: customBody.trim(),
        matterRef: selectedContact.matterRef,
      });
      setMessages(prev => [...prev, result.message]);
      log(`WhatsApp custom message sent to ${selectedContact.clientName}`);
      showToast("success", "Message sent", `Message sent to ${selectedContact.clientName}.`);
    } catch {
      const msg: WhatsAppMessage = {
        id: uid("MSG"),
        contactId: selectedContact.id,
        clientName: selectedContact.clientName,
        phoneNumber: selectedContact.phoneNumber,
        matterRef: selectedContact.matterRef,
        direction: "outbound",
        messageBody: customBody.trim(),
        templateId: "",
        status: "sent",
        sentAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, msg]);
      log(`WhatsApp custom message simulated to ${selectedContact.clientName}`);
      showToast("info", "Message simulated", "Configure WhatsApp API in Settings to send live messages.");
    } finally {
      setSendingCustom(false);
      setCustomBody("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. Notice banner */}
      <div style={{
        background: "#f0fdf4",
        border: "1px solid #86efac",
        borderRadius: "8px",
        padding: "14px 18px",
        color: "#166534",
        fontSize: "13.5px",
        lineHeight: "1.5",
      }}>
        <strong>WhatsApp Business</strong> integration uses the official WhatsApp Cloud API (Meta) or Clickatell.
        Configure your API credentials under <strong>Settings → API Keys</strong>. All messages are logged for{" "}
        <strong>POPIA compliance</strong>. Client opt-in is required before sending.
      </div>

      {/* 2. Metrics */}
      <div className="metrics">
        <div className="metric">
          <span className="eyebrow">Total contacts</span>
          <span style={{ fontSize: "28px", fontWeight: 700 }}>{totalContacts}</span>
        </div>
        <div className="metric">
          <span className="eyebrow">Opted-in contacts</span>
          <span style={{ fontSize: "28px", fontWeight: 700, color: "#16a34a" }}>{optedIn}</span>
        </div>
        <div className="metric">
          <span className="eyebrow">Messages sent today</span>
          <span style={{ fontSize: "28px", fontWeight: 700 }}>{sentToday}</span>
        </div>
        <div className="metric">
          <span className="eyebrow">Undelivered (failed)</span>
          <span style={{ fontSize: "28px", fontWeight: 700, color: "#f43f5e" }}>{undelivered}</span>
        </div>
      </div>

      {/* 3. Two-column layout */}
      <div className="grid-two" style={{ alignItems: "flex-start" }}>
        {/* LEFT: Contact list + Add contact */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="panel-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
              <UserCheck size={16} /> Contacts
            </span>
            <button
              className="ghost small"
              onClick={() => setShowAddForm(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              {showAddForm ? <X size={14} /> : <Plus size={14} />}
              {showAddForm ? "Cancel" : "Add contact"}
            </button>
          </div>

          {showAddForm && (
            <form className="form inline-form-toggle" onSubmit={handleAddContact} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
              <div className="form-row">
                <label style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>Client name *</label>
                <input
                  className="small"
                  type="text"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="Full name"
                  required
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                />
              </div>
              <div className="form-row">
                <label style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>Phone number *</label>
                <input
                  className="small"
                  type="text"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="+27"
                  required
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                />
              </div>
              <div className="form-row">
                <label style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>Matter ref</label>
                <input
                  className="small"
                  type="text"
                  value={newMatterRef}
                  onChange={e => setNewMatterRef(e.target.value)}
                  placeholder="e.g. MAT-2026-001"
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                />
              </div>
              <div className="form-row" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  id="optIn"
                  checked={newOptIn}
                  onChange={e => setNewOptIn(e.target.checked)}
                />
                <label htmlFor="optIn" style={{ fontSize: "13px", color: "#374151" }}>Client has opted in to WhatsApp communications</label>
              </div>
              <button
                className="primary small"
                type="submit"
                disabled={addingContact}
                style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "4px" }}
              >
                <Plus size={13} /> {addingContact ? "Adding…" : "Add contact"}
              </button>
            </form>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "420px", overflowY: "auto" }}>
            {contacts.length === 0 && (
              <p style={{ fontSize: "13px", color: "#9ca3af", padding: "12px 0" }}>No contacts yet. Add one above.</p>
            )}
            {contacts.map(c => (
              <div
                key={c.id}
                onClick={() => setSelectedContactId(c.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  border: selectedContactId === c.id ? "2px solid #16a34a" : "1px solid #e5e7eb",
                  background: selectedContactId === c.id ? "#f0fdf4" : "#fff",
                  transition: "border 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{c.clientName}</span>
                  {c.optIn
                    ? <span className="pill" style={{ background: "#d1fae5", color: "#065f46", fontSize: "11px", padding: "2px 7px", borderRadius: "99px" }}>Opted in</span>
                    : <span className="pill" style={{ background: "#f3f4f6", color: "#9ca3af", fontSize: "11px", padding: "2px 7px", borderRadius: "99px" }}>No opt-in</span>
                  }
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#6b7280" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><Phone size={11} /> {c.phoneNumber}</span>
                  {c.matterRef && <span style={{ display: "flex", alignItems: "center", gap: "3px" }}><MessageSquare size={11} /> {c.matterRef}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Message thread + Send panel */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          <div className="panel-head" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <MessageSquare size={16} />
            {selectedContact ? `${selectedContact.clientName} — ${selectedContact.phoneNumber}` : "Conversation"}
          </div>

          {/* Thread */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "420px", padding: "12px", background: "#fafafa", borderRadius: "8px", border: "1px solid #e5e7eb", marginBottom: "12px" }}>
            {!selectedContact && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", color: "#9ca3af", gap: "8px" }}>
                <MessageSquare size={32} />
                <span style={{ fontSize: "14px" }}>Select a contact to view conversation</span>
              </div>
            )}
            {selectedContact && contactMessages.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "120px", color: "#9ca3af", fontSize: "13px" }}>
                No messages yet. Send the first message below.
              </div>
            )}
            {contactMessages.map(m => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignSelf: m.direction === "outbound" ? "flex-end" : "flex-start",
                  maxWidth: "72%",
                }}
              >
                <div style={
                  m.direction === "outbound"
                    ? { background: "#dcf8c6", alignSelf: "flex-end", borderRadius: "12px 12px 4px 12px", padding: "10px 14px", maxWidth: "72%" }
                    : { background: "#f0f0f0", alignSelf: "flex-start", borderRadius: "12px 12px 12px 4px", padding: "10px 14px", maxWidth: "72%" }
                }>
                  <p style={{ margin: 0, fontSize: "13.5px", lineHeight: "1.45", whiteSpace: "pre-wrap" }}>{m.messageBody}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "flex-end", marginTop: "4px" }}>
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>{formatTime(m.sentAt)}</span>
                    {m.direction === "outbound" && <StatusIcon status={m.status} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Send panel */}
          {selectedContact && (
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
              {!selectedContact.optIn && (
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "6px", padding: "8px 12px", fontSize: "12.5px", color: "#92400e", marginBottom: "10px" }}>
                  This contact has not opted in. Obtain consent before sending messages.
                </div>
              )}

              {/* Tabs */}
              <div className="popia-tabs" style={{ display: "flex", gap: "2px", marginBottom: "12px", borderBottom: "1px solid #e5e7eb" }}>
                <button
                  className={`popia-tab${sendTab === "template" ? " active" : ""}`}
                  onClick={() => setSendTab("template")}
                  style={{
                    padding: "6px 14px",
                    fontSize: "13px",
                    fontWeight: sendTab === "template" ? 600 : 400,
                    background: "none",
                    border: "none",
                    borderBottom: sendTab === "template" ? "2px solid #16a34a" : "2px solid transparent",
                    cursor: "pointer",
                    color: sendTab === "template" ? "#16a34a" : "#6b7280",
                  }}
                >
                  Template
                </button>
                <button
                  className={`popia-tab${sendTab === "custom" ? " active" : ""}`}
                  onClick={() => setSendTab("custom")}
                  style={{
                    padding: "6px 14px",
                    fontSize: "13px",
                    fontWeight: sendTab === "custom" ? 600 : 400,
                    background: "none",
                    border: "none",
                    borderBottom: sendTab === "custom" ? "2px solid #16a34a" : "2px solid transparent",
                    cursor: "pointer",
                    color: sendTab === "custom" ? "#16a34a" : "#6b7280",
                  }}
                >
                  Custom
                </button>
              </div>

              {sendTab === "template" && (
                <form className="form" onSubmit={handleSendTemplate} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className="form-row">
                    <label style={{ fontSize: "12px", fontWeight: 500, color: "#374151" }}>Template</label>
                    <select
                      value={selectedTemplateId}
                      onChange={e => {
                        setSelectedTemplateId(e.target.value);
                        setTemplateVarValues({});
                      }}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                    >
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  {selectedTemplate && (
                    <>
                      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#374151", lineHeight: "1.5" }}>
                        {selectedTemplate.body}
                      </div>
                      {selectedTemplate.variables.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Fill in variables</span>
                          {selectedTemplate.variables.map(v => (
                            <div key={v} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "12px", color: "#6b7280", minWidth: "110px", fontFamily: "monospace" }}>{`{{${v}}}`}</span>
                              <input
                                type="text"
                                placeholder={v.replace(/_/g, " ")}
                                value={templateVarValues[v] ?? ""}
                                onChange={e => setTemplateVarValues(prev => ({ ...prev, [v]: e.target.value }))}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <button
                    className="primary small"
                    type="submit"
                    disabled={sendingTemplate || !selectedTemplate}
                    style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <Send size={13} /> {sendingTemplate ? "Sending…" : "Send"}
                  </button>
                </form>
              )}

              {sendTab === "custom" && (
                <form className="form" onSubmit={handleSendCustom} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <textarea
                    value={customBody}
                    onChange={e => setCustomBody(e.target.value)}
                    placeholder="Type your message…"
                    rows={4}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                  <button
                    className="primary small"
                    type="submit"
                    disabled={sendingCustom || !customBody.trim()}
                    style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <Send size={13} /> {sendingCustom ? "Sending…" : "Send"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Templates panel */}
      <div className="panel tier1-section">
        <div className="panel-head" style={{ fontWeight: 600, marginBottom: "12px" }}>Message Templates</div>
        {templates.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#9ca3af" }}>No templates configured.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</th>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Body</th>
                  <th style={{ textAlign: "center", padding: "8px 10px", fontWeight: 600, color: "#6b7280", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Variables</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 10px", fontWeight: 500 }}>{t.name}</td>
                    <td style={{ padding: "10px 10px" }}>
                      <span style={{
                        ...categoryColour(t.category),
                        padding: "3px 8px",
                        borderRadius: "99px",
                        fontSize: "11px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        {t.category.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", color: "#6b7280", maxWidth: "340px" }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.body}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "center", color: "#6b7280" }}>
                      {t.variables.length > 0
                        ? <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: "99px", fontSize: "12px", fontWeight: 500 }}>{t.variables.length}</span>
                        : <span style={{ color: "#d1d5db" }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
