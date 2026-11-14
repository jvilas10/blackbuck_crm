import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { database } from "../lib/database.mjs";
import { enquiryAccess } from "../lib/enquiry-access.mjs";
import { loadPrincipal } from "../lib/authorization.mjs";
import { snapshot, accountAction } from "../lib/accounts.mjs";
import { accountFixtures } from "./account-fixtures.mjs";

nextEnv.loadEnvConfig(process.cwd(), true);
async function verify() {
  if (process.env.CRM_ENV !== "development") throw new Error("Permission verification is development-only.");
  const { db, client } = database();
  const prefix = `t09-${randomUUID()}-`;
  const id = (value) => prefix + value;
  const actor = (key) => ({ userId: id(`fixture-user-${key}`), memberships: [{ role: "platform_operations" }] });
  const user = (key) => actor(key).userId;
  const collectionName = `_t09_${randomUUID().replaceAll("-", "")}`;
  // Use a private disposable collection for pre-T12 enquiry records. The repository
  // still executes real MongoDB filters/transactions without creating an app schema.
  const testDb = { collection: (name) => db.collection(name === "enquiries" ? collectionName : name) };
  const access = enquiryAccess(testDb, client);
  const inserted = {};
  const a = id("fixture-agency-a"), b = id("fixture-agency-b");
  const a1 = id("fixture-client-a1"), a2 = id("fixture-client-a2"), b1 = id("fixture-client-b1");
  const rows = [
    { _id: id("own"), agencyId: a, clientId: a1, assignedTo: user("client-a1-sales"), stage: "New" },
    { _id: id("other"), agencyId: a, clientId: a1, assignedTo: user("client-a1-backup-sales"), stage: "Qualified" },
    { _id: id("unassigned"), agencyId: a, clientId: a1, assignedTo: null, stage: "New" },
    { _id: id("other-client"), agencyId: a, clientId: a2, assignedTo: user("client-a2-sales"), stage: "Won" },
    { _id: id("other-agency"), agencyId: b, clientId: b1, assignedTo: user("client-b1-sales"), stage: "New" },
    { _id: id("malformed-pair"), agencyId: a, clientId: b1, assignedTo: user("client-a1-sales"), stage: "New" },
  ];
  const denied = async (promise) => assert.rejects(promise, (error) => [400, 401, 403, 404].includes(error.status));
  try {
    for (const [name, docs] of Object.entries(accountFixtures)) {
      const copies = docs.map((doc) => Object.fromEntries(Object.entries({ ...doc, synthetic: true }).map(([key, value]) =>
        [key, ["_id", "agencyId", "clientId", "userId"].includes(key) ? id(value) : key === "email" ? prefix + value : value])));
      inserted[name] = copies.map((doc) => doc._id);
      await db.collection(name).insertMany(copies);
    }
    await db.collection(collectionName).insertMany(rows);
    const sales = user("client-a1-sales"), manager = user("client-a1-manager"), admin = user("agency-a-admin");
    assert.deepEqual((await access.list(sales)).map((r) => r._id), [id("own")]);
    assert.equal((await access.list(admin)).length, 4);
    assert.equal((await access.list(manager)).length, 3);
    for (const target of [id("other"), id("other-client"), id("other-agency"), id("unassigned"), id("malformed-pair")]) {
      await denied(access.get(sales, target));
      await denied(access.updateSales(sales, target, { stage: "Won" }));
    }
    await access.updateSales(sales, id("own"), { stage: "Contacted" });
    await denied(access.updateSales(sales, id("own"), { agencyId: b }));
    await denied(access.updateSales(sales, id("own"), { assignedTo: user("client-b1-sales") }));
    await denied(access.list(sales, { clientId: a2 }));
    await denied(access.list(admin, { agencyId: { $ne: "" } }));
    await denied(access.list(admin, { $or: [] }));
    for (const action of ["list", "report", "exportRows"]) await denied(access[action](user("platform-operator")));
    await denied(access.report(sales));
    await denied(access.exportRows(sales));
    assert.equal((await access.report(manager)).reduce((total, r) => total + r.count, 0), 3);
    assert.equal((await access.exportRows(admin)).length, 4);
    await denied(access.report(manager, { clientId: a2 }));
    await denied(access.exportRows(admin, { agencyId: b }));
    const accountManager = user("agency-a-account-manager"), granted = user("agency-a-granted-manager");
    await denied(access.updateSales(accountManager, id("own"), { stage: "Won" }));
    await access.updateSales(granted, id("own"), { stage: "Qualified" });
    await denied(access.updateSales(granted, id("other-client"), { stage: "Won" }));
    await denied(access.assign(sales, id("own"), sales));
    for (const assignee of [user("client-a2-sales"), user("client-b1-sales"), accountManager, admin]) await denied(access.assign(manager, id("own"), assignee));
    await access.assign(accountManager, id("own"), user("client-a1-backup-sales"));
    await denied(access.updateSales(sales, id("own"), { stage: "Lost" }));
    assert.equal((await access.list(sales)).length, 0);
    await access.assign(manager, id("own"), null);
    const view = await snapshot(actor("client-a1-sales"));
    assert.deepEqual(view.clients.map((c) => c._id), [a1]);
    assert.equal(view.members.length, 0);
    await denied(accountAction(actor("client-a1-sales"), { action: "create-agency", name: "Denied forged roles" }));
    // A schema-valid but inconsistent membership must not authorize the wrong tenant.
    await db.collection("memberships").updateOne({ _id: id("fixture-membership-client-a1-sales") }, { $set: { clientId: b1 } });
    await denied(loadPrincipal(db, sales));
    await denied(access.get(sales, id("other-agency")));
    await db.collection("memberships").deleteOne({ _id: id("fixture-membership-agency-a-granted-manager") });
    await denied(access.updateSales(granted, id("other"), { stage: "Won" }));
    assert.equal((await db.collection(collectionName).findOne({ _id: id("other-agency") })).stage, "New");
    console.log("T09 Atlas verification passed: scoped lists/records/writes/assignments/reports/exports, grant restrictions, stale and malformed memberships, forged roles, and revocation.");
  } finally {
    await db.collection(collectionName).drop().catch((error) => { if (error.code !== 26) throw error; });
    for (const name of ["memberships", "users", "client_accounts", "agencies"]) {
      if (inserted[name]) await db.collection(name).deleteMany({ _id: { $in: inserted[name] } });
    }
    await client.close();
  }
}
verify().catch((error) => {
  console.error(`T09 verification failed (${error.name}): ${error instanceof assert.AssertionError ? error.message : "Review permission implementation and database access."}`);
  process.exitCode = 1;
});
