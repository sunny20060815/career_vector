import { NextResponse } from "next/server";

import { writeCareerAnswer, parseCareerQuestion } from "@/lib/deepseek";
import { retrieveCareerEvidence } from "@/lib/evidence";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ChatRequest, ChatResponse } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 30;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function titleFor(question: string): string {
  return question.replace(/\s+/g, " ").trim().slice(0, 28) || "新职业咨询";
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return errorResponse("请求格式无效", 400);
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 1600) return errorResponse("请输入 1 到 1600 个字符的问题", 400);

  try {
    const supabase = await createServerSupabaseClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub;
    if (!userId) return errorResponse("请先登录后再咨询", 401);

    let conversationId = body.conversationId;
    if (conversationId) {
      const { data: conversation, error } = await supabase.from("conversations").select("id").eq("id", conversationId).single();
      if (error || !conversation) return errorResponse("会话不存在或无权访问", 404);
    } else {
      const { data: conversation, error } = await supabase.from("conversations").insert({ user_id: userId, title: titleFor(question) }).select("id").single();
      if (error || !conversation) throw new Error("无法创建会话");
      conversationId = conversation.id;
    }
    if (!conversationId) throw new Error("无法确定会话标识");

    const { data: historyRows, error: historyError } = await supabase.from("messages").select("content").eq("conversation_id", conversationId).eq("role", "user").order("created_at", { ascending: false }).limit(6);
    if (historyError) throw new Error("无法读取会话上下文");
    const history = (historyRows ?? []).map((row) => row.content).reverse();
    const { error: userMessageError } = await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content: question });
    if (userMessageError) throw new Error("无法保存提问");

    const query = await parseCareerQuestion(question, history);
    const evidence = await retrieveCareerEvidence(query);
    const noData = evidence.recognizedSkills.length === 0;
    const answer = noData
      ? `暂无相关记录。未识别的技能或知识包括：${evidence.unresolvedSkills.join("、") || "当前描述"}。请尝试写出更具体的技能名称。`
      : await writeCareerAnswer(question, evidence);
    const { error: assistantMessageError } = await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: answer, structured_query: query, evidence });
    if (assistantMessageError) throw new Error("无法保存回答");
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    const response: ChatResponse = { conversationId, answer, query, evidence, noData };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务暂时不可用";
    return errorResponse(message, 500);
  }
}
