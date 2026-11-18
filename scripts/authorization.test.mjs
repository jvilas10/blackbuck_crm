import assert from "node:assert/strict";
import { test } from "node:test";
import { customerFilter, eligibleAssignee } from "../lib/authorization.mjs";
import { accountFixtures } from "./account-fixtures.mjs";

const principal = (key) => ({ userId: `fixture-user-${key}`, memberships: accountFixtures.memberships.filter((m) => m.userId === `fixture-user-${key}`) });
function matches(filter, record) {
  return filter.$or?.some((scope) => Object.entries(scope).every(([key, value]) => record[key] === value)) ?? false;
}
const own = { agencyId: "fixture-agency-a", clientId: "fixture-client-a1", assignedTo: "fixture-user-client-a1-sales" };
const other = { ...own, assignedTo: "fixture-user-client-a1-backup-sales" };

test("salespeople can read and update only their assigned enquiries, not assign/report/export", () => {
  for (const action of ["read", "follow-up"]) {
    const filter = customerFilter(principal("client-a1-sales"), action);
    assert.equal(matches(filter, own), true);
    for (const record of [other, { ...own, assignedTo: null }, { ...own, clientId: "fixture-client-a2" }, { ...own, agencyId: "fixture-agency-b" }]) assert.equal(matches(filter, record), false);
  }
  for (const action of ["assign", "report", "export"]) assert.equal(matches(customerFilter(principal("client-a1-sales"), action), own), false);
});
test("account managers require an explicit follow-up grant and remain assigned-client scoped", () => {
  for (const key of ["agency-a-account-manager", "agency-a-granted-manager"]) {
    for (const action of ["read", "assign", "report", "export"]) {
      assert.equal(matches(customerFilter(principal(key), action), own), true);
      assert.equal(matches(customerFilter(principal(key), action), { ...own, clientId: "fixture-client-a2" }), false);
    }
    assert.equal(matches(customerFilter(principal(key), "follow-up"), own), key === "agency-a-granted-manager");
  }
});
test("agency administrators and client managers are scoped; platform operations has no customer access", () => {
  for (const action of ["read", "assign", "report", "export"]) {
    assert.equal(matches(customerFilter(principal("agency-a-admin"), action), { ...own, clientId: "fixture-client-a2" }), true);
    assert.equal(matches(customerFilter(principal("agency-a-admin"), action), { ...own, agencyId: "fixture-agency-b" }), false);
    assert.equal(matches(customerFilter(principal("client-a1-manager"), action), own), true);
    assert.equal(matches(customerFilter(principal("client-a1-manager"), action), { ...own, clientId: "fixture-client-a2" }), false);
    assert.equal(matches(customerFilter(principal("platform-operator"), action), own), false);
  }
  assert.equal(matches(customerFilter(principal("agency-a-admin"), "follow-up"), own), false);
  assert.equal(matches(customerFilter(principal("client-a1-manager"), "follow-up"), own), true);
});
test("unknown actions, malformed principals, and another user's memberships cannot authorize", () => {
  assert.throws(() => customerFilter(principal("agency-a-admin"), "$where"));
  assert.equal(matches(customerFilter(null, "read"), own), false);
  assert.equal(matches(customerFilter({ ...principal("agency-a-admin"), userId: "attacker" }, "read"), own), false);
});
test("assignment requires an eligible sales role in the same agency and client", () => {
  for (const member of accountFixtures.memberships) {
    const expected = member.agencyId === own.agencyId && member.clientId === own.clientId &&
      (["salesperson", "client_sales_manager"].includes(member.role) || member.salesFollowUpGranted === true);
    assert.equal(eligibleAssignee(member, own.agencyId, own.clientId), expected);
  }
});
