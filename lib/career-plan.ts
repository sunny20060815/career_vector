import type { ParsedCareerQuery, UserAudience } from "@/types/career";

export const CAREER_EVIDENCE_MODULES = [
  "skill_profiles",
  "occupations",
  "skill_pairs",
  "next_skills",
  "cities",
  "ai_impact",
  "curriculum",
  "major_destinations",
  "occupation_catalog"
] as const;

export type CareerEvidenceModule = (typeof CAREER_EVIDENCE_MODULES)[number];
export type CareerAnswerStyle = "recommendation" | "comparison" | "trend" | "ai_tasks" | "learning_plan" | "skill_growth" | "explanation" | "curriculum_design";

export interface CareerQueryPlan {
  route: "standard" | "adaptive";
  answerStyle: CareerAnswerStyle;
  modules: CareerEvidenceModule[];
  focus: string;
  occupationTargets?: string[];
  occupationTargetConfidence?: number;
}

const moduleSet = new Set<string>(CAREER_EVIDENCE_MODULES);
const answerStyles = new Set<CareerAnswerStyle>(["recommendation", "comparison", "trend", "ai_tasks", "learning_plan", "skill_growth", "explanation", "curriculum_design"]);
const guardedAnswerStyles = new Set<CareerAnswerStyle>(["comparison", "ai_tasks", "learning_plan", "skill_growth", "curriculum_design"]);

function uniqueModules(modules: CareerEvidenceModule[]): CareerEvidenceModule[] {
  return Array.from(new Set(modules));
}

function isProfileIntroduction(question: string, query: ParsedCareerQuery): boolean {
  return Boolean(query.programKey && query.confirmedSkills?.length)
    && !/趋势|需求|工资|薪资|前景|城市|哪里|课程|学习|提升|下一步|补什么|AI|人工智能|辅助|替代|影响|冲击|互补|组合|比较|哪个|哪项|适合|岗位|职业|工作|就业|求职|转行|如何|怎么|为什么|多少/.test(question);
}

export function fallbackCareerPlan(question: string, query: ParsedCareerQuery, audience: UserAudience = "individual"): CareerQueryPlan {
  if (audience === "curriculum_designer") {
    return {
      route: "adaptive",
      answerStyle: "curriculum_design",
      modules: uniqueModules(["curriculum", "major_destinations", "skill_profiles", "occupations", "ai_impact", "skill_pairs", "occupation_catalog"]),
      focus: "诊断培养目标和课程技能供给，比较历年方案与真实岗位需求，并提出可执行的培养方案修订建议"
    };
  }
  const hasProgram = Boolean(query.programKey);
  const isProfile = isProfileIntroduction(question, query);
  const isLearningPlan = /课程学习|学习建议|学习规划|培养方案.*(?:课程|学习)|课程.*(?:怎么|如何|建议)/.test(question);
  const isAiTask = /(?:AI|人工智能).{0,16}(?:辅助|替代|影响|冲击|任务|渗透|暴露)/i.test(question);
  const isComparison = query.intent === "job_comparison" || /对比|比较|相比|哪个|哪项|更值得|还是/.test(question);
  const isSkillGrowth = query.intent === "skill_growth" || /下一步.{0,12}(?:补|学)|补什么技能|提升什么技能|下一项技能/.test(question);
  const isCity = query.intent === "city_recommendation" || /城市|哪里|哪座/.test(question);
  const isCareer = query.intent === "career_recommendation" || query.occupationKeywords.length > 0;

  if (isProfile) {
    return { route: "standard", answerStyle: "recommendation", modules: uniqueModules(["curriculum", "major_destinations", "skill_profiles", "occupations", "next_skills", "cities", "ai_impact", "occupation_catalog"]), focus: "结合培养方案、专业就业去向与用户确认技能生成综合职业规划" };
  }
  if (isLearningPlan) {
    return { route: "standard", answerStyle: "learning_plan", modules: uniqueModules(["curriculum", "major_destinations", "skill_profiles", "occupations", "next_skills", "ai_impact"]), focus: "结合培养方案、专业就业去向与岗位证据生成学习路径" };
  }
  if (isAiTask) {
    return { route: "adaptive", answerStyle: "ai_tasks", modules: uniqueModules(["skill_profiles", "ai_impact", "occupations", "skill_pairs"]), focus: "判断AI更可能改变哪些工作任务以及应强化什么能力" };
  }
  if (isSkillGrowth) {
    return { route: "adaptive", answerStyle: "skill_growth", modules: uniqueModules(["skill_profiles", "skill_pairs", "next_skills", "occupations", "cities", ...(hasProgram ? ["curriculum" as const, "major_destinations" as const] : [])]), focus: "推荐下一项技能并评估其对职业、工资与城市选择的影响" };
  }
  if (isComparison) {
    return { route: "adaptive", answerStyle: "comparison", modules: uniqueModules(["skill_profiles", "skill_pairs", "occupations", ...(hasProgram ? ["curriculum" as const, "major_destinations" as const] : [])]), focus: "围绕用户给出的选项作直接比较并给出优先级" };
  }
  if (isCity) {
    return { route: "standard", answerStyle: "recommendation", modules: uniqueModules(["skill_profiles", "occupations", "cities"]), focus: "比较城市机会并解释职业与技能依据" };
  }
  if (isCareer) {
    return { route: "standard", answerStyle: "recommendation", modules: uniqueModules(["skill_profiles", "occupations", "next_skills", "ai_impact", "occupation_catalog", ...(hasProgram ? ["curriculum" as const, "major_destinations" as const] : [])]), focus: "给出职业方向、关键依据和可执行的能力提升建议" };
  }
  return { route: "adaptive", answerStyle: "trend", modules: uniqueModules(["skill_profiles", "ai_impact"]), focus: "直接回答用户询问的技能市场趋势" };
}

