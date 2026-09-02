import type { CareerEvidence } from "@/lib/evidence";

export interface EvidencePreview {
  sources: string[];
  skills: string[];
  occupations: string[];
  cities: string[];
  nextSkills: string[];
  observedPairCount: number;
}

export function buildEvidencePreview(evidence: CareerEvidence): EvidencePreview {
  const selected = new Set(evidence.queriedModules ?? ["skill_profiles", "occupations", "cities", "skill_pairs"]);
  const sources: string[] = [];
  if (selected.has("skill_profiles")) sources.push("skills");
  if (selected.has("occupations")) sources.push("occupation_skill_stats");
  if (selected.has("cities")) sources.push("city_skill_forecasts");
  if (selected.has("skill_pairs") || selected.has("next_skills")) sources.push("skill_pairs");
  if (evidence.observedPairs.length && selected.has("occupations")) sources.push("pair_occupation_stats");
  if (evidence.curriculum) sources.push("major_programs", "major_skills");
  if (evidence.occupationDetails?.length) sources.push("occupation_catalog");
  if (evidence.aiExposureDetails.length) sources.push("skill_ai_exposure");
  if (evidence.aiCooccurrenceSource === "supabase") sources.push("ai_skill_cooccurrence");
  if (evidence.aiCooccurrenceSource === "local_csv") sources.push("ai_skill_cooccurrence（本地索引兜底）");
  return {
    sources: Array.from(new Set(sources)),
    skills: evidence.recognizedSkills.slice(0, 5),
    occupations: evidence.occupations.slice(0, 3).map((item) => item.name),
    cities: evidence.cities.slice(0, 3).map((item) => item.city),
    nextSkills: evidence.nextSkills.slice(0, 3).map((item) => item.skill),
    observedPairCount: evidence.observedPairCount
  };
}

export function buildSuggestedQuestions(evidence: CareerEvidence): string[] {
  const occupation = evidence.occupations[0]?.name;
  const nextSkill = evidence.nextSkills.find((item) => item.cooccurrence !== null && Math.abs(item.cooccurrence) >= 0.01)?.skill;
  const city = evidence.cities[0]?.city;
  const hasAiEvidence = evidence.profiles.some((profile) => {
    const exposure = numberValue(profile, "aiExposure");
    const cooccurrence = numberValue(profile, "aiCooccurrence");
    return (exposure !== null && exposure > 0) || (cooccurrence !== null && Math.abs(cooccurrence) >= 0.01);
  });
  const questions = [
    occupation ? `我距离${occupation}还缺哪些关键技能？` : "我应该优先选择哪个职业方向？",
    nextSkill ? `如果补充${nextSkill}，我的职业匹配会发生什么变化？` : occupation ? `怎样用项目经历证明我适合${occupation}？` : "我下一步最值得补充哪项技能？",
    evidence.curriculum && occupation
      ? `培养方案中的哪些课程最有助于进入${occupation}？`
      : hasAiEvidence && occupation
        ? `AI会如何影响${occupation}，我该怎样准备？`
        : city && occupation
          ? `${city}有哪些更适合我的${occupation}岗位方向？`
          : "人工智能时代我应该重点强化哪些能力？"
  ];
  return Array.from(new Set(questions)).slice(0, 3);
}

export function formatNoDataCareerAnswer(question: string): string {
  if (/怎样|怎么|如何/.test(question) && /描述|输入/.test(question)) {
    return "你可以按“学校与年级+专业+已经掌握的技能+经验或项目+目标职业或城市”来描述。例如：我是首经贸2024级经济学（实验班）学生，会Python和Stata，做过数据分析项目，想在北京寻找数据分析相关岗位。请区分课程接触过的内容与已经能够独立使用的技能，系统会据此分别识别专业基础和个人增强能力。";
  }
  if (/培养方案|课程/.test(question)) {
    return "可以分析，但还需要先确定你的学校、年级和专业，以匹配对应培养方案。请补充类似“首经贸2024级经济学（实验班）”的信息；若再提供目标职业，系统还会比较课程训练与岗位技能需求之间的差距。";
  }
  return "这个问题可以继续分析，但目前还缺少能够连接招聘数据的个人或目标信息。请至少补充专业、已掌握技能、目标职业或目标城市中的一项；方法、概念和输入方式类问题也可以直接提问，无需先提供技能。";
}

