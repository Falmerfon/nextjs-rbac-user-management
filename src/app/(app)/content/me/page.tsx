import { ROLE_DEFINITIONS } from "@/permissions/roles";
import { orInterrupt, requirePageUser } from "@/server/page-guards";
import { getMyProfile } from "@/server/services/profile";
import { getStore } from "@/server/store";

export default async function MyProfilePage() {
  const actor = await requirePageUser();
  const { user, managerName } = orInterrupt(getMyProfile(getStore(), actor));

  return (
    <>
      <h1>My profile</h1>
      <dl>
        <dt>Name</dt>
        <dd>{user.fullName}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>{ROLE_DEFINITIONS[user.role].label}</dd>
        <dt>Status</dt>
        <dd>{user.status}</dd>
        <dt>Manager</dt>
        <dd>{managerName ?? "None"}</dd>
        <dt>Member since</dt>
        <dd>{new Date(user.createdAt).toISOString().slice(0, 10)}</dd>
      </dl>
    </>
  );
}
