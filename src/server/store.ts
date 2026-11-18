import "server-only";
import type { Client } from "@/domain/client";
import type { User } from "@/domain/user";
import { generateClients } from "./seed/clients";
import { SEED_ACCOUNTS } from "./seed/users";

/**
 * A login. It holds only who the session belongs to. The user's role and
 * status are always read from `users`, never copied here (rule 5).
 */
export interface Session {
  userId: string;
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

export interface Store {
  users: Map<string, User>;
  /** userId to plain-text password. The task allows plain text here. */
  passwords: Map<string, string>;
  /** Session id to session. The id is the value of the session cookie. */
  sessions: Map<string, Session>;
  /** Clients never change at runtime, so the list is read-only. */
  clients: readonly Client[];
}

/** Builds a fresh, seeded store. Tests use this to get an isolated copy. */
export function createSeededStore(): Store {
  const users = new Map<string, User>();
  const passwords = new Map<string, string>();

  for (const { password, ...user } of SEED_ACCOUNTS) {
    users.set(user.id, user);
    passwords.set(user.id, password);
  }

  return { users, passwords, sessions: new Map(), clients: generateClients() };
}

declare global {
  // A `var` is the only way to type a property on globalThis.
  var __rbacStore: Store | undefined;
}

/**
 * The one store for the whole server process.
 *
 * It lives on globalThis, not in a module-level variable. Next.js can load a
 * module more than once (hot reload in dev, separate bundles for route handlers
 * and server components). Each copy would seed its own data, and a change made
 * through one route would be invisible to the next.
 */
export function getStore(): Store {
  const existing = globalThis.__rbacStore;
  if (existing) return existing;

  const created = createSeededStore();
  globalThis.__rbacStore = created;
  return created;
}
