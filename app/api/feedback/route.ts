import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { feedbackCategories, parseFeedbackPayload } from "@/lib/feedback";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const userEmail = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email : "未提供";
  const isPhoneAccount = userEmail.endsWith("@auth.zhivector.com");
  if (!userId) return NextResponse.json({ error: "请先登录后再提交反馈" }, { status: 401 });

  try {
    const payload = parseFeedbackPayload(await request.json());
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({
        from: env.feedbackFromEmail(),
        to: [env.feedbackToEmail()],
        reply_to: userEmail === "未提供" || isPhoneAccount ? undefined : userEmail,
        subject: `【职向量问题反馈】${feedbackCategories[payload.category]}`,
        text: [
          `问题类型：${feedbackCategories[payload.category]}`,
          `登录账号：${isPhoneAccount ? "手机号账号" : userEmail}`,
          `用户ID：${userId}`,
          `提交时间：${new Date().toISOString()}`,
          "",
          payload.message
        ].join("\n")
      })
    });

    if (!response.ok) {
      console.error("Feedback delivery failed", response.status, (await response.text()).slice(0, 500));
      return NextResponse.json({ error: "反馈暂时无法发送，请稍后重试" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "反馈提交失败";
    const configurationError = message.includes("RESEND_");
    return NextResponse.json({ error: configurationError ? "反馈邮件服务尚未配置" : message }, { status: configurationError ? 503 : 400 });
  }
}