export function parseCareerQueryPlan(content: string, question: string, query: ParsedCareerQuery, audience: UserAudience = "individual"): CareerQueryPlan {
  const fallback = fallbackCareerPlan(question, query, audience);
  const profileIntroduction = isProfileIntroduction(question, query);
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
    const guarded = audience === "curriculum_designer" || guardedAnswerStyles.has(fallback.answerStyle) || profileIntroduction;
    const structured = guarded || query.intent === "career_recommendation" || query.intent === "city_recommendation";
    const answerStyle = guarded ? fallback.answerStyle : parsedAnswerStyle;
    const route = guarded ? fallback.route : parsed.route === "standard" || parsed.route === "adaptive" ? parsed.route : fallback.route;
    const confidence = typeof parsed.occupationTargetConfidence === "number" ? parsed.occupationTargetConfidence : 0;
    const allowedTargets = new Set(query.occupationCandidates ?? []);
    const semanticTargets = confidence >= 0.72 && Array.isArray(parsed.occupationTargets)
      ? parsed.occupationTargets.filter((item): item is string => typeof item === "string" && allowedTargets.has(item)).slice(0, 3)
      : [];
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
      focus: guarded ? fallback.focus : typeof parsed.focus === "string" && parsed.focus.trim() ? parsed.focus.trim().slice(0, 120) : fallback.focus,
      occupationTargets: query.occupationKeywords.length ? query.occupationKeywords : semanticTargets,
      occupationTargetConfidence: query.occupationKeywords.length ? 1 : semanticTargets.length ? confidence : 0
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
- major_destinations：专业毕业去向、专业对口职业先验及去向占比
- occupation_catalog：职业小类包含的具体职业

route 使用 standard 或 adaptive。结构稳定的职业推荐、城市推荐和课程学习方案可用 standard；比较、下一技能、解释、AI任务影响以及其他个性化问题优先使用 adaptive。
answerStyle 只能使用 recommendation、comparison、trend、ai_tasks、learning_plan、skill_growth、explanation。
当使用身份为“培养方案制定者”时，必须选择 curriculum_design，并调用 curriculum、skill_profiles、occupations、ai_impact；根据问题可增加 skill_pairs 和 occupation_catalog。此时回答目标是诊断课程能力供给与岗位需求的对应关系，而不是给学生做个人求职推荐。
当用户只是陈述学校、年级、专业和自己会的技能，没有明确询问下一技能、比较、趋势或其他单项问题时，应选择 recommendation，并调用 curriculum、skill_profiles、occupations、cities、ai_impact 等模块形成综合规划；不得自行改成 skill_growth。
已识别结构中的 occupationCandidates 是根据用户目标表述、已识别技能和职业大典召回的候选职业小类。仅当用户明确表达想进入、从事或转向某类职业时，才能从中选择1至3项写入 occupationTargets；不得因用户的专业名称或课程名称自行推断职业目标。occupationTargetConfidence 使用0至1的小数：语义明确时应不低于0.72，存在歧义时应低于0.72并返回空数组。occupationTargets 只能使用 occupationCandidates 中的原文，不得创造名称。
只选择回答当前问题真正需要的模块，通常2至5个。输出严格JSON，不要Markdown，不要解释：
{"route":"adaptive","answerStyle":"comparison","modules":["skill_profiles","skill_pairs"],"focus":"比较两项技能的就业投入优先级","occupationTargets":[],"occupationTargetConfidence":0}
`;
