import { describe, expect, it } from "vitest";
import { PUBLIC_PATH_PREFIXES, isPublicRoute } from "./middleware";

describe("isPublicRoute", () => {
  it.each([
    ["/login", true],
    ["/login/", true],
    ["/auth/signout", true],
    ["/api/webhooks/adobe-sign", true],
    ["/portal/abc123", true],
    ["/_next/static/chunks/main.js", true],
    ["/", false],
    ["/clients", false],
    ["/api/quotes", false],
    ["/login-something-else", true],
  ])("classifies %s correctly", (pathname, expected) => {
    expect(isPublicRoute(pathname)).toBe(expected);
  });

  it("declares the expected prefix list (guards against drift)", () => {
    expect([...PUBLIC_PATH_PREFIXES]).toEqual([
      "/login",
      "/auth",
      "/api/webhooks",
      "/portal",
      "/_next",
    ]);
  });
});
