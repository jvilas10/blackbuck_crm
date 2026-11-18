export const roles = {
  agencyAdmin: "agency_admin",
  agencyAccountManager: "agency_account_manager",
  clientSalesManager: "client_sales_manager",
  salesperson: "salesperson",
  platformOperations: "platform_operations",
};

const id = { bsonType: "string", minLength: 1 };
const boolean = { bsonType: "bool" };

function schema(required, properties) {
  return {
    bsonType: "object",
    additionalProperties: false,
    required: ["_id", ...required],
    properties: { _id: id, synthetic: boolean, ...properties },
  };
}

function membership(role, scope) {
  return schema(["userId", "role", ...Object.keys(scope)], {
    userId: id,
    role: { enum: [role] },
    ...scope,
  });
}

export const accountCollections = {
  agencies: schema(["name"], { name: id }),
  client_accounts: schema(["agencyId", "name"], { agencyId: id, name: id }),
  users: schema(["name", "email"], {
    name: id,
    email: { bsonType: "string", pattern: "^[^\\s@]+@[^\\s@]+$" },
  }),
  memberships: {
    oneOf: [
      membership(roles.agencyAdmin, { agencyId: id }),
      membership(roles.agencyAccountManager, {
        agencyId: id,
        clientId: id,
        salesFollowUpGranted: boolean,
      }),
      membership(roles.clientSalesManager, { agencyId: id, clientId: id }),
      membership(roles.salesperson, { agencyId: id, clientId: id }),
      membership(roles.platformOperations, {}),
    ],
  },
};

export const accountIndexes = {
  client_accounts: [{ key: { agencyId: 1 }, name: "clients_by_agency" }],
  users: [{
    key: { email: 1 },
    name: "unique_user_email",
    unique: true,
    collation: { locale: "en", strength: 2 },
  }],
  memberships: [{
    key: { userId: 1, role: 1, agencyId: 1, clientId: 1 },
    name: "unique_membership_scope",
    unique: true,
  }],
};
