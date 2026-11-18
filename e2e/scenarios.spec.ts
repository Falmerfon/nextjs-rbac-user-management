import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * The task's scenarios, driven through the real UI in Chromium. They run in
 * order on one fresh server: scenarios 11 and 12 deactivate accounts, and the
 * ones after them rely on that.
 */
test.describe.configure({ mode: "serial" });

interface Visitor {
  context: BrowserContext;
  page: Page;
}

let baseURL: string;
let anna: Visitor;
let ivan: Visitor;
let olena: Visitor;

async function signIn(
  browser: Browser,
  email: string,
  password: string,
): Promise<Visitor> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  return { context, page };
}

const userRow = (page: Page, fullName: string) =>
  page.locator("tr", { has: page.getByLabel(`Full name of ${fullName}`) });

test.beforeAll(async ({ browser }) => {
  baseURL = test.info().project.use.baseURL ?? "http://localhost:3100";
  anna = await signIn(browser, "anna@example.com", "anna123");
  ivan = await signIn(browser, "ivan@example.com", "ivan123");
  olena = await signIn(browser, "olena@example.com", "olena123");
});

test.afterAll(async () => {
  await Promise.all([anna, ivan, olena].map((visitor) => visitor?.context.close()));
});

test.describe("signing in", () => {
  test("a visitor who is not signed in ends up on /login", async ({ browser }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/content");
    await expect(page).toHaveURL(/\/login$/);
    await context.close();
  });

  test("a wrong password shows a clear message and stays on /login", async ({ browser }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill("anna@example.com");
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("Invalid email or password.");
    await expect(page).toHaveURL(/\/login$/);
    await context.close();
  });

  test("a deactivated account says so", async ({ browser }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill("viktor@example.com");
    await page.getByLabel("Password").fill("viktor123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("This account is deactivated.")).toBeVisible();
    await context.close();
  });
});

test.describe("scenario 7: Anna sees only her direct reports", () => {
  test("her list has exactly four people and no Dmytro", async () => {
    await anna.page.goto("/manage-users");
    await expect(anna.page.getByRole("heading", { name: "Manage users" })).toBeVisible();
    await expect(anna.page.locator("tbody tr")).toHaveCount(4);
    await expect(anna.page.getByLabel("Full name of Dmytro Savchuk")).toHaveCount(0);
  });

  test("she gets no role or status controls and no create form", async () => {
    await expect(anna.page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
    await expect(anna.page.getByLabel(/^Role of /)).toHaveCount(0);
    await expect(anna.page.getByRole("heading", { name: "Create a user" })).toHaveCount(0);
  });

  test("she can rename a direct report", async () => {
    await anna.page.getByLabel("Full name of Maksym Hnatiuk").fill("Maksym H.");
    await userRow(anna.page, "Maksym Hnatiuk").getByRole("button", { name: "Save" }).click();
    await expect(anna.page.getByText("Maksym Hnatiuk: saved.")).toBeVisible();
    await expect(anna.page.getByLabel("Full name of Maksym H.")).toBeVisible();
  });

  test("calling the API directly cannot edit Dmytro either", async () => {
    const reply = await anna.context.request.patch("/api/users/usr_dmytro", {
      data: { fullName: "Nope" },
    });
    expect(reply.status()).toBe(403);
  });
});

test("scenario 8: Anna cannot give herself the IT role", async () => {
  const reply = await anna.context.request.patch("/api/users/usr_anna", {
    data: { role: "it" },
  });
  expect(reply.status()).toBe(403);

  const me = await anna.context.request.get("/api/auth/me");
  expect((await me.json()).user.role).toBe("manager");
});

test.describe("scenario 9: the client table sends one page per request", () => {
  test("the table shows 25 rows out of 1,200 and each API reply is one page", async () => {
    const firstReply = anna.page.waitForResponse((r) => r.url().includes("/api/clients?"));
    await anna.page.goto("/content");
    const reply = await firstReply;
    const body = await reply.json();

    expect(body.items).toHaveLength(25);
    expect(body.total).toBeGreaterThan(1000);
    expect((await reply.body()).length).toBeLessThan(30_000);
    await expect(anna.page.locator("tbody tr")).toHaveCount(25);
    await expect(anna.page.getByText(/1200 clients/)).toBeVisible();
  });

  test("Next goes to page 2, and the page is in the URL", async () => {
    const secondReply = anna.page.waitForResponse((r) =>
      r.url().includes("/api/clients?page=2"),
    );
    await anna.page.getByRole("link", { name: "Next" }).first().click();
    const body = await (await secondReply).json();

    await expect(anna.page).toHaveURL(/\/content\?page=2$/);
    expect(body.items).toHaveLength(25);
    expect(body.items[0].id).toBe("cl_00026");
    await expect(anna.page.locator("tbody tr td").first()).toHaveText("cl_00026");
  });

  test("a client's detail page opens, and an unknown client is a 404", async () => {
    await anna.page.locator("tbody tr td a").first().click();
    await expect(anna.page).toHaveURL(/\/content\/client\/cl_\d{5}$/);
    await expect(anna.page.getByRole("link", { name: "Back to clients" })).toBeVisible();

    const missing = await anna.page.goto("/content/client/cl_99999");
    expect(missing?.status()).toBe(404);
  });

  test("/content/me shows her own information", async () => {
    await anna.page.goto("/content/me");
    await expect(anna.page.getByRole("heading", { name: "My profile" })).toBeVisible();
    await expect(anna.page.getByText("anna@example.com")).toBeVisible();
  });
});

test.describe("scenario 10: IT manages users and is refused content", () => {
  test("Ivan lands on /manage-users and sees all 11 users", async () => {
    await ivan.page.goto("/");
    await expect(ivan.page).toHaveURL(/\/manage-users$/);
    await expect(ivan.page.locator("tbody tr")).toHaveCount(11);
    await expect(ivan.page.getByRole("heading", { name: "Create a user" })).toBeVisible();
  });

  test("/content is a real 403 with a clear message, and no redirect", async () => {
    const response = await ivan.page.goto("/content");
    expect(response?.status()).toBe(403);
    await expect(ivan.page.getByRole("heading", { name: "403: access denied" })).toBeVisible();
    await expect(ivan.page).toHaveURL(/\/content$/);
    await expect(ivan.page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("the link on the 403 page leads him home without a loop", async () => {
    await ivan.page.getByRole("link", { name: "Go to your home page" }).click();
    await expect(ivan.page).toHaveURL(/\/manage-users$/);
  });

  test("the client API is closed to him too", async () => {
    const reply = await ivan.context.request.get("/api/clients");
    expect(reply.status()).toBe(403);
  });
});

test("scenario 11: two different reasons for deactivating himself", async () => {
  await ivan.page.goto("/manage-users");
  await ivan.page.locator("tbody tr").first().waitFor();

  await userRow(ivan.page, "Ivan Petrenko").getByRole("button", { name: "Deactivate" }).click();
  await expect(ivan.page.getByText("You cannot deactivate your own account.")).toBeVisible();

  await userRow(ivan.page, "Iryna Kovalenko").getByRole("button", { name: "Deactivate" }).click();
  await expect(ivan.page.getByText("Iryna Kovalenko: deactivated.")).toBeVisible();

  await userRow(ivan.page, "Ivan Petrenko").getByRole("button", { name: "Deactivate" }).click();
  await expect(ivan.page.getByText(/at least 1 active IT account/)).toBeVisible();
});

test.describe("scenario 12: Olena is deactivated while she is browsing", () => {
  test("a plain user is refused /manage-users with a 403", async () => {
    const response = await olena.page.goto("/manage-users");
    expect(response?.status()).toBe(403);
  });

  test("her next page click ends at /login, and she cannot sign in again", async () => {
    await olena.page.goto("/content");
    await expect(olena.page.locator("tbody tr")).toHaveCount(25);

    await userRow(ivan.page, "Olena Kravets").getByRole("button", { name: "Deactivate" }).click();
    await expect(ivan.page.getByText("Olena Kravets: deactivated.")).toBeVisible();

    await olena.page.getByRole("link", { name: "Next" }).first().click();
    await expect(olena.page).toHaveURL(/\/login$/);
    await expect(olena.page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await olena.page.getByLabel("Email").fill("olena@example.com");
    await olena.page.getByLabel("Password").fill("olena123");
    await olena.page.getByRole("button", { name: "Sign in" }).click();
    await expect(olena.page.getByText("This account is deactivated.")).toBeVisible();
  });
});

test("signing out leads to /login, and Back does not show protected pages", async () => {
  await anna.page.goto("/content");
  await anna.page.getByRole("button", { name: "Sign out" }).click();
  await expect(anna.page).toHaveURL(/\/login$/);

  await anna.page.goBack().catch(() => null);
  await expect(anna.page).toHaveURL(/\/login$/);
});
