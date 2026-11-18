"use client";
import Link from "next/link";
import { useState } from "react";

export default function AcceptInvitation() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return <section className="panel"><h1>Accept invitation</h1>
    <p>Create your account using this private invitation. If you already have an account, <Link href="/sign-in" target="_blank" rel="noreferrer">sign in in another tab</Link>, then return here. Your existing password will stay unchanged.</p>
    {!done && <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage("");
      const data = new FormData(event.currentTarget);
      try {
        const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept-invitation", token: window.location.hash.slice(1), name: data.get("name"), password: data.get("password") }) });
        const result = await response.json(); setMessage(result.message);
        if (response.ok) { setDone(true); window.history.replaceState(null, "", "/accept-invitation"); }
      } catch { setMessage("Unable to accept invitation. Please retry."); } finally { setBusy(false); }
    }}>
      <label>Your name<input name="name" autoComplete="name" maxLength={200} required /></label>
      <label>New account password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} /></label>
      <p>For a new account, use at least 12 characters. Leave blank if you are already signed in.</p>
      <button disabled={busy}>{busy ? "Accepting…" : "Accept invitation"}</button>
    </form>}
    <p role="status">{message}</p>{done && <Link href="/sign-in">Continue to sign in</Link>}
  </section>;
}
