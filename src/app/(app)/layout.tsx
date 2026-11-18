import Link from "next/link";
import type { ReactNode } from "react";
import { ROLE_DEFINITIONS, hasCapability } from "@/permissions/roles";
import { getCurrentUser } from "@/server/current-user";
import { SignOutButton } from "./sign-out-button";

/**
 * The header of every signed-in page. It only shows what the user may open,
 * and that is a convenience. A layout is not rendered again on client-side
 * navigation, so it is not where access is checked: each page does that.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const canViewContent = user !== null && hasCapability(user.role, "content:view");
  const canManageUsers =
    user !== null &&
    (hasCapability(user.role, "users:read:all") ||
      hasCapability(user.role, "users:read:reports"));

  return (
    <>
      <header>
        <nav aria-label="Main">
          {canViewContent ? <Link href="/content">Clients</Link> : null}
          {canViewContent ? <Link href="/content/me">My profile</Link> : null}
          {canManageUsers ? <Link href="/manage-users">Manage users</Link> : null}
        </nav>
        {user ? (
          <div>
            <span>
              {user.fullName} <span className="muted">({ROLE_DEFINITIONS[user.role].label})</span>
            </span>{" "}
            <SignOutButton />
          </div>
        ) : null}
      </header>
      <main>{children}</main>
    </>
  );
}
