import { auth } from "../../../../lib/auth.mjs";

const allowed = new Set(["sign-in/email", "sign-up/email", "sign-out", "get-session", "list-sessions", "revoke-session", "revoke-sessions", "revoke-other-sessions", "change-password"]);
async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
  if (!allowed.has(path)) return Response.json({ message: "Not available." }, { status: 404 });
  return auth().handler(request);
}
export const GET = handle;
export const POST = handle;
