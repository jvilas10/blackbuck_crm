"use client";
import { useState, useSyncExternalStore } from "react";

export type Row = { _id: string; name?: string; agencyId?: string; clientId?: string; email?: string; role?: string; status?: string; userId?: string; salesFollowUpGranted?: boolean };
type Support = Row & { requesterId: string; requesterName: string; reason: string; expiresAt: string; canApprove: boolean; readCount: number };
type Event = Row & { actorName: string; action: string; targetType: string; targetId: string; occurredAt: string; details: Record<string, unknown> };
export type View = { actor: { userId: string; memberships: Row[] }; agencies: Row[]; clients: Row[]; members: Row[]; invitations: Row[]; activeClientId: string | null; supportRequests: Support[]; auditEvents: Event[] };
const subscribeToHydration = () => () => {};
function LocalTime({ value }: { value: string }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  return <time dateTime={value}>{hydrated ? new Date(value).toLocaleString() : new Date(value).toISOString()}</time>;
}
type Act = (input: Record<string, unknown>) => Promise<void>;
export const roleName = (role?: string) => role?.replaceAll("_", " ") || "—";
export function mayGrant(view: View, role: string, agencyId?: string, clientId?: string) {
  return view.actor.memberships.some((m) => m.role === "platform_operations" ||
    (m.role === "agency_admin" && m.agencyId === agencyId && role !== "agency_admin") ||
    (m.role === "client_sales_manager" && m.agencyId === agencyId && m.clientId === clientId && role === "salesperson"));
}
export function RoleEditor({ member, view, act, busy }: { member: Row; view: View; act: Act; busy: boolean }) {
  const [role, setRole] = useState(member.role || "salesperson");
  const self = member.userId === view.actor.userId;
  return <article className="admin-row"><h3>{member.name} <small>({member.email})</small></h3>
    <p>{roleName(member.role)} · {view.clients.find((c) => c._id === member.clientId)?.name || "Agency-wide"}</p>
    {self ? <p>You cannot change or revoke your own membership.</p> : <>
      <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); void act({ action: "change-role", id: member._id, expectedRole: member.role, expectedGrant: member.salesFollowUpGranted === true, role, clientId: data.get("client"), salesFollowUpGranted: data.get("grant") === "on" }); }}>
        <label>Role for {member.name}<select value={role} onChange={(e) => setRole(e.target.value)}>{["salesperson", "client_sales_manager", "agency_account_manager", "agency_admin"].filter((r) => mayGrant(view, r, member.agencyId, member.clientId)).map((r) => <option key={r} value={r}>{roleName(r)}</option>)}</select></label>
        {!member.clientId && role !== "agency_admin" && <label>Client for this membership<select name="client" required><option value="">Select client</option>{view.clients.filter((c) => c.agencyId === member.agencyId).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>}
        {role === "agency_account_manager" && <label className="check-label"><input type="checkbox" name="grant" defaultChecked={member.salesFollowUpGranted} />Allow sales follow-up</label>}
        <button disabled={busy}>Save role</button>
      </form>
      <button disabled={busy} onClick={() => { if (window.confirm("Revoke this membership and end this user's current sessions?")) void act({ action: "revoke-membership", id: member._id }); }}>Revoke access</button>
    </>}
  </article>;
}
export function Administration({ view, act, busy, refresh }: { view: View; act: Act; busy: boolean; refresh: () => Promise<void> }) {
  const platform = view.actor.memberships.some((m) => m.role === "platform_operations");
  const scoped = (row: Row) => !view.activeClientId || row.clientId === view.activeClientId;
  const clients = view.clients.filter((c) => !view.activeClientId || c._id === view.activeClientId);
  const label = (id?: string) => view.clients.find((c) => c._id === id)?.name || "Agency-wide";
  return <>
    <section className="panel"><h2>Client context</h2><label>Viewing client<select disabled={busy} value={view.activeClientId || ""} onChange={(e) => void act({ action: "select-client", clientId: e.target.value || null })}><option value="">All permitted clients</option>{view.clients.map((c) => <option key={c._id} value={c._id}>{c.name} · {view.agencies.find((a) => a._id === c.agencyId)?.name}</option>)}</select></label><p>Your selection is remembered and filters the lists below. Agency-wide team memberships remain visible.</p></section>
    <section className="panel"><h2>Client accounts</h2>{!clients.length && <p>No permitted clients yet.</p>}{clients.map((c) => <article className="admin-row" key={c._id}><h3>{c.name}</h3><p>{view.agencies.find((a) => a._id === c.agencyId)?.name}</p>{(platform || view.actor.memberships.some((m) => m.role === "agency_admin" && m.agencyId === c.agencyId)) && <form key={c.name} onSubmit={(e) => { e.preventDefault(); void act({ action: "rename-client", id: c._id, expectedName: c.name, name: new FormData(e.currentTarget).get("name") }); }}><label>Client name<input name="name" defaultValue={c.name} required maxLength={200} /></label><button disabled={busy}>Save client name</button></form>}</article>)}</section>
    {(platform || view.actor.memberships.some((m) => ["agency_admin", "client_sales_manager"].includes(m.role || ""))) && <section className="panel"><h2>Exceptional support access</h2><p>Read-only access requires a different, authorized agency administrator or client sales manager to approve it. Approval expires after one hour.</p>
      {platform && <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); void act({ action: "request-support", clientId: data.get("client"), reason: data.get("reason") }); }}><label>Support client<select key={view.activeClientId} name="client" defaultValue={view.activeClientId || ""} required><option value="">Select client</option>{view.clients.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label><label>Reason<input name="reason" required maxLength={200} /></label><button disabled={busy}>Request read-only access</button></form>}
      {!view.supportRequests.filter(scoped).length && <p>No support requests in this context.</p>}
      {view.supportRequests.filter(scoped).map((r) => <article className="admin-row" key={r._id}><h3>{label(r.clientId)} · {r.status}</h3><p>{r.requesterName}: {r.reason}</p><p>Expires: <LocalTime value={r.expiresAt} /> · Recorded reads: {r.readCount}</p>
        {r.status === "pending" && r.canApprove && <><button disabled={busy} onClick={() => void act({ action: "approve-support", id: r._id })}>Approve for one hour</button><button disabled={busy} onClick={() => void act({ action: "reject-support", id: r._id })}>Reject</button></>}
        {["pending", "approved"].includes(r.status || "") && (r.canApprove || r.requesterId === view.actor.userId) && <button disabled={busy} onClick={() => void act({ action: "revoke-support", id: r._id })}>Revoke request</button>}
        {r.status === "approved" && platform && r.requesterId === view.actor.userId && <SupportRecords requestId={r._id} disabled={busy} refresh={refresh} />}
      </article>)}
    </section>}
    <section className="panel"><h2>Audit history</h2><p>Latest 100 permitted events. Times use your browser’s timezone.</p>{!view.auditEvents.filter(scoped).length && <p>No audit events in this context.</p>}<ol className="audit-list">{view.auditEvents.filter(scoped).map((e) => <li key={e._id}><strong>{e.action.replaceAll(".", " · ")}</strong><p>{e.actorName} · <LocalTime value={e.occurredAt} /> · {label(e.clientId)}</p><details><summary>Event details</summary><p>{e.targetType}: {e.targetId}</p><pre>{JSON.stringify(e.details, null, 2)}</pre></details></li>)}</ol></section>
  </>;
}
function SupportRecords({ requestId, disabled, refresh }: { requestId: string; disabled: boolean; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function read() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/support-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }), cache: "no-store" });
      const result = await response.json();
      setMessage(response.ok ? (result.records.length ? JSON.stringify(result.records, null, 2) : "No enquiry records for this client yet.") : result.message);
      await refresh();
    } catch { setMessage("Unable to read support records. Please retry."); } finally { setBusy(false); }
  }
  return <div><button disabled={busy || disabled} onClick={() => void read()}>Read approved records</button><p>Each read is audited. Up to 100 records are shown.</p><pre role="status">{message}</pre></div>;
}
