import { NextResponse } from "next/server";

import { buildEvidencePreview, buildSuggestedQuestions, formatFallbackCareerAnswer, formatNoDataCareerAnswer } from "@/lib/career-presentation";
import { encodeChatStreamEvent } from "@/lib/chat-stream";
import { planCareerQuestion, writeCareerAnswer } from "@/lib/deepseek";
import { parseCareerQuestionFromCatalog, retrieveCareerEvidence } from "@/lib/evidence";
import { mergeCareerQueryContext } from "@/lib/query";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CareerQueryPlan } from "@/lib/career-plan";
import type { ChatRequest, ChatResponse } from "@/types/api";
import type { ParsedCareerQuery } from "@/types/career";

export const runtime = "nodejs";
export const maxDuration = 60;

const encoder = new TextEncoder();

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function titleFor(question: string): string {
  return question.replace(/\s+/g, " ").trim().slice(0, 28) || "新职业咨询";
}

function progressCopy(plan: CareerQueryPlan) {
  const copy = {
    learning_plan: {
      searching: "正在读取培养方案、课程能力与岗位需求...",
      writing: "课程与岗位证据已对齐，正在整理学习路径...",
      fallback: "生成服务较慢，正在依据培养方案与岗位证据完成学习建议..."
    },
    ai_tasks: {
      searching: "正在读取AI暴露、技能共现与职业任务证据...",
      writing: "正在区分AI辅助环节、替代压力与能力优势...",
      fallback: "生成服务较慢，正在依据AI暴露与技能证据完成回答..."
    },
    comparison: {
      searching: "正在读取两项选择的需求、工资与预测指标...",
      writing: "比较证据已就绪，正在形成投入优先级...",
      fallback: "生成服务较慢，正在依据可比指标完成优先级判断..."
    },
    trend: {
      searching: "正在读取历史需求、工资与未来预测序列...",
      writing: "预测证据已就绪，正在归纳趋势与不确定性...",
      fallback: "生成服务较慢，正在依据预测序列完成趋势判断..."
    },
    recommendation: {
      searching: "正在读取职业匹配、技能需求与城市证据...",
      writing: "匹配证据已就绪，正在形成职业规划建议...",
      fallback: "生成服务较慢，正在依据职业与技能证据完成建议..."
    },
    skill_growth: {
      searching: "正在比较候选技能及其职业、工资与城市证据...",
      writing: "候选技能证据已就绪，正在评估新增技能的具体影响...",
      fallback: "生成服务较慢，正在依据技能边际价值完成提升建议..."
    },
    explanation: {
      searching: "正在读取回答当前问题所需的劳动力市场证据...",
      writing: "相关证据已就绪，正在组织针对性说明...",
      fallback: "生成服务较慢，正在依据已检索证据完成说明..."
    },
    curriculum_design: {
      searching: "正在对照培养目标、历年课程供给与真实岗位需求...",
      writing: "课程与市场证据已对齐，正在形成培养方案诊断与修订建议...",
      fallback: "生成服务较慢，正在依据培养方案与岗位证据完成诊断..."
    }
  } as const;
  return copy[plan.answerStyle];
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return errorResponse("请求格式无效", 400);
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const audience = body.audience === "curriculum_designer" ? "curriculum_designer" : "individual";
  if (!question || question.length > 1600) return errorResponse("请输入 1 到 1600 个字符的问题", 400);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: Parameters<typeof encodeChatStreamEvent>[0]) => controller.enqueue(encoder.encode(encodeChatStreamEvent(event)));
      void (async () => {
        try {
          const supabase = await createServerSupabaseClient();
          const { data: claimsData } = await supabase.auth.getClaims();
          const userId = claimsData?.claims?.sub;
          if (!userId) throw new Error("请先登录后再咨询");

          let conversationId = body.conversationId;
          let previousQuery: ParsedCareerQuery | null = null;
          if (conversationId) {
            const { data: conversation, error } = await supabase.from("conversations").select("id").eq("id", conversationId).single();
            if (error || !conversation) throw new Error("会话不存在或无权访问");
            const { data: previousMessages } = await supabase.from("messages").select("structured_query").eq("conversation_id", conversationId).eq("role", "assistant").order("created_at", { ascending: false }).limit(20);
            previousQuery = (previousMessages ?? []).reverse().reduce<ParsedCareerQuery | null>((context, message) => {
              const parsed = message.structured_query as ParsedCareerQuery | null;
              return parsed ? mergeCareerQueryContext(parsed, context) : context;
            }, null);
          } else {
            const { data: conversation, error } = await supabase.from("conversations").insert({ user_id: userId, title: titleFor(question) }).select("id").single();
            if (error || !conversation) throw new Error("无法创建会话");
            conversationId = conversation.id;
          }
          if (!conversationId) throw new Error("无法确定会话标识");
          const { error: userMessageError } = await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content: question });
          if (userMessageError) throw new Error("无法保存提问");

          const query = mergeCareerQueryContext(await parseCareerQuestionFromCatalog(question), previousQuery);
          const queryPlan = await planCareerQuestion(question, query, audience);
          const taskProgress = progressCopy(queryPlan);
          emit({ type: "status", payload: { stage: "searching", message: taskProgress.searching } });
          const evidence = await retrieveCareerEvidence(query, queryPlan);
          const preview = buildEvidencePreview(evidence);
          emit({ type: "evidence", payload: { preview } });

          const noData = evidence.recognizedSkills.length === 0 && !evidence.targetOccupationSkills?.length;
          const missingCurriculum = audience === "curriculum_designer" && !evidence.curriculum;
          let answer: string;
          let suggestedQuestions: string[] = [];
          emit({ type: "status", payload: { stage: "writing", message: taskProgress.writing } });
          if (missingCurriculum) {
            answer = formatNoDataCareerAnswer(question, audience);
            suggestedQuestions = buildSuggestedQuestions(evidence);
          } else try {
            const generated = await writeCareerAnswer(question, evidence, audience);
            answer = generated.answer;
            suggestedQuestions = generated.suggestedQuestions.length ? generated.suggestedQuestions : buildSuggestedQuestions(evidence);
          } catch (error) {
            console.error("DeepSeek career answer failed; using evidence fallback", {
              message: error instanceof Error ? error.message : String(error)
            });
            emit({ type: "status", payload: { stage: "fallback", message: taskProgress.fallback } });
            answer = noData ? formatNoDataCareerAnswer(question, audience) : formatFallbackCareerAnswer(evidence, question);
            suggestedQuestions = buildSuggestedQuestions(evidence);
          }
          const { error: assistantMessageError } = await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: answer, structured_query: query, evidence });
          if (assistantMessageError) throw new Error("无法保存回答");
          await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
          const response: ChatResponse = { conversationId, answer, suggestedQuestions, query, evidence, noData, audience };
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