function numberValue(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

function profileName(profile: Record<string, unknown>): string {
  return String(profile.displayName || profile.skill || "相关技能");
}

function curriculumSentence(curriculum: Record<string, unknown>, inferredSkills: string[]): string {
  const courses = String(curriculum.core_courses || "")
    .split(/[、，,；;\n]/)
    .map((course) => course.trim())
    .filter(Boolean);
  const quantitative = courses.filter((course) => /统计|计量|数学|预测|数据|编程|模型|算法|机器学习|人工智能/.test(course)).slice(0, 4);
  const theory = courses.filter((course) => !quantitative.includes(course)).slice(0, 2);
  const modules = [
    theory.length ? `专业理论（${theory.join("、")}）` : "",
    quantitative.length ? `定量与工具训练（${quantitative.join("、")}）` : ""
  ].filter(Boolean).join("和");
  const potential = inferredSkills.slice(0, 3).join("、");
  const major = String(curriculum.major || "");
  const trainedAbilities = quantitative.length
    ? /经济|金融|贸易|财政/.test(major) ? "专业问题分析、定量研究和经济预测" : "专业分析、定量研究和工具应用"
    : potential || "专业分析与问题解决";
  return `培养方案以${modules || "专业课程与实践训练"}为主要基础，校内学习可能为${trainedAbilities}提供训练；这些课程覆盖仍需通过项目或实习转化为可验证能力。`;
}

function profileSentence(profile: Record<string, unknown>, forecastYear: number): string {
  const forecast = typeof profile.forecast === "object" && profile.forecast !== null
    ? profile.forecast as Record<string, unknown>
    : {};
  const facts: string[] = [];
  const salary = numberValue(profile, "salaryMedian2025");
  const demand = numberValue(profile, "demandPer10k2025");
  const trend = typeof forecast.trend === "string" ? forecast.trend.trim() : "";
  if (salary !== null && salary > 0) facts.push(`当前月薪中位数约${Math.round(salary)}元`);
  if (demand !== null && demand > 0) facts.push(`2025年需求强度约${demand.toFixed(1)}个/万岗位`);
  if (trend) facts.push(`${forecastYear}年预测趋势为${trend}`);
  return `${profileName(profile)}：${facts.join("，") || "现有指标不足以支持进一步判断"}。`;
}

function formatAiTaskFallback(evidence: CareerEvidence): string {
  const confirmed = new Set(evidence.confirmedSkills ?? evidence.recognizedSkills);
  const profiles = evidence.profiles.filter((profile) => confirmed.has(String(profile.skill || profile.displayName || "")));
  const names = Array.from(confirmed);
  const financeContext = names.some((skill) => /财务|会计|审计|预算|Excel|报表/.test(skill));
  const strongestAiProfile = profiles
    .map((profile) => ({ profile, exposure: numberValue(profile, "aiExposure"), cooccurrence: numberValue(profile, "aiCooccurrence") }))
    .sort((left, right) => (right.exposure ?? 0) - (left.exposure ?? 0))[0];
  const evidenceLine = strongestAiProfile ? (() => {
    const name = profileName(strongestAiProfile.profile);
    const group = String(strongestAiProfile.profile.aiGroup || "").trim();
    const facts = [
      strongestAiProfile.exposure !== null && strongestAiProfile.exposure > 0 ? `关联职业AI暴露度约${strongestAiProfile.exposure.toFixed(1)}` : "",
      group,
      strongestAiProfile.cooccurrence !== null && Math.abs(strongestAiProfile.cooccurrence) >= 0.01 ? `与AI技能的共现强度为${strongestAiProfile.cooccurrence.toFixed(3)}` : ""
    ].filter(Boolean).join("，");
    return facts ? `${name}的${facts}。这些指标反映任务受到AI影响或与AI共同进入岗位要求的程度，不能直接解释为岗位被替代的概率。` : "";
  })() : "";
  const primaryOccupation = evidence.occupations.find((occupation) => occupation.matchedSkills.some((skill) => confirmed.has(skill)))?.name;

  return [
    "**判断**",
    `对${names.join("和") || "你提到的能力"}而言，AI更可能先替代或压缩其中高度标准化、重复执行的环节，同时强化对专业判断、结果复核和业务解释的要求，而不是一次性替代整个${primaryOccupation ? `${primaryOccupation}方向` : "岗位"}。`,
    evidenceLine,
    "**AI更适合辅助的任务**",
    financeContext
      ? "- 表格清洗、格式转换、公式与脚本草拟、标准报表初稿、重复性核对和异常项初筛。"
      : "- 结构化信息整理、文本与代码草拟、重复性数据处理、初步分析和结果摘要。",
    "**应重点强化的能力**",
    financeContext
      ? "- 财务口径与业务逻辑判断、数据质量核验、模型假设解释、风险识别，以及对最终结论承担复核责任。"
      : "- 领域问题定义、数据质量判断、方法选择、结果核验、沟通决策和最终责任。",
    "**下一步**",
    `1. 用${names.slice(0, 2).join("和") || "现有技能"}完成一个包含“AI初步处理—人工校验—业务解释”的项目，把人机分工过程作为作品集证据。`,
    `2. 面向${primaryOccupation || "目标职业"}重点证明你能发现AI输出中的口径错误、数据异常和解释偏差，而不仅是会调用AI工具。`
  ].filter(Boolean).join("\n\n");
}

function comparisonTerms(question: string): string[] {
  const match = question.match(/([^，。！？?]{2,24}?)(?:和|与|还是)([^，。！？?]{2,32})/);
  if (!match) return [];
  return [match[1], match[2]]
    .map((term) => term.replace(/^(?:请问|我想知道|帮我比较|比较)/, "").replace(/(?:在)?就业上.*$/, "").replace(/(?:哪个|哪一个|哪项|谁|更值得).*$/, "").trim())
    .filter(Boolean);
}

function formatComparisonFallback(evidence: CareerEvidence, question: string): string {
  const profiles = evidence.profiles.slice().sort((left, right) => (numberValue(right, "demandPer10k2025") ?? 0) - (numberValue(left, "demandPer10k2025") ?? 0));
  const terms = comparisonTerms(question);
  const leading = profiles[0];
  const recognizedNames = new Set(profiles.map(profileName));
  const unsupported = terms.filter((term) => !Array.from(recognizedNames).some((name) => term.includes(name) || name.includes(term)));
  if (!leading) {
    return `**比较结果**\n\n目前技能库尚未检索到${terms.join("和") || "这两个选项"}的独立市场指标，因此不能给出可靠的量化优先级。你可以补充目标职业或发展方向，系统再从职业所需能力而不是单项技能指标进行比较。`;
  }
  const leadingName = profileName(leading);
  const limitedComparison = unsupported.length
    ? `平台目前没有把${unsupported.join("、")}作为独立标准技能统计，因此下面的结论是“可量化招聘证据”上的优先级，而不是对两者全部学习价值的完全比较。`
    : "两项技能均有可比的招聘市场指标，下面按岗位需求、工资和预测趋势判断。";
  return [
    "**比较结果**",
    `如果以就业市场中的直接岗位信号为标准，我会优先投入${leadingName}。${limitedComparison}`,
    "**数据依据**",
    ...profiles.slice(0, 2).map((profile) => `- ${profileSentence(profile, evidence.forecastYear)}`),
    "**怎么组合投入**",
    unsupported.length
      ? `${unsupported[0]}可以作为专业分析或方法基础，${leadingName}则更适合转化为招聘中可识别、可展示的工具能力。实际学习中不必二选一，但求职作品应优先让${leadingName}形成可验证成果。`
      : `先围绕需求信号更强的${leadingName}形成一个完整项目，再把另一项技能用于增强问题定义、分析方法或应用场景。`
  ].join("\n\n");
}

function isMeaningfulPair(pair: CareerEvidence["observedPairs"][number]): boolean {
  const hasEvidenceLevel = Boolean(pair.evidenceLevel && !["暂无", "无"].includes(pair.evidenceLevel.trim()));
  const significantWage = pair.wageComplementPValue !== null
    && pair.wageComplementPValue <= 0.05
    && pair.wageComplementPct !== null
    && Math.abs(pair.wageComplementPct) >= 0.1;
  return significantWage
    || hasEvidenceLevel
    || (pair.cooccurrence !== null && Math.abs(pair.cooccurrence) >= 0.01)
    || (pair.demandRate2025 !== null && pair.demandRate2025 > 0)
    || (pair.demandRate2028 !== null && pair.demandRate2028 > 0);
}

function pairSentence(pair: CareerEvidence["observedPairs"][number]): string {
  if (pair.wageComplementPValue !== null && pair.wageComplementPValue <= 0.05 && pair.wageComplementPct !== null) {
    return `${pair.skillA}与${pair.skillB}存在直接观测到的工资互补证据，互补效应约${pair.wageComplementPct.toFixed(1)}%。`;
  }
  if (pair.cooccurrence !== null && Math.abs(pair.cooccurrence) >= 0.01) {
    return `${pair.skillA}与${pair.skillB}存在直接共现证据，共现强度为${pair.cooccurrence.toFixed(3)}；这表示两项技能更常共同进入岗位要求，不等同于工资溢价。`;
  }
  return `${pair.skillA}与${pair.skillB}已有直接组合记录，但现有证据不足以判断工资互补。`;
}

function formatCurriculumLearningAnswer(evidence: CareerEvidence, curriculum: Record<string, unknown>): string {
  const courses = String(curriculum.core_courses || "").split(/[、，,；;\n]/).map((course) => course.trim()).filter(Boolean);
  const quantitative = courses.filter((course) => /统计|计量|数学|预测|数据|编程|模型|算法|机器学习|人工智能/.test(course)).slice(0, 4);
  const theory = courses.filter((course) => !quantitative.includes(course)).slice(0, 4);
  const occupation = evidence.occupations[0]?.name || "目标职业";
  const nextSkill = evidence.nextSkills.find((item) => item.cooccurrence !== null && Math.abs(item.cooccurrence) >= 0.01)?.skill;
  return [
    "**课程学习建议**",
    `建议围绕${occupation}建立“专业理论—定量工具—综合应用”的学习主线。培养方案中的课程覆盖只能说明学校提供了训练基础，最终仍需要通过项目成果证明你能够独立应用。`,
    "**学习顺序**",
    `1. 先吃透${theory.slice(0, 3).join("、") || "专业基础课程"}，重点训练问题定义、理论解释和专业判断。`,
    `2. 再强化${quantitative.join("、") || "定量与工具课程"}，把公式和方法转化为可复现的数据分析过程。`,
    `3. 最后完成一个面向${occupation}的综合项目，形成“问题提出—数据处理—分析验证—结果解释”的完整作品。`,
    "**课程外补充**",
    nextSkill ? `${nextSkill}与现有能力存在直接共现证据，可作为优先验证的补充技能。` : "现有证据不足以确定唯一的下一技能，建议先围绕目标职业完成课程项目，再根据项目中的真实缺口补充工具。",
    "**AI辅助方式**",
    "可以使用AI辅助资料梳理、代码解释、调试和初步结果检查，但问题设定、数据质量判断、方法选择与结果解释应由你自己完成，并在作品集中明确人工核验过程。"
  ].join("\n\n");
}

export function formatFallbackCareerAnswer(evidence: CareerEvidence, question = ""): string {
  if (evidence.queryPlan?.answerStyle === "ai_tasks") return formatAiTaskFallback(evidence);
  if (evidence.queryPlan?.answerStyle === "comparison") return formatComparisonFallback(evidence, question);
  const curriculum = evidence.curriculum as Record<string, unknown> | null | undefined;
  if (curriculum && /课程学习|学习建议|学习规划|课程.*怎么|课程.*如何/.test(question)) return formatCurriculumLearningAnswer(evidence, curriculum);
  const confirmedSkills = evidence.confirmedSkills ?? evidence.recognizedSkills;
  const confirmedSet = new Set(confirmedSkills);
  const inferredSkills = (evidence.inferredSkills ?? []).filter((skill) => !confirmedSet.has(skill));

  const rankedOccupations = evidence.occupations
    .map((item, index) => ({
      item,
      index,
      confirmedMatches: item.matchedSkills.filter((skill) => confirmedSet.has(skill))
    }))
    .sort((left, right) => right.confirmedMatches.length - left.confirmedMatches.length
      || right.item.score - left.item.score
      || left.index - right.index);
  const directMatches = confirmedSkills.length
    ? rankedOccupations.filter((item) => item.confirmedMatches.length > 0)
    : rankedOccupations;
  const occupations = (directMatches.length ? directMatches : rankedOccupations).slice(0, 2);

  let decision = "现有证据不足以给出可靠的职业方向，建议先补充自己实际使用过的工具、专业知识或项目经历。";
  if (occupations.length === 1) {
    decision = `如果以就业为目标，我会优先考虑${occupations[0].item.name}。`;
  } else if (occupations.length >= 2) {
    decision = `如果以就业为目标，我会优先考虑${occupations[0].item.name}，其次是${occupations[1].item.name}。`;
  }

  const profileBySkill = new Map<string, Record<string, unknown>>();
  for (const profile of evidence.profiles) {
    profileBySkill.set(profileName(profile), profile);
    if (profile.skill) profileBySkill.set(String(profile.skill), profile);
  }
  const selectedProfiles = confirmedSkills
    .map((skill) => profileBySkill.get(skill))
    .filter((profile): profile is Record<string, unknown> => Boolean(profile))
    .slice(0, 2);
  if (!selectedProfiles.length && evidence.profiles[0]) selectedProfiles.push(evidence.profiles[0]);

  const reasonLines: string[] = [];
  if (confirmedSkills.length) {
    const major = curriculum ? String(curriculum.major || "").trim() : "";
    reasonLines.push(`你当前最可信的优势是${major ? `“${major}+${confirmedSkills.slice(0, 3).join("+")}”` : confirmedSkills.slice(0, 3).join("、")}，职业排序主要依据这些明确输入的技能。`);
  }
  if (curriculum) {
    reasonLines.push(curriculumSentence(curriculum, inferredSkills));
  }
  for (const occupation of occupations.slice(0, 2)) {
    const matches = occupation.confirmedMatches.length ? occupation.confirmedMatches : occupation.item.matchedSkills.slice(0, 2);
    const detail = evidence.occupationDetails?.find((item) => item.subclassCode === occupation.item.code || item.subclassName === occupation.item.name);
    const examples = detail?.occupations.slice(0, 2).map((item) => item.name).join("、");
    reasonLines.push(`${occupation.item.name}与${matches.join("、") || "现有能力基础"}直接匹配${examples ? `，可重点了解${examples}等具体岗位` : ""}。`);
  }
  reasonLines.push(...selectedProfiles.map((profile) => profileSentence(profile, evidence.forecastYear)));

  const aiProfile = selectedProfiles
    .map((profile) => ({
      profile,
      cooccurrence: numberValue(profile, "aiCooccurrence"),
      exposure: numberValue(profile, "aiExposure")
    }))
    .filter((item) => (item.exposure !== null && item.exposure > 0) || (item.cooccurrence !== null && Math.abs(item.cooccurrence) >= 0.01))
    .sort((left, right) => Number(right.cooccurrence !== null && Math.abs(right.cooccurrence) >= 0.01)
      - Number(left.cooccurrence !== null && Math.abs(left.cooccurrence) >= 0.01)
      || (right.exposure ?? 0) - (left.exposure ?? 0))[0];
  if (aiProfile) {
    const name = profileName(aiProfile.profile);
    const detail = evidence.aiExposureDetails.find((item) => item.skill === name);
    const group = String(aiProfile.profile.aiGroup || detail?.aiGroup || "").trim();
    const aiFacts = [
      aiProfile.exposure !== null ? `关联职业AI暴露度约${aiProfile.exposure.toFixed(1)}` : "",
      group ? `属于${group}` : "",
      aiProfile.cooccurrence !== null && Math.abs(aiProfile.cooccurrence) >= 0.01
        ? `与AI技能的共现强度为${aiProfile.cooccurrence.toFixed(3)}`
        : ""
    ].filter(Boolean).join("，");
    reasonLines.push(`${name}${aiFacts ? `的${aiFacts}` : "存在有效AI关联证据"}。AI暴露较高表示任务更可能被调整，不等于职业会被整体替代。`);
    const hasDataSkills = confirmedSkills.some((skill) => /Python|Stata|R语言|数据|统计|SQL|编程|算法/.test(skill));
    reasonLines.push(`AI时代下，可让AI辅助${hasDataSkills ? "代码生成、数据清洗、初步分析和结果整理" : "结构化信息处理、文本整理和方案草拟"}，本人则重点强化${curriculum && /经济/.test(String(curriculum.major || "")) ? "经济问题定义、因果识别、数据质量判断和结果解释" : "领域问题定义、数据质量判断、结果核验和沟通决策"}，形成“专业判断+AI协作”能力。`);
  }

  const meaningfulPair = evidence.observedPairs
    .filter((pair) => confirmedSet.has(pair.skillA) && confirmedSet.has(pair.skillB))
    .find(isMeaningfulPair);
  if (meaningfulPair) {
    reasonLines.push(pairSentence(meaningfulPair));
  } else if (confirmedSkills.length > 1) {
    reasonLines.push("目前没有足够直接组合证据支持判断这些技能的工资互补，更适合分别评价核心技能。");
  }

  const preferredCities = evidence.cities.filter((city) => city.preferred).slice(0, 3);
  if (preferredCities.length) {
    reasonLines.push(`地域上可优先比较${preferredCities.map((city) => city.city).join("、")}，这些城市与当前技能和已表达偏好更匹配。`);
  }

  const usefulNextSkills = evidence.nextSkills
    .filter((item) => item.cooccurrence !== null && Math.abs(item.cooccurrence) >= 0.01 && confirmedSet.has(item.relatedTo))
    .slice(0, 2);
  const primaryOccupation = occupations[0]?.item.name || "目标岗位";
  const secondaryOccupation = occupations[1]?.item.name;
  const actions = [
    `将${primaryOccupation}作为主方向${secondaryOccupation ? `，将${secondaryOccupation}作为备选` : ""}，简历、课程项目和实习经历优先围绕主方向组织。`,
    usefulNextSkills.length
      ? usefulNextSkills.length === 1
        ? `优先验证${usefulNextSkills[0].skill}：它与现有的${usefulNextSkills[0].relatedTo}存在直接共现证据。`
        : `优先验证${usefulNextSkills.map((item) => item.skill).join("或")}：它们分别与现有的${usefulNextSkills.map((item) => item.relatedTo).join("、")}存在直接共现证据。`
      : "当前没有可靠的下一技能证据，可进一步向系统指定目标职业或城市，再缩小技能缺口范围。",
    `完成一个面向${primaryOccupation}的课程项目或作品集，明确展示${confirmedSkills.slice(0, 2).join("和") || "核心能力"}的应用过程，以及AI辅助与人工核验各自负责的环节。`
  ];

  return [
    "**建议**",
    decision,
    "**为什么**",
    ...reasonLines,
    "**下一步**",
    ...actions.map((action, index) => `${index + 1}. ${action}`)
  ].join("\n\n");
}
