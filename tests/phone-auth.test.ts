import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyPhoneLoginAssertion } from "@/lib/phone-auth";

describe("verifyPhoneLoginAssertion", () => {
  it("accepts a signed, current and browser-bound assertion", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const now = 1_800_000_000;
    const challenge = "a".repeat(43);
    const payload = Buffer.from(JSON.stringify({
      version: 1,
      audience: "zhivector-phone-login",
      phone: "15600819195",
      challenge,
      issuedAt: now,
      expiresAt: now + 90
    })).toString("base64url");
    const assertion = `${payload}.${sign(null, Buffer.from(payload), privateKey).toString("base64url")}`;
    const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

    expect(verifyPhoneLoginAssertion(assertion, challenge, now, publicKeyB64).phone).toBe("15600819195");
    expect(() => verifyPhoneLoginAssertion(assertion, "b".repeat(43), now, publicKeyB64)).toThrow();
  });
});
