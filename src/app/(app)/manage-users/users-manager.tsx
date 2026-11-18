"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { callApi, describeError } from "@/app/_lib/api";
import { USER_STATUS, type User } from "@/domain/user";
import {
  ALL_ROLES,
  ROLES,
  ROLE_DEFINITIONS,
  hasCapability,
  isRole,
  type Role,
} from "@/permissions/roles";

/**
 * What is shown follows the user's capabilities, which keeps the screen tidy.
 * It is not enforcement: the API refuses a forbidden change whatever the screen
 * offers. The reasons for rules 3 and 4 are deliberately not pre-empted here,
 * so the message the server gives is what the user sees.
 */

interface Notice {
  kind: "ok" | "error";
  text: string;
}

type Run = (
  subject: string,
  method: string,
  path: string,
  body: unknown,
  done: string,
) => Promise<boolean>;

interface Props {
  currentUser: User;
  users: User[];
}

export function UsersManager({ currentUser, users }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);

  const role = currentUser.role;
  const canCreate = hasCapability(role, "users:create");
  const canEditProfile =
    hasCapability(role, "users:edit-profile:all") ||
    hasCapability(role, "users:edit-profile:reports");
  const canChangeRole = hasCapability(role, "users:change-role");
  const canChangeStatus = hasCapability(role, "users:change-status");

  const nameById = new Map(users.map((user) => [user.id, user.fullName]));
  const possibleManagers = users.filter(
    (user) =>
      user.status === USER_STATUS.ACTIVE && hasCapability(user.role, "users:read:reports"),
  );

  /** Sends one request, shows the outcome and refreshes the list on success. */
  const run: Run = async (subject, method, path, body, done) => {
    setNotice(null);
    const reply = await callApi<{ user: User }>(method, path, body);
    if (reply.status === 401) return false; // callApi is already taking us to /login
    if (reply.data) {
      setNotice({ kind: "ok", text: `${subject}: ${done}` });
      router.refresh();
      return true;
    }
    setNotice({ kind: "error", text: `${subject}: ${describeError(reply.error)}` });
    return false;
  };

  const managerLabel = (user: User) => {
    if (user.managerId === null) return "None";
    if (user.managerId === currentUser.id) return "You";
    return nameById.get(user.managerId) ?? user.managerId;
  };

  return (
    <>
      <div aria-live="polite">
        {notice ? (
          <p className={notice.kind === "ok" ? "ok" : "error"} role="status">
            {notice.text}
          </p>
        ) : null}
      </div>

      {canCreate ? <CreateUserForm managers={possibleManagers} run={run} /> : null}

      <p className="muted">
        {users.length} {users.length === 1 ? "account" : "accounts"}
        {canChangeRole ? "" : " that report to you"}.
      </p>
      {users.length === 0 ? <p>Nobody reports to you yet.</p> : null}
      {users.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Manager</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow
                // A new key after a refresh gives the row fresh values to edit.
                key={`${user.id}|${user.fullName}|${user.email}|${user.role}|${user.status}`}
                user={user}
                managerLabel={managerLabel(user)}
                canEditProfile={canEditProfile}
                canChangeRole={canChangeRole}
                canChangeStatus={canChangeStatus}
                run={run}
              />
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

interface RowProps {
  user: User;
  managerLabel: string;
  canEditProfile: boolean;
  canChangeRole: boolean;
  canChangeStatus: boolean;
  run: Run;
}

function UserRow({
  user,
  managerLabel,
  canEditProfile,
  canChangeRole,
  canChangeStatus,
  run,
}: RowProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [busy, setBusy] = useState(false);
  const active = user.status === USER_STATUS.ACTIVE;
  const path = `/api/users/${user.id}`;

  async function save() {
    const change: Record<string, string> = {};
    if (canEditProfile && fullName !== user.fullName) change.fullName = fullName;
    if (canEditProfile && email !== user.email) change.email = email;
    if (canChangeRole && role !== user.role) change.role = role;
    if (Object.keys(change).length === 0) return;

    setBusy(true);
    await run(user.fullName, "PATCH", path, change, "saved.");
    setBusy(false);
  }

  async function toggleStatus() {
    setBusy(true);
    await run(
      user.fullName,
      "PATCH",
      path,
      { status: active ? USER_STATUS.DEACTIVATED : USER_STATUS.ACTIVE },
      active ? "deactivated." : "activated.",
    );
    setBusy(false);
  }

  return (
    <tr>
      <td>
        {canEditProfile ? (
          <input
            aria-label={`Full name of ${user.fullName}`}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        ) : (
          user.fullName
        )}
      </td>
      <td>
        {canEditProfile ? (
          <input
            aria-label={`Email of ${user.fullName}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        ) : (
          user.email
        )}
      </td>
      <td>
        {canChangeRole ? (
          <select
            aria-label={`Role of ${user.fullName}`}
            value={role}
            onChange={(event) => {
              if (isRole(event.target.value)) setRole(event.target.value);
            }}
          >
            {ALL_ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_DEFINITIONS[option].label}
              </option>
            ))}
          </select>
        ) : (
          ROLE_DEFINITIONS[user.role].label
        )}
      </td>
      <td>{managerLabel}</td>
      <td>{user.status}</td>
      <td>
        {canEditProfile || canChangeRole ? (
          <button type="button" onClick={save} disabled={busy}>
            Save
          </button>
        ) : null}{" "}
        {canChangeStatus ? (
          <button type="button" onClick={toggleStatus} disabled={busy}>
            {active ? "Deactivate" : "Activate"}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function CreateUserForm({ managers, run }: { managers: User[]; run: Run }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(ROLES.USER);
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const created = await run(
      "New user",
      "POST",
      "/api/users",
      { fullName, email, password, role, managerId: managerId || null },
      "created.",
    );
    setBusy(false);
    if (created) {
      setFullName("");
      setEmail("");
      setPassword("");
      setManagerId("");
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Create a user</h2>
      <label>
        Full name
        <input required value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </label>
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        Role
        <select
          value={role}
          onChange={(event) => {
            if (isRole(event.target.value)) setRole(event.target.value);
          }}
        >
          {ALL_ROLES.map((option) => (
            <option key={option} value={option}>
              {ROLE_DEFINITIONS[option].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Manager
        <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
          <option value="">None</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.fullName}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy}>
        Create user
      </button>
    </form>
  );
}
