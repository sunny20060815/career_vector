import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { data, error } = await supabase.from("messages").select("id, role, content, evidence, created_at").eq("conversation_id", id).order("created_at");
  if (error) return NextResponse.json({ error: "无法读取会话消息" }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

export async function DELETE(_: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "无法删除会话" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
