import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, createClient } = vi.hoisted(() => {
  const exchangeCodeForSession = vi.fn();
  return {
    exchangeCodeForSession,
    createClient: vi.fn().mockResolvedValue({
      auth: { exchangeCodeForSession },
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { GET } from "./route";

function makeRequest(url: string) {
  return new Request(url) as unknown as import("next/server").NextRequest;
}

describe("auth/callback route — safeNext allow-list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it.each([
    [
      "//evil.com/steal",
      "https://app.example.com/admin",
      "rejects protocol-relative",
    ],
    [
      "/\\evil.com",
      "https://app.example.com/admin",
      "rejects backslash-tricked path",
    ],
    [
      "https://evil.com",
      "https://app.example.com/admin",
      "rejects absolute URL in next",
    ],
    [
      "/portal/abc/quote",
      "https://app.example.com/admin",
      "rejects /portal (not on allow-list)",
    ],
    [
      "/login",
      "https://app.example.com/admin",
      "rejects /login (not on allow-list)",
    ],
    ["/admin", "https://app.example.com/admin", "allows /admin exact"],
    [
      "/admin/quotes/new",
      "https://app.example.com/admin/quotes/new",
      "allows /admin subpath",
    ],
    ["/", "https://app.example.com/", "allows / root"],
  ])("next=%s -> %s (%s)", async (next, expectedLocation) => {
    const url =
      "https://app.example.com/auth/callback?code=abc&next=" +
      encodeURIComponent(next);
    const res = await GET(makeRequest(url));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(expectedLocation);
  });

  it("redirects to /login?error=missing_code when no code is present", async () => {
    const res = await GET(
      makeRequest("https://app.example.com/auth/callback?next=/admin"),
    );
    expect(res.headers.get("location")).toBe(
      "https://app.example.com/login?error=missing_code",
    );
  });

  it("maps Supabase error.message to a fixed enum (no reflection)", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: "Invalid <script>alert(1)</script> code" },
    });
    const res = await GET(
      makeRequest("https://app.example.com/auth/callback?code=abc"),
    );
    const location = res.headers.get("location") ?? "";
    expect(location).toBe("https://app.example.com/login?error=invalid_code");
    expect(location).not.toContain("<script>");
  });
});
