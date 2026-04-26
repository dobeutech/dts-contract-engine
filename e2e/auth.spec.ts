import { test, expect } from "@playwright/test";

const E2E_EMAIL = process.env.E2E_TEST_EMAIL;
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe("login page UI", () => {
  test("renders brand, Google button, and email form", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /Dobeu Tech Solutions/i }),
    ).toBeVisible();

    // Google SSO entry point — must be present even when the provider
    // isn't yet enabled in Supabase; the runtime will surface a friendly
    // error if the user clicks it before the env is set up.
    await expect(page.getByTestId("login-google")).toBeVisible();
    await expect(page.getByTestId("login-google")).toHaveText(
      /Continue with Google/i,
    );

    // Email/password fallback path stays visible.
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sign in$/ })).toBeVisible();
  });
});

test.describe("auth happy path (email/password)", () => {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set",
  );

  test("sign in, land on app shell, sign out", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);

    await page.getByLabel(/email/i).fill(E2E_EMAIL!);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD!);
    await page.getByRole("button", { name: /^Sign in$/ }).click();

    // Authenticated landing — the shell redirects unauthenticated users
    // back to /login, so any non-/login URL after sign-in confirms auth.
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(E2E_EMAIL!)).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });
});
