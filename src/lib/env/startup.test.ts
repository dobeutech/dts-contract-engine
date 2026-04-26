import { afterEach, describe, expect, it } from "vitest";
import { validateStartupEnv } from "./startup";

const previousEnv = { ...process.env };

describe("validateStartupEnv", () => {
  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it("does not throw outside production", () => {
    process.env = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
    expect(() => validateStartupEnv()).not.toThrow();
  });

  it("throws when required production env vars are missing", () => {
    process.env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    expect(() => validateStartupEnv()).toThrow(
      /Missing required production environment variables/,
    );
  });
});
