import { describe, expect, it } from "vitest";

import { getSessionEmail } from "@/lib/auth-session";

describe("getSessionEmail", () => {
  it("returns the email provided by a completed magic-link session", () => {
    expect(getSessionEmail({ user: { email: "candidate@example.com" } })).toBe("candidate@example.com");
  });

  it("returns null when there is no authenticated session", () => {
    expect(getSessionEmail(null)).toBeNull();
  });
});
