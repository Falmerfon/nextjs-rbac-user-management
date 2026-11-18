import { redirect } from "next/navigation";
import { ROLE_DEFINITIONS } from "@/permissions/roles";
import { getCurrentUser } from "@/server/current-user";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Someone who is already signed in goes where their role starts. A stale
  // cookie of a deactivated user does not resolve, so they see the form.
  const user = await getCurrentUser();
  if (user) redirect(ROLE_DEFINITIONS[user.role].homePath);

  return (
    <main>
      <h1>Sign in</h1>
      <LoginForm />
    </main>
  );
}
