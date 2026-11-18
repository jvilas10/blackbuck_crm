import { AccountError, text } from "./account-policy.mjs";
import { loadPrincipal } from "./authorization.mjs";
import { audit } from "./audit.mjs";
import { objectId } from "./administration.mjs";

export function canApproveSupport(principal, request) {
  return principal.userId !== request.requesterId && principal.memberships.some((m) =>
    (m.role === "agency_admin" && m.agencyId === request.agencyId) ||
    (m.role === "client_sales_manager" && m.agencyId === request.agencyId && m.clientId === request.clientId));
}
const operator = (principal) => principal.memberships.some((m) => m.role === "platform_operations");
export function supportState(request, now = new Date()) {
  if (["pending", "approved"].includes(request.status) && request.expiresAt <= now) return "expired";
  return request.status;
}
export async function supportSnapshot(db, principal) {
  const scopes = principal.memberships.flatMap((m) => {
    if (m.role === "platform_operations") return [{ requesterId: principal.userId }];
    if (m.role === "agency_admin") return [{ agencyId: m.agencyId }];
    if (m.role === "client_sales_manager") return [{ agencyId: m.agencyId, clientId: m.clientId }];
    return [];
  });
  const requests = scopes.length ? await db.collection("support_requests").find({ $or: scopes }).sort({ createdAt: -1, _id: -1 }).limit(100).toArray() : [];
  const people = await db.collection("users").find({ _id: { $in: requests.map((r) => r.requesterId) } }).toArray();
  return requests.map((r) => ({ ...r, _id: r._id.toString(), status: supportState(r), requesterName: people.find((p) => p._id === r.requesterId)?.name || "Former operator", canApprove: canApproveSupport(principal, r) }));
}
export async function supportAction(db, principal, input, session) {
  if (input.action === "request-support") {
    if (!operator(principal)) throw new AccountError("Platform operator access required.", 403);
    const client = await db.collection("client_accounts").findOne({ _id: text(input.clientId, "client") }, { session });
    if (!client) throw new AccountError("Client not available.", 403);
    const reason = text(input.reason, "support reason");
    const request = { requesterId: principal.userId, agencyId: client.agencyId, clientId: client._id, reason,
      status: "pending", createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000), readCount: 0 };
    const { insertedId } = await db.collection("support_requests").insertOne(request, { session });
    await audit(db, session, principal.userId, "support.requested", "support", insertedId, request, { reason });
    return { message: "Read-only access requested. A client manager or agency administrator must approve it.", id: insertedId.toString() };
  }
  if (!["approve-support", "reject-support", "revoke-support"].includes(input.action)) return null;
  const request = await db.collection("support_requests").findOne({ _id: objectId(input.id) }, { session });
  if (!request) throw new AccountError("Support request not available.", 403);
  const mayApprove = canApproveSupport(principal, request);
  if (!mayApprove && !(input.action === "revoke-support" && operator(principal) && request.requesterId === principal.userId)) throw new AccountError("You cannot decide this request.", 403);
  const state = supportState(request);
  if (input.action !== "revoke-support" && state !== "pending") throw new AccountError("Only a pending request can be decided.", 409);
  if (input.action === "revoke-support" && !["pending", "approved"].includes(state)) throw new AccountError("This request is no longer active.", 409);
  const status = input.action === "approve-support" ? "approved" : input.action === "reject-support" ? "rejected" : "revoked";
  const update = { status, decidedBy: principal.userId, decidedAt: new Date() };
  if (status === "approved") {
    const requester = await loadPrincipal(db, request.requesterId, session);
    if (!operator(requester)) throw new AccountError("The requester is no longer a platform operator.", 403);
    if (!await db.collection("client_accounts").findOne({ _id: request.clientId, agencyId: request.agencyId }, { session })) throw new AccountError("Client not available.", 403);
    update.approvedBy = principal.userId;
    update.expiresAt = new Date(Date.now() + 3600000);
  }
  await db.collection("support_requests").updateOne({ _id: request._id }, { $set: update }, { session });
  await audit(db, session, principal.userId, `support.${status}`, "support", request._id, request, { requesterId: request.requesterId, ...(update.expiresAt ? { expiresAt: update.expiresAt } : {}) });
  return { message: status === "approved" ? "Read-only access approved for one hour." : `Support access ${status}.` };
}

// This is the only exceptional customer-read path. Normal T09 permissions remain
// unchanged. The grant usage and audit insert commit before any data is returned.
export async function readSupportEnquiries(db, client, userId, requestId, enquiryId = null) {
  return client.withSession(async (session) => session.withTransaction(async () => {
    const principal = await loadPrincipal(db, userId, session);
    if (!operator(principal)) throw new AccountError("Platform operator access required.", 403);
    const request = await db.collection("support_requests").findOne({ _id: objectId(requestId), requesterId: userId, status: "approved", expiresAt: { $gt: new Date() } }, { session });
    if (!request) throw new AccountError("Approved support access is required.", 403);
    const approver = await loadPrincipal(db, request.approvedBy, session);
    if (!canApproveSupport(approver, request)) throw new AccountError("Support approval is no longer valid.", 403);
    if (!await db.collection("client_accounts").findOne({ _id: request.clientId, agencyId: request.agencyId }, { session })) throw new AccountError("Client not available.", 403);
    const query = { agencyId: request.agencyId, clientId: request.clientId, ...(enquiryId ? { _id: text(enquiryId, "enquiry") } : {}) };
    const rows = await db.collection("enquiries").find(query, { session, projection: { _id: 1, stage: 1, assignedTo: 1, nextActionAt: 1, lastContactOutcome: 1 } }).sort({ _id: 1 }).limit(100).toArray();
    if (enquiryId && !rows.length) throw new AccountError("Enquiry not found.", 404);
    const used = await db.collection("support_requests").updateOne({ _id: request._id, status: "approved", expiresAt: { $gt: new Date() } }, { $inc: { readCount: 1 }, $set: { lastUsedAt: new Date() } }, { session });
    if (!used.matchedCount) throw new AccountError("Support access expired.", 403);
    await audit(db, session, userId, "support.read", "support", request._id, request, { recordCount: rows.length, ...(enquiryId ? { enquiryId } : {}) });
    return rows;
  }));
}
