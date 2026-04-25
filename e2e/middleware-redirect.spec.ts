import { test, expect } from "@playwright/test";

test.describe("middleware redirects (signed-out)", () => {
  test("/ redirects to /login when signed out", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("/login is reachable directly when signed out", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("an unknown protected route redirects to /login", async ({ page }) => {
    await page.goto("/some-future-route");
    await expect(page).toHaveURL(/\/login$/);
  });
});
