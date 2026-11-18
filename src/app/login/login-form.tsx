"use client";

import { useState, type FormEvent } from "react";
import { callApi, describeError } from "@/app/_lib/api";
import type { User } from "@/domain/user";
import { ROLE_DEFINITIONS } from "@/permissions/roles";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const reply = await callApi<{ user: User }>(
      "POST",
      "/api/auth/login",
      { email, password },
      { redirectOn401: false },
    );

    if (reply.data) {
      // A full page load, so nothing from before the login is left in the router.
      window.location.replace(ROLE_DEFINITIONS[reply.data.user.role].homePath);
      return;
    }
    setError(describeError(reply.error));
    setBusy(false);
  }

  return (
    <form onSubmit={submit}>
      <label>
        Email
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
