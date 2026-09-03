import type { ParsedCareerQuery } from "@/types/career";

export const CAREER_EVIDENCE_MODULES = [
  "skill_profiles",
  "occupations",
  "skill_pairs",
  "next_skills",
  "cities",
  "ai_impact",
  "curriculum",
  "occupation_catalog"
] as const;

export type CareerEvidenceModule = (typeof CAREER_EVIDENCE_MODULES)[number];
export type CareerAnswerStyle = "recommendation" | "comparison" | "trend" | "ai_tasks" | "learning_plan" | "skill_growth" | "explanation";

export interface CareerQueryPlan {
  route: "standard" | "adaptive";
  answerStyle: CareerAnswerStyle;
  modules: CareerEvidenceModule[];
  focus: string;
}

const moduleSet = new Set<string>(CAREER_EVIDENCE_MODULES);
const answerStyles = new Set<CareerAnswerStyle>(["recommendation", "comparison", "trend", "ai_tasks", "learning_plan", "skill_growth", "explanation"]);
const guardedAnswerStyles = new Set<CareerAnswerStyle>(["comparison", "ai_tasks", "learning_plan", "skill_growth"]);

function uniqueModules(modules: CareerEvidenceModule[]): CareerEvidenceModule[] {
  return Array.from(new Set(modules));
}

export function fallbackCareerPlan(question: string, query: ParsedCareerQuery): CareerQueryPlan {
  const hasProgram = Boolean(query.programKey);
  const isLearningPlan = /课程学习|学习建议|学习规划|培养方案.*(?:课程|学习)|课程.*(?:怎么|如何|建议)/.test(question);
  const isAiTask = /(?:AI|人工智能).{0,16}(?:辅助|替代|影响|冲击|任务|渗透|暴露)/i.test(question);
  const isComparison = query.intent === "job_comparison" || /对比|比较|相比|哪个|哪项|更值得|还是/.test(question);
  const isSkillGrowth = query.intent === "skill_growth" || /下一步.{0,12}(?:补|学)|补什么技能|提升什么技能|下一项技能/.test(question);
  const isCity = query.intent === "city_recommendation" || /城市|哪里|哪座/.test(question);
  const isCareer = query.intent === "career_recommendation" || query.occupationKeywords.length > 0;

  if (isLearningPlan) {
    return { route: "standard", answerStyle: "learning_plan", modules: uniqueModules(["curriculum", "skill_profiles", "occupations", "next_skills", "ai_impact"]), focus: "结合培养方案与岗位证据生成学习路径" };
  }
  if (isAiTask) {
    return { route: "adaptive", answerStyle: "ai_tasks", modules: uniqueModules(["skill_profiles", "ai_impact", "occupations", "skill_pairs"]), focus: "判断AI更可能改变哪些工作任务以及应强化什么能力" };
  }
  if (isSkillGrowth) {
    return { route: "adaptive", answerStyle: "skill_growth", modules: uniqueModules(["skill_profiles", "skill_pairs", "next_skills", "occupations", "cities", ...(hasProgram ? ["curriculum" as const] : [])]), focus: "推荐下一项技能并评估其对职业、工资与城市选择的影响" };
  }
  if (isComparison) {
    return { route: "adaptive", answerStyle: "comparison", modules: uniqueModules(["skill_profiles", "skill_pairs", "occupations", ...(hasProgram ? ["curriculum" as const] : [])]), focus: "围绕用户给出的选项作直接比较并给出优先级" };
  }
  if (isCity) {
    return { route: "standard", answerStyle: "recommendation", modules: uniqueModules(["skill_profiles", "occupations", "cities"]), focus: "比较城市机会并解释职业与技能依据" };
  }
  if (isCareer) {
    return { route: "standard", answerStyle: "recommendation", modules: uniqueModules(["skill_profiles", "occupations", "next_skills", "ai_impact", "occupation_catalog", ...(hasProgram ? ["curriculum" as const] : [])]), focus: "给出职业方向、关键依据和可执行的能力提升建议" };
  }
  return { route: "adaptive", answerStyle: "trend", modules: uniqueModules(["skill_profiles", "ai_impact"]), focus: "直接回答用户询问的技能市场趋势" };
}

export function parseCareerQueryPlan(content: string, question: string, query: ParsedCareerQuery): CareerQueryPlan {
  const fallback = fallbackCareerPlan(question, query);
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const modules = Array.isArray(parsed.modules)
      ? parsed.modules.filter((item): item is CareerEvidenceModule => typeof item === "string" && moduleSet.has(item))
      : [];
    const parsedAnswerStyle = typeof parsed.answerStyle === "string" && answerStyles.has(parsed.answerStyle as CareerAnswerStyle)
      ? parsed.answerStyle as CareerAnswerStyle
      : fallback.answerStyle;
    const guarded = guardedAnswerStyles.has(fallback.answerStyle);
    const structured = guarded || query.intent === "career_recommendation" || query.intent === "city_recommendation";
    const answerStyle = guarded ? fallback.answerStyle : parsedAnswerStyle;
    const route = guarded ? fallback.route : parsed.route === "standard" || parsed.route === "adaptive" ? parsed.route : fallback.route;
    const required = [
      ...(structured ? fallback.modules : []),
      ...modules,
      ...(query.skills.length ? ["skill_profiles" as const] : []),
      ...(query.programKey && (answerStyle === "learning_plan" || route === "standard") ? ["curriculum" as const] : []),
      ...(/(?:AI|人工智能)/i.test(question) ? ["ai_impact" as const] : [])
    ];
    return {
      route,
      answerStyle,
      modules: uniqueModules(required.length ? required : fallback.modules),
      focus: guarded ? fallback.focus : typeof parsed.focus === "string" && parsed.focus.trim() ? parsed.focus.trim().slice(0, 120) : fallback.focus
    };
  } catch {
    return fallback;
  }
}

export const CAREER_PLANNER_PROMPT = `
你是“职向量”的检索规划器。你只负责判断用户的问题需要调用哪些数据模块，不负责回答问题，也不能生成任何市场数值。

可选模块：
- skill_profiles：技能需求、工资、学历、经验和预测趋势
- occupations：职业匹配
- skill_pairs：技能共现、工资互补和组合前景
- next_skills：下一技能建议
- cities：城市需求与排序
- ai_impact：职业AI暴露、AI技能共现及任务调整依据
- curriculum：学校培养方案、课程和推断能力
- occupation_catalog：职业小类包含的具体职业

route 使用 standard 或 adaptive。结构稳定的职业推荐、城市推荐和课程学习方案可用 standard；比较、下一技能、解释、AI任务影响以及其他个性化问题优先使用 adaptive。
answerStyle 只能使用 recommendation、comparison、trend、ai_tasks、learning_plan、skill_growth、explanation。
只选择回答当前问题真正需要的模块，通常2至5个。输出严格JSON，不要Markdown，不要解释：
{"route":"adaptive","answerStyle":"comparison","modules":["skill_profiles","skill_pairs"],"focus":"比较两项技能的就业投入优先级"}
`;
