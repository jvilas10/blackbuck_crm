import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import nextEnv from "@next/env";
import { database } from "../lib/database.mjs";
import { auth, currentAccount } from "../lib/auth.mjs";
import { accountAction, acceptInvitation } from "../lib/accounts.mjs";
import { invitationToken, tokenHash } from "../lib/account-policy.mjs";

nextEnv.loadEnvConfig(process.cwd(), true);
async function verify() {
  if (process.env.CRM_ENV !== "development") throw new Error("Verification is development-only.");
  const { db, client } = database();
  const prefix = `t08-${randomUUID()}`;
  const emails = ["operator", "admin", "sales", "expired", "cancelled", "race"].map((role) => `${prefix}-${role}@example.invalid`);
  const agencyIds = [];
  const password = `Test-${randomUUID()}!`;
  const base = process.env.BETTER_AUTH_URL;
  async function request(path, body, cookie = "") {
    return auth().handler(new Request(`${base}/api/auth/${path}`, {
      method: body ? "POST" : "GET", headers: { origin: base, "Content-Type": "application/json", cookie }, ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  }
  async function signIn(email) {
    // Exercise the real limiter; pace test logins instead of disabling it.
    await setTimeout(11000);
    const response = await request("sign-in/email", { email, password });
    assert.equal(response.status, 200, `Sign-in failed (${response.status}).`);
    const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie);
    return cookie;
  }
  async function actor(cookie) { return currentAccount(new Headers({ cookie })); }
  const tokenFrom = (result) => result.invitationURL.split("#")[1];
  try {
    const token = invitationToken();
    await db.collection("invitations").insertOne({ email: emails[0], role: "platform_operations", bootstrap: true, tokenHash: tokenHash(token), status: "pending", expiresAt: new Date(Date.now() + 60000) });
    await acceptInvitation({ token, name: "Synthetic T08 operator", password });
    const operatorCookie = await signIn(emails[0]);
    const operator = await actor(operatorCookie);
    assert.ok(operator);
    const agency = await accountAction(operator, { action: "create-agency", name: prefix }); agencyIds.push(agency.id);
    const otherAgency = await accountAction(operator, { action: "create-agency", name: `${prefix}-other` }); agencyIds.push(otherAgency.id);
    const clientResult = await accountAction(operator, { action: "create-client", agencyId: agency.id, name: prefix });
    const invite = await accountAction(operator, { action: "invite", email: emails[1], role: "agency_admin", agencyId: agency.id });
    const adminToken = tokenFrom(invite);
    await acceptInvitation({ token: adminToken, name: "Synthetic admin", password });
    await assert.rejects(acceptInvitation({ token: adminToken, name: "Replay", password }));
    const adminCookie = await signIn(emails[1]);
    const admin = await actor(adminCookie);
    await assert.rejects(accountAction(admin, { action: "create-client", agencyId: otherAgency.id, name: "Denied" }));
    await assert.rejects(accountAction(admin, { action: "invite", email: emails[2], role: "agency_admin", agencyId: agency.id }));
    await assert.rejects(accountAction(operator, { action: "invite", email: emails[2], role: "salesperson", agencyId: otherAgency.id, clientId: clientResult.id }));
    const salesInvite = await accountAction(admin, { action: "invite", email: emails[2], role: "salesperson", agencyId: agency.id, clientId: clientResult.id });
    await acceptInvitation({ token: tokenFrom(salesInvite), name: "Synthetic salesperson", password });
    const salesCookie = await signIn(emails[2]);
    const sales = await actor(salesCookie);
    assert.ok(sales);
    const additionalInvite = await accountAction(admin, { action: "invite", email: emails[2], role: "salesperson", agencyId: agency.id, clientId: clientResult.id });
    await assert.rejects(acceptInvitation({ token: tokenFrom(additionalInvite), name: "Existing user", password }));
    await acceptInvitation({ token: tokenFrom(additionalInvite), name: "Existing user", password }, emails[2]);
    await assert.rejects(accountAction(sales, { action: "create-agency", name: "Denied" }));
    const publicSignup = await request("sign-up/email", { email: emails[3], name: "Denied", password });
    assert.notEqual(publicSignup.status, 200);
    for (const [email, status] of [[emails[3], "expired"], [emails[4], "cancelled"]]) {
      const result = await accountAction(admin, { action: "invite", email, role: "salesperson", agencyId: agency.id, clientId: clientResult.id });
      const inviteToken = tokenFrom(result);
      const row = await db.collection("invitations").findOne({ tokenHash: tokenHash(inviteToken) });
      if (status === "expired") await db.collection("invitations").updateOne({ _id: row._id }, { $set: { expiresAt: new Date(0) } });
      else await accountAction(admin, { action: "cancel-invitation", id: row._id.toString() });
      await assert.rejects(acceptInvitation({ token: inviteToken, name: "Denied", password }));
    }
    const raceInvite = await accountAction(admin, { action: "invite", email: emails[5], role: "salesperson", agencyId: agency.id, clientId: clientResult.id });
    const raceResults = await Promise.allSettled([1, 2].map(() => acceptInvitation({ token: tokenFrom(raceInvite), name: "Synthetic race", password })));
    assert.equal(raceResults.filter((r) => r.status === "fulfilled").length, 1);
    const otherCookie = await signIn(emails[2]);
    const endOthers = await request("revoke-other-sessions", {}, salesCookie);
    assert.equal(endOthers.status, 200);
    assert.equal(await actor(otherCookie), null);
    assert.ok(await actor(salesCookie));
    const logout = await request("sign-out", {}, salesCookie);
    assert.equal(logout.status, 200);
    assert.equal(await actor(salesCookie), null);
    const revokeCookie = await signIn(emails[2]);
    await accountAction(admin, { action: "revoke-membership", id: sales.memberships[0]._id });
    assert.equal(await actor(revokeCookie), null);
    const deniedLogin = await request("sign-in/email", { email: emails[2], password });
    assert.notEqual(deniedLogin.status, 200);
    assert.notEqual(deniedLogin.status, 429, "Revocation must reject login independently of throttling.");
    console.log("T08 integration passed: provisioning, invite-only registration, replay/race/expiry/cancellation, tenant boundaries, sign-in, session persistence, other-device logout, logout, and revocation.");
  } finally {
    // Only remove this run's synthetic identities and the resources it created.
    const profiles = await db.collection("users").find({ email: { $in: emails } }).toArray();
    const authUsers = await db.collection("auth_users").find({ email: { $in: emails } }).toArray();
    const profileIds = profiles.map((u) => u._id);
    const authIds = authUsers.map((u) => u._id);
    await db.collection("auth_sessions").deleteMany({ userId: { $in: authIds } });
    await db.collection("auth_accounts").deleteMany({ userId: { $in: authIds } });
    await db.collection("auth_users").deleteMany({ _id: { $in: authIds } });
    await db.collection("memberships").deleteMany({ userId: { $in: profileIds } });
    await db.collection("users").deleteMany({ _id: { $in: profileIds } });
    await db.collection("invitations").deleteMany({ email: { $in: emails } });
    await db.collection("client_accounts").deleteMany({ agencyId: { $in: agencyIds } });
    await db.collection("agencies").deleteMany({ _id: { $in: agencyIds } });
    await client.close();
  }
}
verify().catch((error) => { console.error(`T08 verification failed (${error.name}): ${error instanceof assert.AssertionError ? error.message : "Check database configuration and implementation."}`); process.exitCode = 1; });
