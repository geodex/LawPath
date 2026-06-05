import { CheckCircle2, Edit2, Mail, Plus, Shield, Trash2, UserCheck, Users, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type StaffMember = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  jobTitle: string;
  phone: string;
  lastLoginAt: string;
  createdAt: string;
  deactivatedAt: string;
};

type PendingInvite = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type Props = {
  tenantId: string;
  currentUserId: string;
  currentUserRole: string;
  showToast: (type: "success" | "error" | "info", title: string, msg: string) => void;
};

const ROLE_OPTIONS = [
  { value: "attorney", label: "Attorney" },
  { value: "candidate_attorney", label: "Candidate Attorney" },
  { value: "legal_secretary", label: "Legal Secretary" },
  { value: "billing_admin", label: "Billing Admin" },
  { value: "tenant_admin", label: "Admin" },
];

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Admin",
  attorney: "Attorney",
  candidate_attorney: "Candidate Att.",
  legal_secretary: "Secretary",
  billing_admin: "Billing Admin",
};

function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("lawpath.auth.token");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function isExpired(iso: string) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export function StaffManagement({ tenantId: _tenantId, currentUserId, currentUserRole, showToast }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("attorney");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  // Inline edit per staff member
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Accept-invite panel
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("invite");
  const [acceptPassword, setAcceptPassword] = useState("");
  const [acceptConfirm, setAcceptConfirm] = useState("");
  const [acceptSubmitting, setAcceptSubmitting] = useState(false);

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/staff");
      if (!res.ok) throw new Error("Failed to load staff");
      const data = await res.json();
      setStaff(data.staff || []);
      setInvites(data.pendingInvites || []);
    } catch (err: unknown) {
      showToast("error", "Load failed", err instanceof Error ? err.message : "Could not load staff data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteFullName.trim() || !inviteEmail.trim()) return;
    setInviteSubmitting(true);
    try {
      const res = await apiFetch("/api/staff/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), fullName: inviteFullName.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Invite failed");
      }
      const data = await res.json();
      setInvites((prev) => [data.invite, ...prev]);
      setInviteFullName("");
      setInviteEmail("");
      setInviteRole("attorney");
      showToast("success", "Invite sent", `Invitation sent to ${inviteEmail.trim()}.`);
    } catch (err: unknown) {
      showToast("error", "Invite failed", err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setInviteSubmitting(false);
    }
  }

  function startEdit(member: StaffMember) {
    setEditingId(member.id);
    setEditRole(member.role);
    setEditStatus(member.status);
    setEditJobTitle(member.jobTitle || "");
    setEditPhone(member.phone || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSave(memberId: string) {
    setEditSaving(true);
    try {
      const body: Record<string, string> = { role: editRole, jobTitle: editJobTitle, phone: editPhone };
      if (memberId !== currentUserId) {
        body.status = editStatus;
      }
      const res = await apiFetch(`/api/staff/${memberId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Save failed");
      }
      const data = await res.json();
      setStaff((prev) => prev.map((m) => (m.id === memberId ? { ...m, ...data.staffMember } : m)));
      setEditingId(null);
      showToast("success", "Saved", "Staff member updated.");
    } catch (err: unknown) {
      showToast("error", "Save failed", err instanceof Error ? err.message : "Could not update staff member.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRevokeInvite(inviteId: string, email: string) {
    try {
      const res = await apiFetch(`/api/staff/invites/${inviteId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Revoke failed");
      }
      setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      showToast("info", "Invite revoked", `Revoked invite for ${email}.`);
    } catch (err: unknown) {
      showToast("error", "Revoke failed", err instanceof Error ? err.message : "Could not revoke invite.");
    }
  }

  async function handleAcceptInvite(e: FormEvent) {
    e.preventDefault();
    if (!acceptPassword || acceptPassword !== acceptConfirm) {
      showToast("error", "Password mismatch", "Passwords do not match.");
      return;
    }
    setAcceptSubmitting(true);
    try {
      const res = await apiFetch("/api/staff/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token: inviteToken, password: acceptPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Accept failed");
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("lawpath.auth.token", data.token);
      }
      showToast("success", "Welcome", "Your account is ready. Redirecting…");
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.location.href = url.toString();
      }, 1200);
    } catch (err: unknown) {
      showToast("error", "Accept failed", err instanceof Error ? err.message : "Could not accept invite.");
    } finally {
      setAcceptSubmitting(false);
    }
  }

  const isAdmin = currentUserRole === "tenant_admin";
  const activeCount = staff.filter((m) => m.status === "active").length;
  const pendingCount = invites.length;

  if (inviteToken) {
    return (
      <div className="panel" style={{ maxWidth: 440, margin: "60px auto" }}>
        <div className="panel-head">
          <Shield size={18} />
          <span>Accept Invitation</span>
        </div>
        <form className="form" onSubmit={handleAcceptInvite} style={{ padding: "24px" }}>
          <p style={{ marginBottom: 16, color: "var(--text-muted, #6b7280)" }}>
            Create a password to activate your LawPath account.
          </p>
          <div className="form-row">
            <label>Password</label>
            <input
              type="password"
              value={acceptPassword}
              onChange={(e) => setAcceptPassword(e.target.value)}
              placeholder="New password"
              required
              minLength={8}
            />
          </div>
          <div className="form-row">
            <label>Confirm password</label>
            <input
              type="password"
              value={acceptConfirm}
              onChange={(e) => setAcceptConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              minLength={8}
            />
          </div>
          <button className="primary" type="submit" disabled={acceptSubmitting} style={{ marginTop: 8 }}>
            {acceptSubmitting ? "Activating…" : "Activate account"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Hero metrics */}
      <div className="tier1-section">
        <p className="eyebrow">Staff Overview</p>
        <div className="metrics">
          <div className="metric">
            <Users size={20} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{staff.length}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted, #6b7280)" }}>Total staff</div>
            </div>
          </div>
          <div className="metric">
            <UserCheck size={20} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{activeCount}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted, #6b7280)" }}>Active</div>
            </div>
          </div>
          <div className="metric">
            <Mail size={20} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{pendingCount}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted, #6b7280)" }}>Pending invites</div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite form */}
      {isAdmin && (
        <div className="panel">
          <div className="panel-head">
            <Plus size={16} />
            <span>Invite a team member</span>
          </div>
          <form className="form" onSubmit={handleInvite} style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="form-row" style={{ flex: "1 1 180px", marginBottom: 0 }}>
                <label>Full name</label>
                <input
                  type="text"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div className="form-row" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                <label>Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="jane@firm.com"
                  required
                />
              </div>
              <div className="form-row" style={{ flex: "1 1 160px", marginBottom: 0 }}>
                <label>Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="primary"
                type="submit"
                disabled={inviteSubmitting}
                style={{ whiteSpace: "nowrap", alignSelf: "flex-end" }}
              >
                {inviteSubmitting ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff table */}
      <div className="panel">
        <div className="panel-head">
          <Users size={16} />
          <span>Staff members</span>
        </div>
        {loading ? (
          <div style={{ padding: "32px 24px", color: "var(--text-muted, #6b7280)", textAlign: "center" }}>
            Loading…
          </div>
        ) : staff.length === 0 ? (
          <div style={{ padding: "32px 24px", color: "var(--text-muted, #6b7280)", textAlign: "center" }}>
            No staff members yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr className="row">
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Role</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Job title</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Last login</th>
                  {isAdmin && <th style={{ padding: "10px 16px" }}></th>}
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const isSelf = member.id === currentUserId;
                  const isEditing = editingId === member.id;
                  return (
                    <>
                      <tr key={member.id} className="row">
                        <td style={{ padding: "12px 16px", fontWeight: 500 }}>{member.fullName}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted, #6b7280)" }}>{member.email}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span className="pill" style={{ background: "var(--accent-subtle, #eff6ff)", color: "var(--accent, #2563eb)", fontSize: 12, padding: "2px 8px", borderRadius: 99 }}>
                            {ROLE_LABELS[member.role] || member.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {member.status === "active" ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#16a34a", fontSize: 13 }}>
                              <CheckCircle2 size={13} /> Active
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted, #9ca3af)", fontSize: 13 }}>Inactive</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted, #6b7280)" }}>{member.jobTitle || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted, #6b7280)", fontSize: 13 }}>{formatDate(member.lastLoginAt)}</td>
                        {isAdmin && (
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            {!isSelf && (
                              <button
                                className="ghost small"
                                onClick={() => (isEditing ? cancelEdit() : startEdit(member))}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                              >
                                {isEditing ? <X size={14} /> : <Edit2 size={14} />}
                                {isEditing ? "Cancel" : "Edit"}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {isEditing && (
                        <tr key={`${member.id}-edit`} className="row inline-form-toggle">
                          <td colSpan={isAdmin ? 7 : 6} style={{ padding: "0 16px 16px 16px", background: "var(--surface-alt, #f9fafb)" }}>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", paddingTop: 12 }}>
                              <div className="form-row" style={{ flex: "1 1 140px", marginBottom: 0 }}>
                                <label style={{ fontSize: 12, fontWeight: 600 }}>Role</label>
                                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                  {ROLE_OPTIONS.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-row" style={{ flex: "1 1 140px", marginBottom: 0 }}>
                                <label style={{ fontSize: 12, fontWeight: 600 }}>Status</label>
                                <select
                                  value={editStatus}
                                  onChange={(e) => setEditStatus(e.target.value)}
                                  disabled={isSelf}
                                >
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                              </div>
                              <div className="form-row" style={{ flex: "1 1 160px", marginBottom: 0 }}>
                                <label style={{ fontSize: 12, fontWeight: 600 }}>Job title</label>
                                <input
                                  type="text"
                                  value={editJobTitle}
                                  onChange={(e) => setEditJobTitle(e.target.value)}
                                  placeholder="e.g. Senior Associate"
                                />
                              </div>
                              <div className="form-row" style={{ flex: "1 1 150px", marginBottom: 0 }}>
                                <label style={{ fontSize: 12, fontWeight: 600 }}>Phone</label>
                                <input
                                  type="text"
                                  value={editPhone}
                                  onChange={(e) => setEditPhone(e.target.value)}
                                  placeholder="+27 000 000 0000"
                                />
                              </div>
                              <button
                                className="primary small"
                                onClick={() => handleSave(member.id)}
                                disabled={editSaving}
                                style={{ alignSelf: "flex-end" }}
                              >
                                {editSaving ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending invites table */}
      {isAdmin && (
        <div className="panel">
          <div className="panel-head">
            <Shield size={16} />
            <span>Pending invites</span>
          </div>
          {invites.length === 0 ? (
            <div style={{ padding: "24px", color: "var(--text-muted, #6b7280)", textAlign: "center" }}>
              No pending invites.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr className="row">
                    <th style={{ textAlign: "left", padding: "10px 16px" }}>Name</th>
                    <th style={{ textAlign: "left", padding: "10px 16px" }}>Email</th>
                    <th style={{ textAlign: "left", padding: "10px 16px" }}>Role</th>
                    <th style={{ textAlign: "left", padding: "10px 16px" }}>Expires</th>
                    <th style={{ padding: "10px 16px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => {
                    const expired = isExpired(inv.expiresAt);
                    return (
                      <tr key={inv.id} className="row">
                        <td style={{ padding: "12px 16px", fontWeight: 500 }}>{inv.fullName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted, #6b7280)" }}>{inv.email}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span className="pill" style={{ background: "var(--accent-subtle, #eff6ff)", color: "var(--accent, #2563eb)", fontSize: 12, padding: "2px 8px", borderRadius: 99 }}>
                            {ROLE_LABELS[inv.role] || inv.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ color: expired ? "#e11d48" : "var(--text-muted, #6b7280)", fontSize: 13, fontWeight: expired ? 600 : 400 }}>
                            {expired ? "Expired · " : ""}{formatDate(inv.expiresAt)}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <button
                            className="ghost small"
                            onClick={() => handleRevokeInvite(inv.id, inv.email)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#e11d48" }}
                          >
                            <Trash2 size={13} /> Revoke
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
