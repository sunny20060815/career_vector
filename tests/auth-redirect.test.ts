import { describe, expect, it } from "vitest";

import { getEmailRedirectUrl } from "@/lib/auth-redirect";

describe("getEmailRedirectUrl", () => {
  it("uses the browser origin so an email link returns to the deployed domain", () => {
    expect(getEmailRedirectUrl("https://zhivector.com")).toBe("https://zhivector.com");
  });

  it("removes a trailing slash to keep the configured redirect URL stable", () => {
    expect(getEmailRedirectUrl("https://zhivector.com/")).toBe("https://zhivector.com");
  });
});
