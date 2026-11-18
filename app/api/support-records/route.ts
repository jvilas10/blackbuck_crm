import { currentAccount } from "../../../lib/auth.mjs";
import { database } from "../../../lib/database.mjs";
import { readSupportEnquiries } from "../../../lib/support-access.mjs";
import { AccountError } from "../../../lib/account-policy.mjs";

// POST because every successful read records a grant usage and audit event.
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL!).origin) throw new AccountError("Invalid request origin.", 403);
    const actor = await currentAccount(request.headers);
    if (!actor) throw new AccountError("Sign in to continue.", 401);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccountError("JSON required.", 415);
    const raw = await request.text();
    if (raw.length > 2048) throw new AccountError("Request too large.", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw new AccountError("Invalid request."); }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["requestId", "enquiryId"].includes(key))) throw new AccountError("Invalid request.");
    const { db, client } = database();
    const records = await readSupportEnquiries(db, client, actor.userId, input.requestId, input.enquiryId ?? null);
    return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AccountError ? error.status : 500;
    return Response.json({ message: error instanceof AccountError ? error.message : "Support access could not be completed." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
