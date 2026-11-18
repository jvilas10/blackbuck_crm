import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import nextEnv from "@next/env";
import { database } from "../lib/database.mjs";
import { accountFixtures } from "./account-fixtures.mjs";
import { accountAction, snapshot } from "../lib/accounts.mjs";
import { readSupportEnquiries } from "../lib/support-access.mjs";
import { enquiryAccess } from "../lib/enquiry-access.mjs";

nextEnv.loadEnvConfig(process.cwd(), true);
async function verify() {
  if (process.env.CRM_ENV !== "development") throw new Error("T10 verification is development-only.");
  const { db, client } = database();
  const prefix = `t10-${randomUUID()}-`, id = (s) => prefix + s;
  const user = (s) => id(`fixture-user-${s}`);
  const actor = (s) => ({ userId: user(s) });
  const member = (s) => id(`fixture-membership-${s}`);
  const a = id("fixture-agency-a"), b = id("fixture-agency-b"), a1 = id("fixture-client-a1"), a2 = id("fixture-client-a2"), b1 = id("fixture-client-b1");
  const admin = actor("agency-a-admin"), operator = actor("platform-operator"), manager = actor("client-a1-manager"), sales = actor("client-a1-sales");
  const inserted = {}, collectionName = `_t10_${randomUUID().replaceAll("-", "")}`;
  const testDb = { collection: (name) => db.collection(name === "enquiries" ? collectionName : name) };
  const denied = (promise) => assert.rejects(promise, (e) => [400, 401, 403, 404, 409].includes(e.status));
  const act = (who, input) => accountAction(who, input);
  const request = () => act(operator, { action: "request-support", clientId: a1, reason: "Synthetic verification" });
  const read = (r, who = operator, record = null) => readSupportEnquiries(testDb, client, who.userId, r.id, record);
  try {
    assert.ok(await db.collection("schema_migrations").findOne({ _id: "004-administration" }), "Run db:setup first");
    for (const [name, docs] of Object.entries(accountFixtures)) {
      const copies = docs.map((doc) => Object.fromEntries(Object.entries({ ...doc, synthetic: true }).map(([key, value]) =>
        [key, ["_id", "agencyId", "clientId", "userId"].includes(key) ? id(value) : key === "email" ? prefix + value : value])));
      inserted[name] = copies.map((d) => d._id);
      await db.collection(name).insertMany(copies);
    }
    await db.collection(collectionName).insertMany([
      { _id: id("record"), agencyId: a, clientId: a1, stage: "New", secret: "must not be returned" },
      { _id: id("foreign"), agencyId: b, clientId: b1, stage: "New" },
      { _id: id("sibling"), agencyId: a, clientId: a2, stage: "New" },
    ]);
    await act(admin, { action: "select-client", clientId: a2 });
    assert.equal((await snapshot(admin)).activeClientId, a2);
    await denied(act(manager, { action: "select-client", clientId: a2 }));
    await denied(act(admin, { action: "select-client", clientId: b1 }));
    await act(admin, { action: "select-client", clientId: null });
    assert.equal((await snapshot(admin)).activeClientId, null);
    await act(admin, { action: "rename-client", id: a1, expectedName: "Sample Client A1", name: "Renamed sample" });
    await denied(act(admin, { action: "rename-client", id: a1, expectedName: "Sample Client A1", name: "Stale" }));
    await denied(act(manager, { action: "rename-client", id: a1, expectedName: "Renamed sample", name: "Denied" }));
    await denied(act(admin, { action: "rename-client", id: b1, expectedName: "Sample Client B1", name: "Denied" }));
    const authId = new ObjectId();
    await db.collection("auth_users").insertOne({ _id: authId, crmUserId: sales.userId, email: `${prefix}sales@example.invalid` });
    await db.collection("auth_sessions").insertOne({ token: prefix, userId: authId, expiresAt: new Date(Date.now() + 60000) });
    const invite = await act(manager, { action: "invite", agencyId: a, clientId: a1, role: "salesperson", email: `${prefix}client-a1-sales@example.invalid` });
    assert.ok(invite.invitationURL);
    const change = { action: "change-role", id: member("client-a1-sales"), expectedRole: "salesperson", expectedGrant: false, role: "agency_account_manager", salesFollowUpGranted: true };
    await denied(act(manager, change));
    await denied(act(actor("agency-b-admin"), change));
    await act(admin, change);
    assert.equal(await db.collection("auth_sessions").countDocuments({ userId: authId }), 0);
    assert.equal((await db.collection("invitations").findOne({ agencyId: a })).status, "cancelled");
    assert.equal((await db.collection("memberships").findOne({ _id: change.id })).salesFollowUpGranted, true);
    await denied(act(admin, change));
    await denied(act(admin, { ...change, id: member("agency-a-admin"), expectedRole: "agency_admin" }));
    await denied(act(operator, { action: "revoke-membership", id: member("agency-a-admin") }));
    await denied(act(operator, { action: "change-role", id: member("agency-a-admin"), expectedRole: "agency_admin", role: "salesperson", clientId: a1 }));
    console.log("T10: client context, client edits, role grants, stale edits, session invalidation and last-admin protection passed.");
    await denied(act(sales, { action: "request-support", clientId: a1, reason: "Denied" }));
    const r = await request();
    await denied(read(r));
    await denied(act(operator, { action: "approve-support", id: r.id }));
    await denied(act(actor("agency-b-admin"), { action: "approve-support", id: r.id }));
    await act(manager, { action: "approve-support", id: r.id });
    const records = await read(r);
    assert.deepEqual(records, [{ _id: id("record"), stage: "New" }]);
    await denied(read(r, manager));
    await denied(read(r, operator, id("foreign")));
    await denied(read(r, operator, id("sibling")));
    await denied(enquiryAccess(testDb, client).list(operator.userId));
    assert.equal((await db.collection("support_requests").findOne({ _id: new ObjectId(r.id) })).readCount, 1);
    await act(admin, { action: "revoke-support", id: r.id });
    await denied(read(r));
    const expired = await request();
    await act(admin, { action: "approve-support", id: expired.id });
    await db.collection("support_requests").updateOne({ _id: new ObjectId(expired.id) }, { $set: { expiresAt: new Date(0) } });
    await denied(read(expired));
    assert.equal((await snapshot(operator)).supportRequests.find((s) => s._id === expired.id).status, "expired");
    const rejected = await request();
    await act(manager, { action: "reject-support", id: rejected.id });
    await denied(act(admin, { action: "approve-support", id: rejected.id }));
    await denied(read(rejected));
    const stale = await request();
    await act(manager, { action: "approve-support", id: stale.id });
    await act(admin, { action: "revoke-membership", id: member("client-a1-manager") });
    await denied(read(stale));
    const events = (await snapshot(admin)).auditEvents;
    for (const action of ["client.renamed", "membership.changed", "invitation.created", "support.requested", "support.approved", "support.read", "support.revoked", "support.rejected"]) assert.ok(events.some((e) => e.action === action), action);
    assert.ok(events.every((e) => e.agencyId === a));
    assert.equal((await snapshot(actor("client-a2-sales"))).auditEvents.length, 0);
    assert.equal((await snapshot(actor("agency-b-admin"))).supportRequests.length, 0);
    assert.ok(!JSON.stringify(events).includes(invite.invitationURL.split("#")[1]));
    console.log("T10: support approval, projection, client isolation, normal operator denial, expiry, rejection, revocation, stale approver and audit scopes passed.");
    // Exercise simultaneous removal of the final two administrators.
    const extra = { _id: id("extra-admin"), userId: sales.userId, role: "agency_admin", agencyId: a, synthetic: true };
    await db.collection("memberships").insertOne(extra); inserted.memberships.push(extra._id);
    const results = await Promise.allSettled([member("agency-a-admin"), extra._id].map((key) => act(operator, { action: "revoke-membership", id: key })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await db.collection("memberships").countDocuments({ agencyId: a, role: "agency_admin" }), 1);
    console.log("T10 Atlas verification passed, including concurrent last-administrator removal.");
  } finally {
    await db.collection(collectionName).drop().catch((e) => { if (e.code !== 26) throw e; });
    const userIds = inserted.users || [];
    const authUsers = await db.collection("auth_users").find({ crmUserId: { $in: userIds } }).toArray();
    await db.collection("auth_sessions").deleteMany({ userId: { $in: authUsers.map((u) => u._id) } });
    await db.collection("auth_users").deleteMany({ crmUserId: { $in: userIds } });
    for (const name of ["invitations", "support_requests", "audit_events"]) await db.collection(name).deleteMany({ agencyId: { $in: [a, b] } });
    await db.collection("audit_events").deleteMany({ actorId: { $in: userIds } });
    await db.collection("user_preferences").deleteMany({ _id: { $in: userIds } });
    await db.collection("admin_locks").deleteMany({ _id: { $in: [a, b] } });
    for (const name of ["memberships", "users", "client_accounts", "agencies"]) if (inserted[name]) await db.collection(name).deleteMany({ _id: { $in: inserted[name] } });
    await client.close();
  }
}
verify().catch((error) => {
  console.error(`T10 verification failed (${error.name}): ${error instanceof assert.AssertionError ? error.message : "Review administration implementation and database access."}`);
  process.exitCode = 1;
});
