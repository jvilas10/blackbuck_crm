import { roles } from "./account-model.mjs";

const agencyA = "fixture-agency-a";
const agencyB = "fixture-agency-b";
const clientA1 = "fixture-client-a1";
const clientA2 = "fixture-client-a2";
const clientB1 = "fixture-client-b1";

const staff = [
  ["agency-a-admin", roles.agencyAdmin, { agencyId: agencyA }],
  ["agency-a-account-manager", roles.agencyAccountManager, {
    agencyId: agencyA, clientId: clientA1, salesFollowUpGranted: false,
  }],
  ["agency-a-granted-manager", roles.agencyAccountManager, {
    agencyId: agencyA, clientId: clientA1, salesFollowUpGranted: true,
  }],
  ["client-a1-manager", roles.clientSalesManager, { agencyId: agencyA, clientId: clientA1 }],
  ["client-a1-sales", roles.salesperson, { agencyId: agencyA, clientId: clientA1 }],
  ["client-a1-backup-sales", roles.salesperson, { agencyId: agencyA, clientId: clientA1 }],
  ["client-a2-sales", roles.salesperson, { agencyId: agencyA, clientId: clientA2 }],
  ["agency-b-admin", roles.agencyAdmin, { agencyId: agencyB }],
  ["client-b1-sales", roles.salesperson, { agencyId: agencyB, clientId: clientB1 }],
  ["platform-operator", roles.platformOperations, {}],
];

export const accountFixtures = {
  agencies: [
    { _id: agencyA, name: "Sample Agency A" },
    { _id: agencyB, name: "Sample Agency B" },
  ],
  client_accounts: [
    { _id: clientA1, agencyId: agencyA, name: "Sample Client A1" },
    { _id: clientA2, agencyId: agencyA, name: "Sample Client A2" },
    { _id: clientB1, agencyId: agencyB, name: "Sample Client B1" },
  ],
  users: staff.map(([key]) => ({
    _id: `fixture-user-${key}`, name: key.replaceAll("-", " "), email: `${key}@example.invalid`,
  })),
  memberships: staff.map(([key, role, scope]) => ({
    _id: `fixture-membership-${key}`, userId: `fixture-user-${key}`, role, ...scope,
  })),
};
