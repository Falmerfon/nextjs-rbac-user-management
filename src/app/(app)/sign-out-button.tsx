"use client";

import { useState } from "react";
import { callApi } from "@/app/_lib/api";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await callApi("POST", "/api/auth/logout", undefined, { redirectOn401: false });
    window.location.replace("/login");
  }

  return (
    <button type="button" onClick={signOut} disabled={busy}>
      Sign out
    </button>
  );
}
