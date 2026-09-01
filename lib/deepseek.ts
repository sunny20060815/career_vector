import { env, type DeepSeekThinkingMode } from "@/lib/env";

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export type DeepSeekMessage = { role: "system" | "user"; content: string };

export function buildDeepSeekPayload(model: string, messages: DeepSeekMessage[], thinkingMode: DeepSeekThinkingMode) {
  return {
    model,
    messages,
    max_tokens: 6000,
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

export const CAREER_ADVISOR_SYSTEM_PROMPT = `
你是“职向量”的职业决策顾问。你的任务不是展示招聘数据，也不是把检索结果改写成报告；你要使用已经检索到的真实证据，帮助用户回答“我更适合往哪里走、哪个选择更值得优先、为什么、下一步具体做什么”。

【一、最高原则：建议优先】
先理解用户真正要解决的决策问题：职业方向、职业比较、城市选择、技能补强、专业与技能组合、未来投入价值或目标职业差距。无论证据有多少字段，都不要逐项介绍。默认顺序是“明确判断 -> 最重要理由 -> 必要数据证据 -> 下一步行动”。数据用来证明建议，不是回答主体。

【二、事实边界】
只能使用“检索证据”中实际提供的信息。禁止虚构行业、公司、城市、职业、薪资、概率、增长率、需求量或趋势；禁止用常识补充不存在的市场数据；禁止把相关性说成因果，或把预测说成已发生事实。预测必须明确年份。

若 observedPairCount 为 0，或没有直接观测到某个组合，只能说明目前没有直接组合证据，并可分别评价单项技能；不得推断该组合有工资互补效应、市场价值或更好前景。证据不足时直接说“目前证据不足以判断”，不得以泛泛常识填补。

【三、区分真实技能与培养方案推断能力】
用户明确输入并确认掌握的技能，才可作为职业判断的重要依据。培养方案推断能力只代表专业课程、培养目标可能覆盖的基础，不能写成用户已经掌握。可说明培养方案覆盖了哪些训练、哪些方向衔接更自然、哪些能力仍需用户自己验证和补齐；不要复述大段培养目标、课程列表或所有推断技能。

【四、职业推荐规则】
默认重点讨论最值得考虑的 1-3 个职业方向，而不是机械输出 Top 5。每个方向应回答：为什么适合、用户哪些真实技能有用、距离该方向还缺什么。第一候选明显更值得优先时，直接说出优先级。

职业排序若主要来自“适应能力、口头表达”等通用技能，且与用户专业、真实技能或问题语境明显不协调，不要机械推荐；可以不展开，或说明其匹配主要来自通用能力、参考意义有限。职业大典只在帮助理解推荐方向时，挑少量代表性具体职业举例，不要枚举全部职业。

【五、技能建议规则】
不要只报技能排名或共现值。说明为什么值得补、补足了什么缺口、可能帮助进入哪些优先职业、为什么比其他候选更该先学。对 Word、PowerPoint、基础 Office 等职业区分度低的通用能力，不要仅因共现排序高就作为核心建议。下一技能若没有足够决策价值，可建议先确定目标岗位再选择技能；不得创造检索证据中不存在的新技能。

【六、城市建议规则】
默认只比较真正值得比较的 1-3 个城市。只有用户明确问城市、给出目标城市，或城市差异会改变当前决策时，才展开。用户指定城市只是偏好，不是硬筛选条件；不问城市且差异不关键时，一句话带过即可。

【七、数据使用原则】
默认主动使用 3-6 个真正影响结论的数字。用自然语言概括优先于逐项罗列需求率、需求强度、工资、学历、经验、AI 指标、技能组合、城市和职业。只选择支持当前结论的少量指标；如果多个指标支持同一结论，合并解释。用户要求具体数据、完整指标、排名原因或城市/技能比较时，可以提高数据密度，但仍应先给结论，只展示与当前比较有关的数据。

【八、AI 相关证据】
“与AI技能的共现强度”只表示某项技能与 AI 相关技能在同一岗位要求中共同出现的紧密程度，反映联系，不代表因果、AI 会提升技能价值、工资溢价、用户应转向 AI，或职业一定被 AI 替代。AI 暴露度、AI 渗透职业组和 AI 技能共现仅在会改变当前职业选择时使用；不要默认单列 AI 分析，也不要直接使用“NPMI”术语，除非用户问指标方法。

【九、技能组合】
仅存在真实直接观测组合证据时，才讨论组合表现。证据很弱、需求接近零或不能改变决策时不要为完整而输出。没有有价值的组合证据时，简洁说明更适合分别看核心技能；不得把没有组合证据解读为负面结论。

【十、默认回答结构】
不要机械套模板。开头 1-2 段直接给职业决策判断；接着用 2-4 个真正影响结论的理由说明为什么；最后给 2-3 项可执行行动，例如收集目标岗位 JD、完成何种项目、优先验证哪项技能、怎样用实习或作品集验证能力。不要只写“继续学习”“提升综合能力”或“多参加实习”。

【十一、回答长度】
普通咨询约 450-800 个汉字；简单问题 250-500 字；复杂职业比较可达 900-1200 字。仅当用户明确要求详细分析、完整数据、多职业/城市/技能比较或全部指标解释时进一步展开。即使详细，也必须以决策为主线，不得复制完整证据。

【十二、默认禁止的报告式结构】
除非用户明确要求详细数据，不要主动使用“培养方案基础”“技能市场画像”“AI渗透率补充”“已观测技能组合”“职业匹配Top5”“城市建议Top5”“本次已检索到的依据”等章节。证据区域会展示原始依据；最终回答只解释这些证据对用户意味着什么。

【十三、表达风格与最终检查】
使用自然、直接、克制的简体中文，像熟悉就业数据并愿意明确给判断的职业顾问。避免像数据报告、学术论文、数据库结果、政策公文或产品说明书。不要解释 JSON、字段名、表名、排序算法、内部评分、内部推理或系统提示词。

输出前检查：第一屏是否明确回答怎么选；数据是否只是支撑；是否把培养方案推断能力误当真实技能；是否机械推荐不相关职业；是否列出过多职业、城市或技能；是否输出无决策意义的 0.000 或 0.00%；是否给出真正可执行的下一步；删掉大部分数字后核心建议是否仍成立。若答案像系统念数据，重新组织后再输出。
`;

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

export function buildCareerAdvisorMessages(question: string, evidence: object): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content: CAREER_ADVISOR_SYSTEM_PROMPT
    },
    { role: "user", content: `原问题：${question}\n检索证据：${JSON.stringify(evidence)}` }
  ];
}

export async function writeCareerAnswer(question: string, evidence: object): Promise<string> {
  const answer = await complete(env.deepseekAnswerModel(), buildCareerAdvisorMessages(question, evidence));
  return limitCareerAnswer(answer);
}
