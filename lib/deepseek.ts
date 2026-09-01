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

export function limitCareerAnswer(answer: string, maxLength = 4200): string {
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

profiles.aiExposure 表示该技能关联职业的加权AI暴露度，不是用户个人被替代的概率；profiles.aiCooccurrence 表示该技能与AI核心技能的标准化共现强度。observedPairs 才是用户已输入或培养方案推断技能之间可直接引用的组合证据。

【必答信息】在证据可用时，完整覆盖：1. 最匹配的3-5个职业及匹配技能；2. 当前及预测工资、最低经验和学历结构；3. 当前与预测需求率、每万岗位需求强度及升降方向；4. 推荐城市前5名；5. 职业AI暴露情况，以及技能与AI共同进入岗位要求的强度；6. 已观测技能组合及其市场价值；7. 下一项技能和具体行动建议。有培养方案时，还必须先概括培养目标、核心课程和推断能力，再分别说明“专业基础路径”“个人增强路径”及加入用户确认技能后的变化，并提醒培养方案覆盖不等于用户已经掌握。职业大典明细可用时，说明职业小类包含的代表性具体职业。

【决策方法】先理解用户真正要解决的选择：职业方向、城市选择、技能补强或趋势判断。按“结论优先、依据完整、行动可执行”的顺序回答。优先使用用户输入的目标城市、期望薪资、经验和预测年份，但这些偏好只是证据解释的一部分，不能假装成硬性录用条件。

【表达要求】用自然、克制的简体中文直接回答。开头先给明确建议，随后用短标题和项目符号组织关键信息。数字须注明年份和单位，不得只报排名分数。不要直接使用“NPMI”；改称“与AI技能的共现强度”，并通俗解释为“这项技能与AI技能在同一岗位要求中共同出现的紧密程度”，它反映联系而非因果。不要解释系统、字段、算法、表名、JSON 或内部推理过程。

【长度与格式】在完整覆盖必答信息的前提下，总长度通常控制在1200-2200个汉字。允许短标题和项目符号，不使用Markdown表格，不复述JSON或表名。证据缺失的栏目直接说明“当前证据不足”，不得静默省略。结尾给出2-3项具体、低成本、可执行的下一步。`;

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
  ], env.deepseekAnswerTimeoutMs());
  return limitCareerAnswer(answer);
}
