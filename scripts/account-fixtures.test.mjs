import assert from "node:assert/strict";
import { test } from "node:test";
import { accountFixtures } from "./account-fixtures.mjs";
import { roles } from "./account-model.mjs";

test("fixtures cover every role and support testing agency, client, and assignment boundaries", () => {
  const { agencies, client_accounts: clients, users, memberships } = accountFixtures;
  assert.deepEqual(new Set(memberships.map(({ role }) => role)), new Set(Object.values(roles)));
  assert.equal(agencies.length, 2);
  assert.deepEqual(agencies.map(({ _id }) => clients.filter(({ agencyId }) => agencyId === _id).length), [2, 1]);
  for (const { userId, agencyId, clientId, role } of memberships) {
    assert.ok(users.some(({ _id }) => _id === userId));
    if (role === roles.platformOperations) {
      assert.equal(agencyId, undefined);
      assert.equal(clientId, undefined);
    } else {
      assert.ok(agencies.some(({ _id }) => _id === agencyId));
    }
    if (clientId) {
      assert.ok(clients.some((client) => client._id === clientId && client.agencyId === agencyId));
    }
  }
  assert.equal(memberships.filter(({ role, clientId }) =>
    role === roles.salesperson && clientId === clients[0]._id).length, 2);
  assert.deepEqual(new Set(memberships.filter(({ role }) => role === roles.agencyAccountManager)
    .map(({ salesFollowUpGranted }) => salesFollowUpGranted)), new Set([false, true]));
});
