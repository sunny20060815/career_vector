import { createPublicKey, timingSafeEqual, verify } from "node:crypto";

const PHONE_AUTH_PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEAnImpZMCs2ekxz+D524S0hemZ6sHv5Z9lnRllSS07f4M=";

export interface PhoneLoginAssertion {
  version: 1;
  audience: "zhivector-phone-login";
  phone: string;
  challenge: string;
  issuedAt: number;
  expiresAt: number;
}

export function verifyPhoneLoginAssertion(
  assertion: string,
  expectedChallenge: string,
  now = Math.floor(Date.now() / 1000),
  publicKeyB64 = PHONE_AUTH_PUBLIC_KEY_B64
): PhoneLoginAssertion {
  if (!assertion || assertion.length > 2048) throw new Error("登录凭证格式错误");
  const [payloadPart, signaturePart, extra] = assertion.split(".");
  if (!payloadPart || !signaturePart || extra) throw new Error("登录凭证格式错误");

  const publicKey = createPublicKey({
    key: Buffer.from(publicKeyB64, "base64"),
    format: "der",
    type: "spki"
  });
  const validSignature = verify(
    null,
    Buffer.from(payloadPart),
    publicKey,
    Buffer.from(signaturePart, "base64url")
  );
  if (!validSignature) throw new Error("登录凭证签名无效");

  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Partial<PhoneLoginAssertion>;
  if (
    payload.version !== 1 ||
    payload.audience !== "zhivector-phone-login" ||
    !payload.phone || !/^1[3-9]\d{9}$/.test(payload.phone) ||
    !payload.challenge ||
    !Number.isSafeInteger(payload.issuedAt) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.issuedAt! > now + 30 ||
    payload.expiresAt! < now ||
    payload.expiresAt! - payload.issuedAt! > 120
  ) throw new Error("登录凭证已失效");

  const actual = Buffer.from(payload.challenge);
  const expected = Buffer.from(expectedChallenge);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("登录请求已失效，请重新获取验证码");
  }
  return payload as PhoneLoginAssertion;
}
