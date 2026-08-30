import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { data, error } = await supabase.from("conversations").select("id, title, updated_at").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "无法读取会话" }, { status: 500 });
  return NextResponse.json({ conversations: data ?? [] });
}
