import { env } from "@/lib/env";
import { validateParsedCareerQuery } from "@/lib/query";
import type { ParsedCareerQuery } from "@/types/career";

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

async function complete(model: string, messages: Array<{ role: "system" | "user"; content: string }>): Promise<string> {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.deepseekApiKey()}`
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, stream: false })
  });
  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败（${response.status}）`);
  }
  const payload = (await response.json()) as DeepSeekResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("DeepSeek 未返回有效内容");
  }
  return content;
}

export async function parseCareerQuestion(question: string, history: string[]): Promise<ParsedCareerQuery> {
  const content = await complete(env.deepseekParseModel(), [
    {
      role: "system",
      content: "你是职业数据检索解析器。只输出 JSON，不回答问题。字段必须为 skills、occupationKeywords、cities、salaryMinYuan、salaryMaxYuan、experienceYears、education、forecastYear、intent。education 仅可为 secondary/associate/bachelor/master/doctor/null，forecastYear 仅可为 2026/2027/2028/null，intent 仅可为 career_recommendation/skill_trend/city_recommendation/job_comparison/skill_growth。未知字段填空数组或 null。"
    },
    {
      role: "user",
      content: `近期用户偏好：${history.join("；") || "无"}\n当前问题：${question}`
    }
  ]);
  try {
    return validateParsedCareerQuery(JSON.parse(content) as unknown);
  } catch {
    throw new Error("问题解析失败，请换一种更具体的描述");
  }
}

export async function writeCareerAnswer(question: string, evidence: object): Promise<string> {
  return complete(env.deepseekAnswerModel(), [
    {
      role: "system",
      content: "你是职业数据解读助手。只能根据提供的 JSON 事实回答，不得补充未出现的数值或因果关系。对预测必须标明年份；没有直接组合证据时必须说明不能推断组合互补效应。用简体中文，分段清晰。"
    },
    { role: "user", content: `原问题：${question}\n检索证据：${JSON.stringify(evidence)}` }
  ]);
}
