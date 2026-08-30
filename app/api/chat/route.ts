import { NextResponse } from "next/server";

import { buildEvidencePreview, formatFallbackCareerAnswer } from "@/lib/career-presentation";
import { encodeChatStreamEvent } from "@/lib/chat-stream";
import { writeCareerAnswer } from "@/lib/deepseek";
import { parseCareerQuestionFromCatalog, retrieveCareerEvidence } from "@/lib/evidence";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ChatRequest, ChatResponse } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 30;

const encoder = new TextEncoder();

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

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: Parameters<typeof encodeChatStreamEvent>[0]) => controller.enqueue(encoder.encode(encodeChatStreamEvent(event)));
      void (async () => {
        try {
          emit({ type: "status", payload: { stage: "understanding", message: "正在识别技能与求职偏好..." } });
          const supabase = await createServerSupabaseClient();
          const { data: claimsData } = await supabase.auth.getClaims();
          const userId = claimsData?.claims?.sub;
          if (!userId) throw new Error("请先登录后再咨询");

          let conversationId = body.conversationId;
          if (conversationId) {
            const { data: conversation, error } = await supabase.from("conversations").select("id").eq("id", conversationId).single();
            if (error || !conversation) throw new Error("会话不存在或无权访问");
          } else {
            const { data: conversation, error } = await supabase.from("conversations").insert({ user_id: userId, title: titleFor(question) }).select("id").single();
            if (error || !conversation) throw new Error("无法创建会话");
            conversationId = conversation.id;
          }
          if (!conversationId) throw new Error("无法确定会话标识");
          const { error: userMessageError } = await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content: question });
          if (userMessageError) throw new Error("无法保存提问");

          const query = await parseCareerQuestionFromCatalog(question);
          emit({ type: "status", payload: { stage: "searching", message: "正在从招聘聚合数据中匹配岗位、城市和趋势..." } });
          const evidence = await retrieveCareerEvidence(query);
          const preview = buildEvidencePreview(evidence);
          emit({ type: "evidence", payload: { preview } });

          const noData = evidence.recognizedSkills.length === 0;
          let answer: string;
          if (noData) {
            answer = "暂无相关记录。系统尚未在已入库的技能词典中识别出你的核心技能，请尝试写出更具体的工具、专业知识或岗位名称。";
          } else {
            emit({ type: "status", payload: { stage: "writing", message: "已找到可引用的职业证据，正在整理成建议..." } });
            try {
              answer = await writeCareerAnswer(question, evidence);
            } catch {
              emit({ type: "status", payload: { stage: "fallback", message: "生成服务较慢，已依据同一批证据整理建议..." } });
              answer = formatFallbackCareerAnswer(evidence);
            }
          }
          const { error: assistantMessageError } = await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: answer, structured_query: query, evidence });
          if (assistantMessageError) throw new Error("无法保存回答");
          await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
          const response: ChatResponse = { conversationId, answer, query, evidence, noData };
          emit({ type: "complete", payload: response as unknown as Record<string, unknown> });
        } catch (error) {
          const message = error instanceof Error ? error.message : "服务暂时不可用";
          emit({ type: "error", payload: { message } });
        } finally {
          controller.close();
        }
      })();
    }
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8"
    }
  });
}
