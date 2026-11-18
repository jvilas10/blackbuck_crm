import { auth, currentAccount } from "../../../lib/auth.mjs";
import { accountAction, acceptInvitation, snapshot } from "../../../lib/accounts.mjs";
import { AccountError } from "../../../lib/account-policy.mjs";

function failure(error: unknown) {
  if (error instanceof AccountError) return Response.json({ message: error.message }, { status: error.status });
  console.error("Account operation failed.");
  return Response.json({ message: "The operation could not be completed. Please retry." }, { status: 500 });
}
export async function GET(request: Request) {
  try {
    const actor = await currentAccount(request.headers);
    if (!actor) return Response.json({ message: "Sign in to continue." }, { status: 401 });
    return Response.json(await snapshot(actor), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL!).origin) throw new AccountError("Invalid request origin.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccountError("JSON required.", 415);
    const raw = await request.text();
    if (raw.length > 16384) throw new AccountError("Request is too large.", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw new AccountError("Invalid request."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountError("Invalid request.");
    if (input.action === "accept-invitation") {
      const session = await auth().api.getSession({ headers: request.headers });
      return Response.json(await acceptInvitation(input, session?.user.email ?? null), { headers: { "Cache-Control": "no-store" } });
    }
    const actor = await currentAccount(request.headers);
    if (!actor) throw new AccountError("Sign in to continue.", 401);
    return Response.json(await accountAction(actor, input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
