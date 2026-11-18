import { redirect } from "next/navigation";
import { ROLE_DEFINITIONS } from "@/permissions/roles";
import { getCurrentUser } from "@/server/current-user";

/** Nobody lives at "/". Everyone is sent to where their role starts. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? ROLE_DEFINITIONS[user.role].homePath : "/login");
}
