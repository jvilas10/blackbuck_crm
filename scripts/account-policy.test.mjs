import { test } from "node:test";
import assert from "node:assert/strict";
import { canGrant, validInvitation, invitationToken, tokenHash, emailAddress } from "../lib/account-policy.mjs";

test("invitation grants cannot cross agency/client boundaries or elevate privileges", () => {
  const admin = [{ role: "agency_admin", agencyId: "a" }];
  assert.equal(canGrant(admin, { role: "salesperson", agencyId: "a", clientId: "1" }), true);
  assert.equal(canGrant(admin, { role: "salesperson", agencyId: "b", clientId: "1" }), false);
  assert.equal(canGrant(admin, { role: "agency_admin", agencyId: "a" }), false);
  assert.equal(canGrant([{ role: "platform_operations" }], { role: "platform_operations" }), false);
  const manager = [{ role: "client_sales_manager", agencyId: "a", clientId: "1" }];
  assert.equal(canGrant(manager, { role: "salesperson", agencyId: "a", clientId: "1" }), true);
  assert.equal(canGrant(manager, { role: "salesperson", agencyId: "a", clientId: "2" }), false);
  assert.equal(canGrant(manager, { role: "client_sales_manager", agencyId: "a", clientId: "1" }), false);
});
test("only pending unexpired invitations are valid", () => {
  const now = new Date();
  for (const status of ["accepted", "cancelled"]) assert.equal(validInvitation({ status, expiresAt: new Date(+now + 1000) }, now), false);
  assert.equal(validInvitation({ status: "pending", expiresAt: now }, now), false);
  assert.equal(validInvitation({ status: "pending", expiresAt: new Date(+now + 1000) }, now), true);
});
test("invitation tokens are random and stored as hashes; email is normalized", () => {
  const token = invitationToken();
  assert.match(token, /^[\w-]{43}$/);
  assert.notEqual(token, invitationToken());
  assert.notEqual(tokenHash(token), token);
  assert.equal(emailAddress(" Person@Example.com "), "person@example.com");
  assert.throws(() => emailAddress("not an email"));
});
