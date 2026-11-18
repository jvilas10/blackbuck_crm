"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";

export default function SignIn() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="panel"><h1>Sign in</h1><p>Use the account you created from your invitation.</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage("");
      const data = new FormData(event.currentTarget);
      try {
        const result = await authClient.signIn.email({ email: String(data.get("email")).trim().toLowerCase(), password: String(data.get("password")) });
        if (result.error) setMessage("Sign-in failed. Check your credentials and account access.");
        else { router.replace("/account"); router.refresh(); }
      } catch { setMessage("Unable to sign in. Please retry."); } finally { setBusy(false); }
    }}>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form><p role="status">{message}</p><p>New here? Ask your administrator for an invitation. Public signup is disabled.</p>
  </section>;
}
