# Working in this repo

Next.js 16 App Router, TypeScript with `strict`, data in memory (no database). Three roles, IT, manager and user, and they are not hierarchical. The project is judged on who may do what and where that is enforced, so most rules below are about that.

## Commands

- `npm run dev`, or `npm run build && npm start`. Port 3000, Node 22.12 or newer.
- `npm test`, `npm run lint` and `npm run typecheck`. Run all three before calling a change done.
- `npm run typecheck` runs `next typegen` first, because `PageProps`, `LayoutProps` and `RouteContext` are generated globals. A bare `tsc` fails on a fresh clone.
- Install with `npm ci`. `.npmrc` turns install scripts off and nothing here needs one. If a new dependency does, say why in the commit message. Add dependencies at a version that is at least a week old, and keep `package-lock.json` committed.
- `npm run e2e` drives the UI in Chromium and builds and starts its own server on port 3100. Run `npx playwright install chromium` once. Run it when you change a page, a component or `callApi`: the unit and HTTP tests cannot see those.
- `npm run scenarios -- http://localhost:3000` replays the task's scenarios over real HTTP. It needs a freshly started server, since scenarios 11 and 12 deactivate accounts.

## Layers and what may import what

| Folder | Holds | May import |
| --- | --- | --- |
| `src/permissions` | `roles.ts`, the only file that names roles. `policy.ts`, every permission decision. | `src/domain` |
| `src/domain` | Types, constants such as `USER_STATUS`, zod schemas. | `src/permissions/roles` |
| `src/server` | Store, sessions, services, page guards. Every file starts with `import "server-only"`. | everything above |
| `src/app` | Route handlers in `api/`, signed-in pages in `(app)/`, `login/`. | everything above |

`permissions` and `domain` are pure: no `@/server`, no `next`, no `react`. Client components may import `permissions` and `domain`, never `@/server`. `architecture.test.ts` fails if either rule breaks.

A request goes route handler or page, then a function in `src/server/services`, then `policy.ts`, then the store. Services take `(store, actor, ...)` and return a `ServiceResult`.

## Rules an agent is likely to break

1. Permission decisions live in `policy.ts` and nowhere else. Never branch on a role in a route, page, component or service. Add a capability to `roles.ts` and ask the policy. A hidden button is a hint, not enforcement.
2. The client is never trusted. Every API route except login and logout starts with `requireUser()`, calls a service and ends with `respond()`. Services take `unknown` input and validate it with the strict schemas in `src/domain`, so a caller cannot slip in `managerId`, `password` or `id`.
3. Role names appear in `roles.ts` only. Elsewhere use `ROLES.X` or `hasCapability()`. `no-inline-roles.test.ts` fails on any quoted role value in `src`, even the English word "user" in UI text. Reword the text instead of loosening the test.
4. The client list is paginated on the server. `listClients` slices it and caps `limit` at `MAX_PAGE_SIZE`. Never return `store.clients`, hand it to a component or add an endpoint that returns it whole.
5. Deactivation and role changes apply on the next request. A session holds only a user id and an expiry, and `resolveSession` reads the user from the store every time. Never copy role or status into the cookie or the session, never cache user data, never turn on `cacheComponents`, and do not introduce JWTs.
6. Between a policy decision and the write there is no `await`. The rule that the system keeps an active IT relies on nothing running in between. Every service starts with `currentActor`, which re-reads the acting user from the store, because a route awaits between reading the session and calling the service, and a deactivation can land in that gap. Never pass a user you fetched earlier straight into the policy. `architecture.test.ts` fails for a service function that skips `currentActor`.
7. Pages under `src/app/(app)` start with `requirePageUser` or `requireAllowed`. Do not move this into a layout, because layouts are not rendered again on client-side navigation. `architecture.test.ts` fails for a page that skips the guard.
8. An error code becomes an HTTP status in one place, `STATUS_BY_CODE` in `src/server/http.ts`. It is a `Record`, so a new `ServiceErrorCode` does not compile until it has a status.
9. `User` never carries a password. Passwords are in `store.passwords`. Services return copies, never objects that live in the store.
10. Browser code calls the API only through `callApi` in `src/app/_lib/api.ts`, which sends a 401 to `/login`.

## Adding a fourth role

1. In `roles.ts`, add it to `ROLES` and give it an entry in `ROLE_DEFINITIONS`: label, `homePath`, `capabilities`, `minActiveAccounts`, `editableAsReport`.
2. Run `npm run typecheck`. The compiler points at the `MATRIX` table in `policy.test.ts`. Add a row for the role.
3. Run `npm test`.

That is all. If you are about to edit `policy.ts`, a page or a component for the new role, a capability is missing, so add the capability instead. For a demo account, add it to `src/server/seed/users.ts` with `ROLES.X` and list it in the README. `docs.test.ts` checks the README against the seed.

## Things that look wrong but are intended

- IT cannot open `/content`, `/content/me` or the client API. IT is not a superset of manager.
- In `authorizeUserUpdate` the last-active-account rule runs before the self-protection rule. Scenario 11 expects two different reasons for the same self-deactivation request. Do not reorder them.
- A manager cannot edit a direct report who is a manager. IT can change a report's role and `managerId` stays, so the policy also asks `editableAsReport` of the target's role (`authorizeProfileEdit`). The task says "not other managers" and excludes no other role. Do not limit reports to one role instead: a new role only needs its own `editableAsReport`.
- A change to your own role is always refused, whatever the new role is. A field whose value does not change is not a change, and an update that changes nothing on a user you cannot see is still refused.
- The store lives on `globalThis.__rbacStore`. Next loads a module more than once (hot reload, separate bundles), and a module-level variable would give each copy its own data. Data and sessions are lost on restart.
- Clients come from a seeded random generator, so ids and data are the same after every restart.
- `forbidden()` needs `experimental.authInterrupts`. Its 403 is sent only while the response has not started streaming, so never put a `loading.tsx` above a guarded page. Next draws the 403 page text in the browser: the raw HTML has the status but no visible text.
- `params` and `searchParams` are Promises. Use the generated `PageProps` and `RouteContext` types.
- `next dev` used to write its own generic AGENTS.md. `agentRules: false` in `next.config.ts` stops that, so keep it.
- Another team's user gets 403 and a missing id gets 404, on purpose: ids are not secret and the reason is useful. A role with no access to the users API gets 403 for every id, real or not.
