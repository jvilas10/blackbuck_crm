import { AccountError, text } from "./account-policy.mjs";
import { loadPrincipal, customerFilter, clientDirectoryFilter, eligibleAssignee } from "./authorization.mjs";

// Server-only persistence boundary for T12+ enquiry services. No raw query,
// update operator, aggregation pipeline, or collection name comes from clients.
export function enquiryAccess(db, client) {
  async function filter(userId, action, scope = {}, session) {
    const principal = await loadPrincipal(db, userId, session);
    const requested = {};
    for (const key of Object.keys(scope)) {
      if (!["agencyId", "clientId"].includes(key)) throw new AccountError("Unsupported scope filter.");
      requested[key] = text(scope[key], key);
    }
    const allowed = customerFilter(principal, action);
    if (allowed._id) throw new AccountError("This operation is not permitted.", 403);
    // Resolve client/agency pairs using stored accounts, including agency-wide grants.
    const clients = await db.collection("client_accounts").find({ $and: [clientDirectoryFilter(principal), {
      ...(requested.agencyId ? { agencyId: requested.agencyId } : {}),
      ...(requested.clientId ? { _id: requested.clientId } : {}),
    }] }, { session }).toArray();
    const pairs = clients.filter((c) => allowed.$or.some((grant) => grant.agencyId === c.agencyId && (!grant.clientId || grant.clientId === c._id)))
      .map((c) => ({ agencyId: c.agencyId, clientId: c._id }));
    if (Object.keys(requested).length && !pairs.length) throw new AccountError("Client scope is not available.", 403);
    return { $and: [allowed, requested, pairs.length ? { $or: pairs } : { _id: { $in: [] } }] };
  }
  async function recordFilter(userId, action, id, session) {
    return { $and: [await filter(userId, action, {}, session), { _id: text(id, "enquiry") }] };
  }
  const missing = () => new AccountError("Enquiry not found.", 404);
  return {
    async list(userId, scope = {}) {
      return db.collection("enquiries").find(await filter(userId, "read", scope)).sort({ _id: 1 }).limit(100).toArray();
    },
    async get(userId, id) {
      const record = await db.collection("enquiries").findOne(await recordFilter(userId, "read", id));
      if (!record) throw missing();
      return record;
    },
    async updateSales(userId, id, changes) {
      if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length) throw new AccountError("Provide sales changes.");
      const patch = {};
      for (const [key, value] of Object.entries(changes)) {
        if (key === "stage") {
          if (!["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"].includes(value)) throw new AccountError("Invalid stage.");
        } else if (key === "nextActionAt") {
          if (value !== null && (!(value instanceof Date) || !Number.isFinite(+value))) throw new AccountError("Invalid follow-up date.");
        } else if (key === "lastContactOutcome") {
          text(value, "contact outcome");
        } else throw new AccountError("This field cannot be changed through sales updates.");
        patch[key] = value;
      }
      // The assignment condition remains in the write query, avoiding a read/check/write gap.
      const result = await db.collection("enquiries").findOneAndUpdate(await recordFilter(userId, "follow-up", id), { $set: patch }, { returnDocument: "after" });
      if (!result) throw missing();
      return result;
    },
    async assign(userId, id, assigneeId) {
      return client.withSession(async (session) => session.withTransaction(async () => {
        const query = await recordFilter(userId, "assign", id, session);
        const record = await db.collection("enquiries").findOne(query, { session });
        if (!record) throw missing();
        if (assigneeId !== null) {
          const target = await loadPrincipal(db, text(assigneeId, "assignee"), session);
          if (!target.memberships.some((m) => eligibleAssignee(m, record.agencyId, record.clientId))) throw new AccountError("Assignee must have sales access within this client.", 403);
        }
        const result = await db.collection("enquiries").findOneAndUpdate(query, { $set: { assignedTo: assigneeId } }, { session, returnDocument: "after" });
        if (!result) throw missing();
        return result;
      }));
    },
    async report(userId, scope = {}) {
      return db.collection("enquiries").aggregate([
        { $match: await filter(userId, "report", scope) },
        { $group: { _id: "$stage", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray();
    },
    async exportRows(userId, scope = {}) {
      // Bounded internal export query. Future download routes must retain this guard.
      return db.collection("enquiries").find(await filter(userId, "export", scope), {
        projection: { _id: 1, agencyId: 1, clientId: 1, assignedTo: 1, stage: 1 },
      }).sort({ _id: 1 }).limit(1000).toArray();
    },
  };
}
