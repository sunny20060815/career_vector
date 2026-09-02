import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const challenge = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ challenge });
  response.cookies.set("zhivector_phone_challenge", challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 5 * 60,
    path: "/"
  });
  return response;
}
