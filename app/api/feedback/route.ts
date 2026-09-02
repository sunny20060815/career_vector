import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { parseFeedbackPayload } from "@/lib/feedback";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "请先登录后再提交反馈" }, { status: 401 });
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });

  try {
    const payload = parseFeedbackPayload(await request.json());
    const response = await fetch(`${env.feedbackServiceUrl()}/feedback/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        category: payload.category,
        message: payload.message
      }),
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      console.error("Feedback delivery failed", response.status, text);
      const error = (() => {
        try { return (JSON.parse(text) as { error?: string }).error; } catch { return undefined; }
      })();
      return NextResponse.json(
        { error: error ?? "反馈暂时无法发送，请稍后重试" },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "反馈提交失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
