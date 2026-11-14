import { ObjectId } from "mongodb";
import { hashPassword } from "better-auth/crypto";
import { database } from "./database.mjs";
import { roles } from "../scripts/account-model.mjs";
import { AccountError, text, emailAddress, invitationToken, tokenHash, canGrant, validInvitation } from "./account-policy.mjs";
import { loadPrincipal, clientDirectoryFilter } from "./authorization.mjs";

async function scope(db, target, session) {
  if (target.role === roles.platformOperations) throw new AccountError("Platform roles require operator provisioning.", 403);
  if (!await db.collection("agencies").findOne({ _id: target.agencyId }, { session })) throw new AccountError("Agency not found.");
  if (target.role !== roles.agencyAdmin && !await db.collection("client_accounts").findOne({ _id: target.clientId, agencyId: target.agencyId }, { session })) {
    throw new AccountError("Select a client belonging to this agency.");
  }
}
export async function snapshot(actor) {
  const { db } = database();
  actor = { ...actor, ...await loadPrincipal(db, actor.userId) };
  const platform = actor.memberships.some((m) => m.role === roles.platformOperations);
  const agencyIds = actor.memberships.map((m) => m.agencyId).filter(Boolean);
  const agencies = await db.collection("agencies").find(platform ? {} : { _id: { $in: agencyIds } }).toArray();
  const clients = await db.collection("client_accounts").find(clientDirectoryFilter(actor, true)).toArray();
  const candidates = await db.collection("memberships").find(platform ? {} : { agencyId: { $in: agencyIds } }).toArray();
  const members = candidates.filter((m) => canGrant(actor.memberships, m));
  const profiles = await db.collection("users").find({ _id: { $in: members.map((m) => m.userId) } }).toArray();
  const invitations = (await db.collection("invitations").find(platform ? {} : { agencyId: { $in: agencyIds } }, { projection: { tokenHash: 0 } }).toArray())
    .filter((i) => canGrant(actor.memberships, i)).map((i) => ({ ...i, _id: i._id.toString(), status: i.status === "pending" && !validInvitation(i) ? "expired" : i.status }));
  return { actor, agencies, clients, members: members.map((m) => ({ ...m, name: profiles.find((p) => p._id === m.userId)?.name, email: profiles.find((p) => p._id === m.userId)?.email })), invitations };
}

export async function accountAction(actor, input) {
  const { db, client } = database();
  // Re-read grants inside the write transaction; callers cannot supply their own roles.
  return client.withSession(async (session) => session.withTransaction(async () => {
    const { memberships } = await loadPrincipal(db, actor.userId, session);
    if (input.action === "create-agency") {
      if (!memberships.some((m) => m.role === roles.platformOperations)) throw new AccountError("Platform operator access required.", 403);
      const _id = new ObjectId().toString();
      await db.collection("agencies").insertOne({ _id, name: text(input.name, "agency name") }, { session });
      return { message: "Agency created.", id: _id };
    }
    if (input.action === "create-client") {
      const agencyId = text(input.agencyId, "agency");
      if (!memberships.some((m) => m.role === roles.platformOperations || (m.role === roles.agencyAdmin && m.agencyId === agencyId))) throw new AccountError("Agency administrator access required.", 403);
      if (!await db.collection("agencies").findOne({ _id: agencyId }, { session })) throw new AccountError("Agency not found.");
      const _id = new ObjectId().toString();
      await db.collection("client_accounts").insertOne({ _id, agencyId, name: text(input.name, "client name") }, { session });
      return { message: "Client created.", id: _id };
    }
    if (input.action === "invite") {
      const target = { role: text(input.role, "role"), agencyId: text(input.agencyId, "agency") };
      if (target.role !== roles.agencyAdmin) target.clientId = text(input.clientId, "client");
      if (target.role === roles.agencyAccountManager) target.salesFollowUpGranted = input.salesFollowUpGranted === true;
      if (!canGrant(memberships, target)) throw new AccountError("You cannot grant that role or scope.", 403);
      await scope(db, target, session);
      const token = invitationToken();
      await db.collection("invitations").insertOne({ ...target, email: emailAddress(input.email), tokenHash: tokenHash(token), status: "pending", createdBy: actor.userId, createdAt: new Date(), expiresAt: new Date(Date.now() + 48 * 3600000) }, { session });
      return { message: "Invitation created. Share this private link with the intended recipient.", invitationURL: `${process.env.BETTER_AUTH_URL}/accept-invitation#${token}` };
    }
    if (input.action === "cancel-invitation") {
      if (!ObjectId.isValid(input.id)) throw new AccountError("Invalid invitation.");
      const invite = await db.collection("invitations").findOne({ _id: new ObjectId(input.id) }, { session });
      if (!invite || !canGrant(memberships, invite)) throw new AccountError("Invitation not available.", 403);
      await db.collection("invitations").updateOne({ _id: invite._id, status: "pending" }, { $set: { status: "cancelled" } }, { session });
      return { message: "Invitation cancelled." };
    }
    if (input.action === "revoke-membership") {
      const member = await db.collection("memberships").findOne({ _id: text(input.id, "membership") }, { session });
      if (!member || !canGrant(memberships, member) || member.userId === actor.userId) throw new AccountError("You cannot revoke that membership.", 403);
      await db.collection("memberships").deleteOne({ _id: member._id }, { session });
      const user = await db.collection("auth_users").findOne({ crmUserId: member.userId }, { session });
      if (user) await db.collection("auth_sessions").deleteMany({ userId: user._id }, { session });
      // Prevent outstanding invitations from silently restoring this scope.
      const profile = await db.collection("users").findOne({ _id: member.userId }, { session });
      if (profile) await db.collection("invitations").updateMany({ email: profile.email.toLowerCase(), role: member.role, agencyId: member.agencyId, ...(member.clientId ? { clientId: member.clientId } : {}), status: "pending" }, { $set: { status: "cancelled" } }, { session });
      return { message: "Membership revoked and current sessions ended." };
    }
    throw new AccountError("Unknown action.");
  }));
}

