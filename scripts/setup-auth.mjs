export async function setupAuth(db) {
  await db.collection("invitations").createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection("invitations").createIndex({ agencyId: 1, status: 1 });
  await db.collection("auth_users").createIndex({ email: 1 }, { unique: true });
  await db.collection("auth_users").createIndex({ crmUserId: 1 }, { unique: true });
  await db.collection("auth_accounts").createIndex({ userId: 1, providerId: 1 }, { unique: true });
  await db.collection("auth_sessions").createIndex({ token: 1 }, { unique: true });
  await db.collection("auth_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("auth_verifications").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
