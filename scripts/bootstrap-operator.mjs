import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { database } from "../lib/database.mjs";
import { emailAddress, invitationToken, tokenHash } from "../lib/account-policy.mjs";

nextEnv.loadEnvConfig(process.cwd(), true);
async function bootstrap() {
  if (process.env.CRM_ENV !== "development") throw new Error("Operator bootstrap is development-only.");
  const email = emailAddress(process.argv[2] || "operator@example.invalid");
  const { db, client } = database();
  try {
    if (await db.collection("memberships").findOne({ role: "platform_operations", userId: { $not: /^fixture-/ } })) throw new Error("An operator is already provisioned.");
    const token = invitationToken();
    await db.collection("invitations").insertOne({ email, role: "platform_operations", bootstrap: true, tokenHash: tokenHash(token), status: "pending", createdAt: new Date(), expiresAt: new Date(Date.now() + 48 * 3600000) });
    await mkdir(".local", { recursive: true });
    await writeFile(".local/operator-invitation.txt", `${process.env.BETTER_AUTH_URL}/accept-invitation#${token}\n`, { mode: 0o600 });
    console.log("Private operator invitation saved to .local/operator-invitation.txt (expires in 48 hours).");
  } finally { await client.close(); }
}
bootstrap().catch((error) => { console.error(error.message); process.exitCode = 1; });
