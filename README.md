# nextjs-rbac-user-management

A small Next.js app with three roles (IT, manager, user), an in-memory data store, a users directory and a read-only table of 1,200 generated clients. It exists to answer one question: who is allowed to do what, and where is that enforced. The answer is on the server, in one place.

## How to run it

Node 22.12 or newer.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build && npm start`.

`npm ci` installs exactly what `package-lock.json` says. The lockfile was resolved as of a week before it was written, so no installed version is newer than that. `.npmrc` turns off install scripts, because nothing here needs one.

Data lives in memory and resets when the server restarts. Over https, set `SESSION_COOKIE_SECURE=true` so the session cookie gets the `Secure` flag. It is off by default so the app also works over plain http on localhost.

Checks:

```bash
npm test             # unit tests, plus tests that call the real API route handlers
npm run lint
npm run typecheck
npm run e2e          # browser tests, see below
```

`npm run e2e` drives the real UI in Chromium through scenarios 7 to 12 and checks, for example, that the client table sends one page per request and that a deactivated user's next click ends at `/login`. It builds the app and starts its own server on port 3100, so nothing else may be using that port. Run `npx playwright install chromium` once first, or set `PLAYWRIGHT_CHROMIUM_PATH` to a Chromium you already have. It is not part of `npm test`, because it needs a browser.

`npm run scenarios -- http://localhost:3000` replays scenarios 7 to 12 of the task over real HTTP with real cookies and exits non-zero if a check fails. Start a fresh server first. The scenarios deactivate accounts, and a used server is detected before the first scenario.

## Seeded accounts

Plain-text passwords, as the task allows. A deactivated account can be listed but cannot sign in.

| Email | Password | Role | Status | Manager |
| --- | --- | --- | --- | --- |
| ivan@example.com | ivan123 | IT | active | none |
| iryna@example.com | iryna123 | IT | active | none |
| anna@example.com | anna123 | Manager | active | none |
| taras@example.com | taras123 | Manager | active | none |
| viktor@example.com | viktor123 | Manager | deactivated | none |
| olena@example.com | olena123 | User | active | Anna |
| maksym@example.com | maksym123 | User | active | Anna |
| sofiia@example.com | sofiia123 | User | active | Anna |
| bohdan@example.com | bohdan123 | User | deactivated | Anna |
| dmytro@example.com | dmytro123 | User | active | Viktor |
| kateryna@example.com | kateryna123 | User | active | none |

Anna has four direct reports. Taras is a manager with none. Dmytro's manager, Viktor, is deactivated. Nobody manages Kateryna. Ivan and Iryna are the two IT accounts, so the last-active-IT rule can be tried.

The 1,200 clients are generated at startup from a seeded random generator, about 28% of them churned. They are the same after every restart.

## Pages and API

| Page | Who |
| --- | --- |
| `/login` | everyone |
| `/content`, `/content/client/{id}`, `/content/me` | manager, user |
| `/manage-users` | IT (all users), manager (direct reports) |

A visitor who is not signed in is redirected to `/login`. Someone who is signed in but not allowed gets a 403 page, with no redirect.

| Endpoint | Who |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | login: everyone, `me`: signed in |
| `GET /api/users`, `POST /api/users` | IT (all users), manager (direct reports, list only) |
| `GET /api/users/{id}`, `PATCH /api/users/{id}` | IT, or a manager for a direct report |
| `GET /api/clients?page=1&limit=25`, `GET /api/clients/{id}` | manager, user |

Errors have one shape, `{ "error": { "code", "message", "issues"? } }`. Statuses: 401 no usable login, 403 not allowed, 404 not found, 400 invalid input, 409 clashes with the current state (the last active IT, a taken email), 422 well-formed but not acceptable (a bad manager on create).

`GET /api/clients` returns `{ items, total, page, limit, totalPages }`. The server slices the list. `limit` defaults to 25 and is cut down to 100, so no request can return the whole list. A page past the end is empty.

## Authentication, and how rule 5 works

Sessions are opaque and live on the server. Logging in checks the password and creates a random 256-bit session id. The server keeps `sessionId -> { userId, expiresAt }` in memory, and the browser gets only the id, in an `httpOnly`, `SameSite=lax` cookie. Sessions expire after 8 hours.

On every request `resolveSession` takes the user id from the session and reads the user record from the store. Role and status are never in the cookie and never copied into the session.

That is what makes rule 5 hold. A signed token that carries the role and status stays valid until it expires. To cut a deactivated manager off at once you would have to look the user up on every request anyway, and then the token adds nothing over a session id. So the cookie holds an id and the server does the lookup. When IT deactivates a user, their next request finds a deactivated account, `resolveSession` returns nothing, and the API answers 401 while a page redirects to `/login`. `updateUser` also closes the user's sessions. A role change works the same way: the next request sees the new role.

