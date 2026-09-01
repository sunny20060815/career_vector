import { env, type DeepSeekThinkingMode } from "@/lib/env";

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

type DeepSeekMessage = { role: "system" | "user"; content: string };

export function buildDeepSeekPayload(model: string, messages: DeepSeekMessage[], thinkingMode: DeepSeekThinkingMode) {
  return {
    model,
    messages,
    max_tokens: 2200,
    stream: false,
    thinking: { type: thinkingMode }
  };
}

export function limitCareerAnswer(answer: string, maxLength = 1000): string {
  const trimmed = answer.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const candidate = trimmed.slice(0, maxLength);
  const lastSentenceEnd = Math.max(...["。", "！", "？", "!", "?"].map((mark) => candidate.lastIndexOf(mark)));
  return lastSentenceEnd >= Math.floor(maxLength * 0.55)
    ? candidate.slice(0, lastSentenceEnd + 1)
    : `${candidate.slice(0, maxLength - 1)}…`;
}

export const CAREER_ADVISOR_SYSTEM_PROMPT = `你是“职向量”的首席职业顾问。你的任务不是复述数据，而是帮助用户做下一步职业决策。

【事实边界】你只能使用“检索证据”中的事实。不能补造行业、公司、城市、薪资、概率、增长率或因果关系；不能把相关性说成因果。预测必须明确是预测年份。若 observedPairCount 为 0，必须说明没有直接观测到该技能组合，不能推断组合工资互补效应。

【决策方法】先理解用户真正要解决的选择：职业方向、城市选择、技能补强或趋势判断。然后按“结论优先、理由随后、行动可执行”的顺序回答。职业推荐只提最相关的 1-3 个；城市只提最值得优先考虑的 1-3 个；下一技能只提最有用的 1-2 个。优先使用用户输入的目标城市、期望薪资、经验和预测年份，但这些偏好只是证据解释的一部分，不能假装成硬性录用条件。

【表达要求】用自然、克制的简体中文直接回答用户的问题。第一段先给明确、可执行的职业或城市选择建议。随后用 3-5 个自然段说明岗位匹配、城市或趋势、薪资或门槛、AI 影响和下一步技能行动；只有检索证据支持时才引用数字。不要解释系统、字段、算法、表名、JSON 或内部推理过程。避免“根据数据可见”“NPMI”“排名分数”“AI 暴露度”等技术术语堆砌；AI 相关内容只在影响岗位选择或学习方向时解释。

【长度与格式】总长度目标为 700-1000 个汉字，最多 6 段。不要使用标题、项目符号、Markdown 表格、免责声明套话或原始数据引用。不要通过重复句凑字数；结尾必须给出一个具体、低成本、可执行的下一步。`;

async function complete(model: string, messages: DeepSeekMessage[], timeoutMs = env.deepseekAnswerTimeoutMs()): Promise<string> {
  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.deepseekApiKey()}`
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(buildDeepSeekPayload(model, messages, env.deepseekThinkingMode()))
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("DeepSeek 响应超时");
    }
    throw new Error("DeepSeek 网络请求失败");
  }
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

export async function writeCareerAnswer(question: string, evidence: object): Promise<string> {
  const answer = await complete(env.deepseekAnswerModel(), [
    {
      role: "system",
      content: CAREER_ADVISOR_SYSTEM_PROMPT
    },
    { role: "user", content: `原问题：${question}\n检索证据：${JSON.stringify(evidence)}` }
  ]);
  return limitCareerAnswer(answer, 1000);
}
