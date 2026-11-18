// Only explicit event fields reach the audit collection; never spread request
// bodies, credentials, invitation tokens, or customer records into audit events.
export async function audit(db, session, actorId, action, targetType, targetId, scope = {}, details = {}) {
  await db.collection("audit_events").insertOne({
    actorId, action, targetType, targetId: String(targetId), occurredAt: new Date(),
    ...(scope.agencyId ? { agencyId: scope.agencyId } : {}),
    ...(scope.clientId ? { clientId: scope.clientId } : {}), details,
  }, { session });
}

export function auditScope(principal) {
  const scopes = principal.memberships.flatMap((m) => {
    if (m.role === "agency_admin") return [{ agencyId: m.agencyId }];
    if (m.role === "client_sales_manager") return [{ agencyId: m.agencyId, clientId: m.clientId }];
    if (m.role === "platform_operations") return [{ actorId: principal.userId }];
    return [];
  });
  return scopes.length ? { $or: scopes } : { _id: { $in: [] } };
}

export async function auditSnapshot(db, principal) {
  const events = await db.collection("audit_events").find(auditScope(principal)).sort({ occurredAt: -1, _id: -1 }).limit(100).toArray();
  const users = await db.collection("users").find({ _id: { $in: events.map((e) => e.actorId) } }).toArray();
  return events.map((e) => ({ ...e, _id: e._id.toString(), actorName: users.find((u) => u._id === e.actorId)?.name || "Former team member" }));
}
