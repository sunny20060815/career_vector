import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { verifyPhoneLoginAssertion } from "@/lib/phone-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const challenge = request.cookies.get("zhivector_phone_challenge")?.value;
  if (!challenge) return NextResponse.json({ error: "登录请求已失效，请重新获取验证码" }, { status: 400 });

  try {
    const body = await request.json() as { assertion?: unknown };
    if (typeof body.assertion !== "string") throw new Error("缺少登录凭证");
    const payload = verifyPhoneLoginAssertion(body.assertion, challenge);
    const phoneHash = createHash("sha256").update(payload.phone).digest("hex");
    const internalEmail = `phone-${phoneHash.slice(0, 40)}@auth.zhivector.com`;
    const admin = createAdminClient();
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: internalEmail,
      options: {
        data: {
          auth_provider: "aliyun_phone",
          phone_last4: payload.phone.slice(-4)
        }
      }
    });
    if (linkError || !link.properties?.hashed_token) throw linkError ?? new Error("无法创建登录会话");

    const supabase = await createServerSupabaseClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink"
    });
    if (verifyError) throw verifyError;

    const response = NextResponse.json({ ok: true, label: `手机号 ····${payload.phone.slice(-4)}` });
    response.cookies.set("zhivector_phone_challenge", "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    console.error("Phone login exchange failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "手机号登录失败" }, { status: 400 });
  }
}
