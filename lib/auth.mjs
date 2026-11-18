import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { ObjectId } from "mongodb";
import { database } from "./database.mjs";
import { loadPrincipal } from "./authorization.mjs";
import { AccountError } from "./account-policy.mjs";

let instance;
export function auth() {
  if (instance) return instance;
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || !process.env.BETTER_AUTH_URL) {
    throw new Error("Configure BETTER_AUTH_SECRET and BETTER_AUTH_URL.");
  }
  const { db, client } = database();
  instance = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: [process.env.BETTER_AUTH_URL],
    database: mongodbAdapter(db, { client }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    user: { modelName: "auth_users", additionalFields: { crmUserId: { type: "string", required: true, input: false } } },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    session: { modelName: "auth_sessions", expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    databaseHooks: { session: { create: { before: async (session) => {
      const user = await db.collection("auth_users").findOne({ _id: new ObjectId(session.userId) });
      if (!user) return false;
      try { await loadPrincipal(db, user.crmUserId); }
      catch (error) { if (error instanceof AccountError) return false; throw error; }
      return { data: session };
    } } } },
  });
  return instance;
}

export async function currentAccount(headers) {
  const session = await auth().api.getSession({ headers });
  if (!session) return null;
  const { db } = database();
  const user = await db.collection("auth_users").findOne({ _id: new ObjectId(session.user.id) });
  if (!user) return null;
  try {
    const principal = await loadPrincipal(db, user.crmUserId);
    return { ...principal, name: session.user.name, email: session.user.email };
  } catch (error) { if (error instanceof AccountError) return null; throw error; }
}
