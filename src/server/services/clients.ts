import "server-only";
import { clientPageQuerySchema } from "@/domain/client-schemas";
import type { Client, ClientPage } from "@/domain/client";
import { describeIssues } from "@/domain/issues";
import { authorizeContentView, type Actor } from "@/permissions/policy";
import type { Store } from "../store";
import { currentActor } from "./actor";
import { fail, ok, refusal, type ServiceResult } from "./result";

/**
 * One page of clients. The slicing happens here, on the server: the browser
 * never receives the full list, and `limit` is capped (see MAX_PAGE_SIZE).
 * A page past the end is empty rather than an error.
 */
export function listClients(
  store: Store,
  snapshot: Actor,
  query: unknown,
): ServiceResult<ClientPage> {
  const actor = currentActor(store, snapshot);
  const gate = refusal(authorizeContentView(actor));
  if (gate) return gate;

  const parsed = clientPageQuerySchema.safeParse(query);
  if (!parsed.success) {
    return fail("VALIDATION", "The query is invalid.", describeIssues(parsed.error));
  }
  const { page, limit } = parsed.data;

  const total = store.clients.length;
  const start = (page - 1) * limit;
  const items = store.clients
    .slice(start, start + limit)
    .map((client) => ({ ...client }));

  return ok({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export function getClient(
  store: Store,
  snapshot: Actor,
  id: string,
): ServiceResult<Client> {
  const actor = currentActor(store, snapshot);
  const gate = refusal(authorizeContentView(actor));
  if (gate) return gate;

  const client = store.clients.find((candidate) => candidate.id === id);
  return client ? ok({ ...client }) : fail("NOT_FOUND", "Client not found.");
}