export async function acceptInvitation(input, signedInEmail = null) {
  const { db, client } = database();
  if (typeof input.token !== "string" || !/^[\w-]{43}$/.test(input.token)) throw new AccountError("Invitation is invalid or expired.");
  const filter = { tokenHash: tokenHash(input.token), status: "pending", expiresAt: { $gt: new Date() } };
  if (!await db.collection("invitations").findOne(filter)) throw new AccountError("Invitation is invalid or expired.");
  const name = text(input.name, "name");
  const existingInvite = await db.collection("invitations").findOne(filter);
  if (!existingInvite) throw new AccountError("Invitation is invalid or expired.");
  const existingAuth = await db.collection("auth_users").findOne({ email: existingInvite.email });
  let password;
  if (!existingAuth) {
    if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128) throw new AccountError("Use a password between 12 and 128 characters.");
    password = await hashPassword(input.password);
  }
  return client.withSession(async (session) => session.withTransaction(async () => {
    const invite = await db.collection("invitations").findOneAndUpdate({ ...filter, expiresAt: { $gt: new Date() } }, { $set: { status: "accepted", acceptedAt: new Date() } }, { session, returnDocument: "before" });
    if (!invite) throw new AccountError("Invitation is invalid, expired, or already used.");
    if (!invite.bootstrap) {
      const { memberships: senderGrants } = await loadPrincipal(db, invite.createdBy, session);
      if (!canGrant(senderGrants, invite)) throw new AccountError("The inviter no longer has permission.", 403);
      await scope(db, invite, session);
    } else if (invite.role !== roles.platformOperations || process.env.CRM_ENV !== "development") {
      throw new AccountError("Bootstrap invitation is unavailable.", 403);
    }
    let authUser = await db.collection("auth_users").findOne({ email: invite.email }, { session });
    if (authUser && signedInEmail !== invite.email) throw new AccountError("This email already has an account. Sign in before accepting this invitation.", 409);
    let profile = await db.collection("users").findOne({ email: invite.email }, { session, collation: { locale: "en", strength: 2 } });
    if (!profile) {
      profile = { _id: new ObjectId().toString(), name, email: invite.email };
      await db.collection("users").insertOne(profile, { session });
    }
    if (!authUser) {
      if (!password) throw new AccountError("Please retry invitation acceptance.", 409);
      authUser = { _id: new ObjectId(), name, email: invite.email, emailVerified: true, crmUserId: profile._id, createdAt: new Date(), updatedAt: new Date() };
      await db.collection("auth_users").insertOne(authUser, { session });
      await db.collection("auth_accounts").insertOne({ _id: new ObjectId(), userId: authUser._id, accountId: authUser._id.toString(), providerId: "credential", password, createdAt: new Date(), updatedAt: new Date() }, { session });
    }
    const member = { userId: profile._id, role: invite.role };
    if (invite.agencyId) member.agencyId = invite.agencyId;
    if (invite.clientId) member.clientId = invite.clientId;
    if (invite.role === roles.agencyAccountManager) member.salesFollowUpGranted = invite.salesFollowUpGranted === true;
    const { salesFollowUpGranted: grant, ...identity } = member;
    void grant;
    await db.collection("memberships").updateOne(identity, { $setOnInsert: { _id: new ObjectId().toString(), ...member } }, { upsert: true, session });
    return { message: "Invitation accepted. You can now sign in.", email: invite.email };
  }));
}
