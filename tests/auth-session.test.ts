import { describe, expect, it } from "vitest";

import { getSessionIdentity } from "@/lib/auth-session";

describe("getSessionIdentity", () => {
  it("returns the email provided by an existing session", () => {
    expect(getSessionIdentity({ user: { email: "candidate@example.com" } })).toBe("candidate@example.com");
  });

  it("returns null when there is no authenticated session", () => {
    expect(getSessionIdentity(null)).toBeNull();
  });

  it("shows a masked phone identity for phone accounts", () => {
    expect(getSessionIdentity({ user: { email: "internal@example.com", user_metadata: { phone_last4: "9195" } } })).toBe("手机号 ····9195");
  });
});
