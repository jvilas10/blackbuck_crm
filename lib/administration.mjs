import { ObjectId } from "mongodb";
import { roles } from "../scripts/account-model.mjs";
import { AccountError, canGrant, text } from "./account-policy.mjs";
import { clientDirectoryFilter } from "./authorization.mjs";
import { audit } from "./audit.mjs";

export function canManageAgency(principal, agencyId) {
  return principal.memberships.some((m) => m.role === roles.platformOperations || (m.role === roles.agencyAdmin && m.agencyId === agencyId));
}

export async function endUserSessions(db, userId, session) {
  const user = await db.collection("auth_users").findOne({ crmUserId: userId }, { session });
  if (user) await db.collection("auth_sessions").deleteMany({ userId: user._id }, { session });
}

export async function protectLastAdmin(db, member, session) {
  if (member.role !== roles.agencyAdmin) return;
  // Serialize demotions/revocations for an agency to prevent two concurrent
  // removals from both observing the other administrator as still present.
  await db.collection("admin_locks").updateOne({ _id: member.agencyId }, { $inc: { revision: 1 } }, { upsert: true, session });
  const count = await db.collection("memberships").countDocuments({ agencyId: member.agencyId, role: roles.agencyAdmin }, { session });
  if (count <= 1) throw new AccountError("Invite another agency administrator before removing the last one.", 409);
}

export async function cancelScopeInvitations(db, member, session) {
  const profile = await db.collection("users").findOne({ _id: member.userId }, { session });
  if (!profile) return;
  await db.collection("invitations").updateMany({ email: profile.email.toLowerCase(), agencyId: member.agencyId,
    ...(member.clientId ? { clientId: member.clientId } : {}), status: "pending" }, { $set: { status: "cancelled" } }, { session });
}

export async function administrationAction(db, principal, input, session) {
  if (input.action === "select-client") {
    const clientId = input.clientId === null ? null : text(input.clientId, "client");
    const selected = clientId === null ? null : await db.collection("client_accounts").findOne({ $and: [clientDirectoryFilter(principal, true), { _id: clientId }] }, { session });
    if (clientId && !selected) throw new AccountError("Client not available.", 403);
    await db.collection("user_preferences").updateOne({ _id: principal.userId }, { $set: { clientId, agencyId: selected?.agencyId ?? null, updatedAt: new Date() } }, { upsert: true, session });
    await audit(db, session, principal.userId, "context.selected", "client", clientId || "all", selected ? { agencyId: selected.agencyId, clientId: selected._id } : {});
    return { message: selected ? `Now viewing ${selected.name}.` : "Showing all permitted clients." };
  }
  if (input.action === "rename-client") {
    const record = await db.collection("client_accounts").findOne({ _id: text(input.id, "client") }, { session });
    if (!record || !canManageAgency(principal, record.agencyId)) throw new AccountError("Client not available.", 403);
    if (input.expectedName !== record.name) throw new AccountError("This client changed. Refresh before editing.", 409);
    const name = text(input.name, "client name");
    await db.collection("client_accounts").updateOne({ _id: record._id }, { $set: { name } }, { session });
    await audit(db, session, principal.userId, "client.renamed", "client", record._id, { agencyId: record.agencyId, clientId: record._id }, { previousName: record.name, name });
    return { message: "Client name updated." };
  }
  if (input.action === "change-role") {
    const member = await db.collection("memberships").findOne({ _id: text(input.id, "membership") }, { session });
    if (!member || member.userId === principal.userId || !canGrant(principal.memberships, member)) throw new AccountError("You cannot change that membership.", 403);
    if (member.role !== input.expectedRole || (member.salesFollowUpGranted === true) !== (input.expectedGrant === true)) throw new AccountError("This membership changed. Refresh before editing.", 409);
    const target = { role: text(input.role, "role"), agencyId: member.agencyId };
    if (target.role !== roles.agencyAdmin) target.clientId = member.clientId || text(input.clientId, "client");
    if (target.role === roles.agencyAccountManager) target.salesFollowUpGranted = input.salesFollowUpGranted === true;
    if (!canGrant(principal.memberships, target)) throw new AccountError("You cannot grant that role.", 403);
    if (target.clientId && !await db.collection("client_accounts").findOne({ _id: target.clientId, agencyId: target.agencyId }, { session })) throw new AccountError("Client not available.", 403);
    if (member.role === roles.agencyAdmin && target.role !== roles.agencyAdmin) await protectLastAdmin(db, member, session);
    const replacement = { _id: member._id, userId: member.userId, ...target, ...(member.synthetic !== undefined ? { synthetic: member.synthetic } : {}) };
    try { await db.collection("memberships").replaceOne({ _id: member._id }, replacement, { session }); }
    catch (error) { if (error.code === 11000) throw new AccountError("This user already has that role in this scope.", 409); throw error; }
    await endUserSessions(db, member.userId, session);
    await cancelScopeInvitations(db, member, session);
    await audit(db, session, principal.userId, "membership.changed", "membership", member._id, member, {
      userId: member.userId, previousRole: member.role, role: target.role,
      previousGrant: member.salesFollowUpGranted === true, salesFollowUpGranted: target.salesFollowUpGranted === true,
    });
    return { message: "Role updated. The member must sign in again." };
  }
  return null;
}

export function objectId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new AccountError("Invalid request.");
  return new ObjectId(value);
}
