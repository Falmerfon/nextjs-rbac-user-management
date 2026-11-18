import Link from "next/link";

/**
 * Shown, with HTTP status 403, when a page calls forbidden(). The user is
 * logged in but their role does not allow this page. Next sends this file with
 * every route, so it stays a plain Server Component with no interactive UI.
 */
export default function Forbidden() {
  return (
    <section>
      <h1>403: access denied</h1>
      <p>You are signed in, but your role does not allow you to open this page.</p>
      <p>
        <Link href="/">Go to your home page</Link>
      </p>
    </section>
  );
}
