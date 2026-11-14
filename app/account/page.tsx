import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentAccount } from "../../lib/auth.mjs";
import { AccountControls } from "./controls";
import { snapshot } from "../../lib/accounts.mjs";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const actor = await currentAccount(await headers());
  if (!actor) redirect("/sign-in");
  const initial = JSON.parse(JSON.stringify(await snapshot(actor)));
  return <><h1>Account and team</h1><p>Signed in as {actor.name} ({actor.email})</p><AccountControls initial={initial} /></>;
}
