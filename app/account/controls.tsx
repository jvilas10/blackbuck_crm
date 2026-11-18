"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";

import { Administration, RoleEditor, mayGrant, type View } from "./administration";
export function AccountControls({ initial }: { initial: View }) {
  const router = useRouter();
  const [view, setView] = useState<View>(initial);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [agency, setAgency] = useState("");
  const [role, setRole] = useState("salesperson");
  async function refresh() {
    const response = await fetch("/api/accounts", { cache: "no-store" });
    if (response.status === 401) { router.replace("/sign-in"); router.refresh(); return; }
    if (!response.ok) throw new Error("Unable to load account.");
    setView(await response.json());
  }
  async function act(input: Record<string, unknown>) {
    setBusy(true); setMessage(""); setLink("");
    try {
      const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (response.status === 401) { router.replace("/sign-in"); router.refresh(); return; }
      const result = await response.json(); setMessage(result.message);
      if (result.invitationURL) setLink(result.invitationURL);
      if (response.ok) await refresh();
    } catch { setMessage("Unable to complete action. Please retry."); } finally { setBusy(false); }
  }
  if (!view) return <p role="status">{message || "Loading account…"}</p>;
  const platform = view.actor.memberships.some((m) => m.role === "platform_operations");
  const admin = platform || view.actor.memberships.some((m) => m.role === "agency_admin");
  const manager = admin || view.actor.memberships.some((m) => m.role === "client_sales_manager");
  const activeAgencyId = view.clients.find((c) => c._id === view.activeClientId)?.agencyId;
  const visibleInvitations = view.invitations.filter((i) => !view.activeClientId || (i.clientId ? i.clientId === view.activeClientId : i.agencyId === activeAgencyId));
  const visibleMembers = view.members.filter((m) => !view.activeClientId || (m.clientId ? m.clientId === view.activeClientId : m.agencyId === activeAgencyId));
  return <div className="account-grid">
    <button disabled={busy} onClick={async () => { setBusy(true); try { await refresh(); setMessage("Account refreshed."); } catch { setMessage("Unable to refresh account. Please retry."); } finally { setBusy(false); } }}>Refresh account</button>
    <Administration view={view} act={act} busy={busy} refresh={refresh} />
    <section className="panel"><h2>Your sessions</h2><p>Sessions expire after seven days of inactivity.</p>
      <button disabled={busy} onClick={async () => { setBusy(true); try { const result = await authClient.revokeOtherSessions(); setMessage(result.error ? "Could not end other sessions." : "Other sessions ended."); } catch { setMessage("Please retry."); } finally { setBusy(false); } }}>Sign out other devices</button>
      <button disabled={busy} onClick={async () => { setBusy(true); try { const result = await authClient.signOut(); if (!result.error) { router.replace("/sign-in"); router.refresh(); } else setMessage("Sign-out failed. Please retry."); } catch { setMessage("Sign-out failed. Please retry."); } finally { setBusy(false); } }}>Sign out</button>
    </section>
    {platform && <section className="panel"><h2>Create agency</h2><form onSubmit={(e) => { e.preventDefault(); void act({ action: "create-agency", name: new FormData(e.currentTarget).get("name") }); }}><label>Agency name<input name="name" required maxLength={200} /></label><button disabled={busy}>Create agency</button></form></section>}
    {admin && <section className="panel"><h2>Create client account</h2><form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); void act({ action: "create-client", agencyId: data.get("agency"), name: data.get("name") }); }}>
      <label>Agency<select name="agency" required><option value="">Select agency</option>{view.agencies.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</select></label>
      <label>Client name<input name="name" required maxLength={200} /></label><button disabled={busy}>Create client</button></form></section>}
    {manager && <section className="panel"><h2>Invite a team member</h2><form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); void act({ action: "invite", email: data.get("email"), agencyId: agency, clientId: data.get("client"), role, salesFollowUpGranted: data.get("grant") === "on" }); }}>
      <label>Email<input name="email" type="email" required /></label>
      <label>Agency<select value={agency} onChange={(e) => { setAgency(e.target.value); setRole("salesperson"); }} required><option value="">Select agency</option>{view.agencies.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</select></label>
      <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="salesperson">Salesperson</option>{mayGrant(view, "client_sales_manager", agency) && <><option value="client_sales_manager">Client sales manager</option><option value="agency_account_manager">Agency account manager</option></>}{platform && <option value="agency_admin">Agency administrator</option>}</select></label>
      {role !== "agency_admin" && <label>Client<select key={agency} name="client" required><option value="">Select client</option>{view.clients.filter((c) => c.agencyId === agency).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>}
      {role === "agency_account_manager" && <label><input name="grant" type="checkbox" /> Allow sales follow-up</label>}
      <button disabled={busy}>Create invitation</button></form><p>Links expire in 48 hours and can be accepted once. Share the link privately with its recipient.</p>
    </section>}
    <div className="account-notice" role="status">{message}</div>{link && <section className="panel"><h2>Private invitation link</h2><input aria-label="Invitation link" value={link} readOnly onFocus={(e) => e.target.select()} /><p>This link is shown only when created. Copy it now.</p></section>}
    {manager && <section className="panel"><h2>Invitations</h2>{visibleInvitations.length === 0 && <p>No invitations yet.</p>}{visibleInvitations.map((i) => <p key={i._id}>{i.email} · {i.role} · {i.status} {i.status === "pending" && <button disabled={busy} onClick={() => act({ action: "cancel-invitation", id: i._id })}>Cancel</button>}</p>)}</section>}
    {manager && <section className="panel"><h2>Team access</h2><p>Role changes end the member’s current sessions. They must sign in again.</p>{!visibleMembers.length && <p>No manageable memberships in this context.</p>}{visibleMembers.map((m) => <RoleEditor key={`${m._id}:${m.role}:${m.salesFollowUpGranted}`} member={m} view={view} act={act} busy={busy} />)}</section>}
  </div>;
}
