// Walks through the scenarios from the task against a running server, over
// real HTTP with real cookies.
//
//   npm run scenarios -- [baseUrl]        (default http://localhost:3000)
//
// Run it against a freshly started server. Scenarios 11 and 12 deactivate
// accounts, and the data lives in memory until the server restarts.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

function check(label, passed, detail = "") {
  console.log(`  ${passed ? "ok  " : "FAIL"} ${label}${!passed && detail ? `  (${detail})` : ""}`);
  if (!passed) failures += 1;
}

/** A browser stand-in: it keeps its own session cookie. */
class Session {
  cookie = null;

  async request(method, path, body) {
    const headers = { "content-type": "application/json" };
    if (this.cookie) headers.cookie = this.cookie;
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Not JSON, for example an empty 204.
    }
    return { status: response.status, body: json, bytes: text.length };
  }

  get(path) {
    return this.request("GET", path);
  }

  patch(path, body) {
    return this.request("PATCH", path, body);
  }

  async login(email, password) {
    const reply = await this.request("POST", "/api/auth/login", { email, password });
    if (reply.status !== 200) {
      throw new Error(
        `Could not log in as ${email} (HTTP ${reply.status}). Restart the server and run the script again.`,
      );
    }
    return this;
  }
}

const code = (reply) => reply.body?.error?.code;
const deactivate = { status: "deactivated" };

async function main() {
  console.log(`Server: ${base}\n`);

  // A server that an earlier run already used fails here, with a clear message,
  // instead of failing half-way through scenario 11.
  await new Session().login("olena@example.com", "olena123");
  await new Session().login("iryna@example.com", "iryna123");

  console.log("Scenario 7: Anna sees only her four direct reports");
  const anna = await new Session().login("anna@example.com", "anna123");
  const team = await anna.get("/api/users");
  const teamIds = (team.body?.users ?? []).map((user) => user.id).sort();
  check("the list has exactly her four direct reports", teamIds.length === 4, teamIds.join(", "));
  check("Dmytro is not in it", !teamIds.includes("usr_dmytro"));
  const readDmytro = await anna.get("/api/users/usr_dmytro");
  check("reading Dmytro directly is 403", readDmytro.status === 403, `got ${readDmytro.status}`);
  const editDmytro = await anna.patch("/api/users/usr_dmytro", { fullName: "Nope" });
  check("editing Dmytro directly is 403", editDmytro.status === 403, `got ${editDmytro.status}`);
  check("and the reason is NOT_A_DIRECT_REPORT", code(editDmytro) === "NOT_A_DIRECT_REPORT", code(editDmytro));

  console.log("\nScenario 8: Anna gives herself the IT role");
  const promote = await anna.patch("/api/users/usr_anna", { role: "it" });
  check("it fails with 403", promote.status === 403, `got ${promote.status}`);
  const stillManager = await anna.get("/api/auth/me");
  check("she is still a manager", stillManager.body?.user?.role === "manager");

  console.log("\nScenario 9: one page of clients per request");
  const first = await anna.get("/api/clients");
  check("the default page has 25 clients", first.body?.items?.length === 25, `${first.body?.items?.length}`);
  check("the total is over a thousand", first.body?.total > 1000, `${first.body?.total}`);
  check("the response is small (under 30 KB)", first.bytes < 30000, `${first.bytes} bytes`);
  const second = await anna.get("/api/clients?page=2&limit=10");
  check("page 2 with limit 10 starts at the 11th client", second.body?.items?.[0]?.id === "cl_00011", second.body?.items?.[0]?.id);
  const greedy = await anna.get("/api/clients?limit=1000000");
  check("asking for a million is cut to 100", greedy.body?.items?.length === 100, `${greedy.body?.items?.length}`);
  const one = await anna.get("/api/clients/cl_00042");
  check("a single client opens", one.status === 200 && one.body?.client?.id === "cl_00042");

  console.log("\nScenario 10: IT manages users and is refused content");
  const ivan = await new Session().login("ivan@example.com", "ivan123");
  const everyone = await ivan.get("/api/users");
  check("Ivan lists every user", everyone.status === 200 && everyone.body?.users?.length === 11, `${everyone.body?.users?.length}`);
  const ivanClients = await ivan.get("/api/clients");
  check("the client list is 403 for him", ivanClients.status === 403, `got ${ivanClients.status}`);
  const ivanClient = await ivan.get("/api/clients/cl_00001");
  check("so is a single client", ivanClient.status === 403, `got ${ivanClient.status}`);

  console.log("\nScenario 11: self-deactivation, then the last active IT");
  const selfFirst = await ivan.patch("/api/users/usr_ivan", deactivate);
  check("deactivating himself fails with 403 CANNOT_DEACTIVATE_SELF", selfFirst.status === 403 && code(selfFirst) === "CANNOT_DEACTIVATE_SELF", `${selfFirst.status} ${code(selfFirst)}`);
  const other = await ivan.patch("/api/users/usr_iryna", deactivate);
  check("deactivating the other IT works", other.status === 200, `got ${other.status}`);
  const selfSecond = await ivan.patch("/api/users/usr_ivan", deactivate);
  check("deactivating himself again fails with 409 LAST_ACTIVE_ACCOUNT", selfSecond.status === 409 && code(selfSecond) === "LAST_ACTIVE_ACCOUNT", `${selfSecond.status} ${code(selfSecond)}`);
  check("the two reasons differ", code(selfFirst) !== code(selfSecond));

  console.log("\nScenario 12: Ivan deactivates Olena while she is browsing");
  const olena = await new Session().login("olena@example.com", "olena123");
  const before = await olena.get("/api/clients");
  check("Olena can read clients", before.status === 200, `got ${before.status}`);
  const done = await ivan.patch("/api/users/usr_olena", deactivate);
  check("Ivan deactivates her", done.status === 200, `got ${done.status}`);
  const after = await olena.get("/api/clients");
  check("her very next request is 401", after.status === 401 && code(after) === "UNAUTHENTICATED", `${after.status} ${code(after)}`);
  const relogin = await new Session().request("POST", "/api/auth/login", { email: "olena@example.com", password: "olena123" });
  check("and she cannot log in again", relogin.status === 403 && code(relogin) === "ACCOUNT_DEACTIVATED", `${relogin.status} ${code(relogin)}`);

  console.log(failures === 0 ? "\nAll scenarios passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
