import { authorizeUserManagement } from "@/permissions/policy";
import { orInterrupt, requireAllowed } from "@/server/page-guards";
import { listUsers } from "@/server/services/users";
import { getStore } from "@/server/store";
import { UsersManager } from "./users-manager";

export default async function ManageUsersPage() {
  const user = await requireAllowed(authorizeUserManagement);
  // listUsers returns what this user may see: everyone for IT, direct reports
  // for a manager. The filtering happens in the service, not in the table.
  const users = orInterrupt(listUsers(getStore(), user));

  return (
    <>
      <h1>Manage users</h1>
      <UsersManager currentUser={user} users={users} />
    </>
  );
}
