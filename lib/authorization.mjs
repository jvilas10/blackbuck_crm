import { roles } from "../scripts/account-model.mjs";
import { AccountError } from "./account-policy.mjs";

const clientRoles = new Set([roles.agencyAccountManager, roles.clientSalesManager, roles.salesperson]);
const customerActions = new Set(["read", "follow-up", "assign", "report", "export"]);
const deny = () => ({ _id: { $in: [] } });
const nonempty = (value) => typeof value === "string" && value.length > 0;

// Always resolve grants from the database. The caller supplies only the user ID
// derived from a verified server session, never roles from request JSON.
export async function loadPrincipal(db, userId, session) {
  if (!nonempty(userId) || !await db.collection("users").findOne({ _id: userId }, { session })) throw new AccountError("Sign in to continue.", 401);
  const memberships = await db.collection("memberships").find({ userId }, { session }).toArray();
  const agencies = await db.collection("agencies").find({ _id: { $in: memberships.map((m) => m.agencyId).filter(nonempty) } }, { session }).toArray();
  const clients = await db.collection("client_accounts").find({ _id: { $in: memberships.map((m) => m.clientId).filter(nonempty) } }, { session }).toArray();
  const valid = memberships.filter((m) => {
    if (m.role === roles.platformOperations) return !m.agencyId && !m.clientId;
    if (!agencies.some((a) => a._id === m.agencyId)) return false;
    if (m.role === roles.agencyAdmin) return !m.clientId;
    return clientRoles.has(m.role) && clients.some((c) => c._id === m.clientId && c.agencyId === m.agencyId);
  });
  if (!valid.length) throw new AccountError("Access revoked.", 403);
  return { userId, memberships: valid };
}

export function customerFilter(principal, action) {
  if (!customerActions.has(action)) throw new AccountError("Unsupported permission.", 403);
  if (!nonempty(principal?.userId) || !Array.isArray(principal.memberships)) return deny();
  const scopes = [];
  for (const member of principal.memberships) {
    if (member.userId !== principal.userId || !nonempty(member.agencyId)) continue;
    if (member.role === roles.agencyAdmin) {
      // Administrators manage the agency; sales work requires a sales membership.
      if (action !== "follow-up") scopes.push({ agencyId: member.agencyId });
    } else if (nonempty(member.clientId) && clientRoles.has(member.role)) {
      const scope = { agencyId: member.agencyId, clientId: member.clientId };
      if (member.role === roles.salesperson) {
        if (action === "read" || action === "follow-up") scopes.push({ ...scope, assignedTo: principal.userId });
      } else if (member.role === roles.clientSalesManager || action !== "follow-up" || member.salesFollowUpGranted === true) scopes.push(scope);
    }
  }
  return scopes.length ? { $or: scopes } : deny();
}

export function clientDirectoryFilter(principal, provisioning = false) {
  if (provisioning && principal.memberships.some((m) => m.role === roles.platformOperations)) return {};
  const scopes = principal.memberships.flatMap((m) => {
    if (m.role === roles.agencyAdmin) return [{ agencyId: m.agencyId }];
    if (clientRoles.has(m.role)) return [{ agencyId: m.agencyId, _id: m.clientId }];
    return [];
  });
  return scopes.length ? { $or: scopes } : deny();
}

export function eligibleAssignee(membership, agencyId, clientId) {
  return membership.agencyId === agencyId && membership.clientId === clientId &&
    (membership.role === roles.salesperson || membership.role === roles.clientSalesManager ||
      (membership.role === roles.agencyAccountManager && membership.salesFollowUpGranted === true));
}