Smaller details:

- Login gives the same answer for an unknown email and a wrong password. It says an account is deactivated only after the right password was given.
- Every login gets a new session id.
- A route reads the session and calls a service a few `await`s later. Each service starts by re-reading the acting user from the store (`src/server/services/actor.ts`), so a deactivation or role change that landed in that gap still counts. The policy never sees an older picture of who is acting.
- `SameSite=lax` stops another site from sending a POST with the cookie.

## Where permission decisions are made

Two files decide. Everything else asks them.

1. `src/permissions/policy.ts` makes every authorization decision: who may see, create or change which user, and who may see content. It covers rules 1 to 4. What each role can do is a list of capabilities in `src/permissions/roles.ts`.
2. `src/server/auth.ts` decides who is asking and whether the account is still active (`login`, `resolveSession`). This is rule 5.

The callers ask before they act and add no rules of their own: the services in `src/server/services` (each begins with `currentActor`, which refreshes who is acting), and `requireUser` and `requirePageUser` in `src/server/current-user.ts` and `src/server/page-guards.ts`. Two data rules in `src/server/services/users.ts` are not access decisions: an email must not be taken, and a new user's manager must be active and have a role that can have reports.

The navigation links in `src/app/(app)/layout.tsx` and the controls in `src/app/(app)/manage-users/users-manager.tsx` also read capabilities, and the screen asks `authorizeProfileEdit` for each row. They only decide what is shown. The API refuses a forbidden request whatever the screen offers.

## The task's scenarios

| Scenario | Where it is checked |
| --- | --- |
| 7. Anna sees her four reports, cannot touch Dmytro | `routes.test.ts`, `scripts/scenarios.mjs` |
| 8. Anna gives herself the IT role | `routes.test.ts`, `scripts/scenarios.mjs` |
| 9. One page of clients per request | `routes.test.ts`, `scripts/scenarios.mjs`, `e2e/scenarios.spec.ts` |
| 10. Ivan lands on `/manage-users`, is refused `/content` | `routes.test.ts`, `scripts/scenarios.mjs`, `e2e/scenarios.spec.ts` |
| 11. Self-deactivation, then the last IT | `policy.test.ts`, `routes.test.ts`, `scripts/scenarios.mjs` |
| 12. Olena is deactivated while browsing | `auth.test.ts`, `routes.test.ts`, `scripts/scenarios.mjs`, `e2e/scenarios.spec.ts` |

## Choices where the task leaves room

- "Demote" is not defined for roles that are not hierarchical, so any change to your own role is refused.
- A manager edits a direct report only if the role of that account allows it (`editableAsReport` in `src/permissions/roles.ts`). IT can change a report's role while `managerId` stays, and without this check a manager could then edit another manager, which the task rules out ("not other managers"). IT can still edit that account.
- A manager may edit the name and email of a deactivated direct report. The task says only that `managerId` must be the manager's own id.
- Only a field whose value changes counts as a change. An update that changes nothing on a user you cannot see is still refused.
- `managerId` is set when a user is created and cannot be changed. The task's table gives nobody the right to reassign a user.
- The last-active-account rule is checked before the self-protection rule. Otherwise scenario 11 would give the same reason twice.
- A user outside the actor's reach gets 403 and a missing id gets 404. A role with no access to the users API gets 403 for every id.
- IT sets a password when it creates a user (at least 6 characters). Emails are unique, ignoring case.

## With another four hours

- Sorting and filtering on the client table (status, country, a search box). It would run on the server with a whitelist of sortable columns, and the state would sit in the URL next to the page number.
- An audit trail: who changed which field of which user, and when, shown to IT.
- Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run e2e` on every push, in a container that has Chromium.
- Rate limiting on the login route, and an Origin check on mutating requests on top of `SameSite=lax`.
- Better loading and error states in the client table: a retry button, and keep the old page visible while the next one loads.
- A way for IT to reassign a manager.
- Docker.

## Known limits

- Everything is in memory, so the app runs as one process, and sessions and data are lost on restart.
- The 403 page uses `forbidden()`, which is experimental in Next 16 and enabled with `experimental.authInterrupts`. Next draws its text in the browser. The raw HTML has the 403 status but no visible text.
- After a deactivation, the browser's Back button can still show a page the user had already opened, because Next restores it from its client cache without a request. Nothing new is sent: the next request of any kind, a click, a reload or an API call, gets a 401 and ends at `/login`. Scenario 12 is about that next request.
- `npm audit` reports findings in the lint and test toolchain (`picomatch`, `minimatch`). They are development-only and the production dependencies have none. The week-old lockfile is deliberate, and it trades the newest releases, which sometimes carry the fixes, for not trusting packages that are only hours old.

## For AI agents

`AGENTS.md` states the rules of this codebase, and `CLAUDE.md` imports it.
