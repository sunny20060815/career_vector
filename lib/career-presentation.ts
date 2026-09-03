import type { CareerEvidence } from "@/lib/evidence";
import type { UserAudience } from "@/types/career";

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
  if (evidence.pairCities?.length) sources.push("pair_city_stats");
  if (evidence.curriculum) sources.push("major_programs", "major_skills");
  if (evidence.majorDestinations?.length) sources.push("major_destination_priors");
  if (evidence.occupationDetails?.length) sources.push("occupation_catalog");
  if (evidence.aiExposureDetails.length) sources.push("skill_ai_exposure");
  if (evidence.aiCooccurrenceSource === "supabase") sources.push("ai_skill_cooccurrence");
  if (evidence.aiCooccurrenceSource === "local_csv") sources.push("ai_skill_cooccurrence（本地索引兜底）");
  return {
    sources: Array.from(new Set(sources)),
    skills: evidence.recognizedSkills.slice(0, 5),
    occupations: Array.from(new Set([...evidence.occupations.slice(0, 3).map((item) => item.name), ...(evidence.targetOccupationSkills ?? []).map((item) => item.occupationName)])).slice(0, 3),
    cities: evidence.cities.slice(0, 3).map((item) => item.city),
    nextSkills: evidence.nextSkills.slice(0, 3).map((item) => item.skill),
    observedPairCount: evidence.observedPairCount
  };
}

export function buildSuggestedQuestions(evidence: CareerEvidence): string[] {
  if (evidence.queryPlan?.answerStyle === "curriculum_design") {
    if (!evidence.curriculum) {
      return [
        "请诊断首经贸2025级经济学（实验班）培养方案。",
        "教师端目前支持哪些学校和年级的培养方案？"
      ];
    }
    const major = String(evidence.curriculum?.major || "本专业");
    return [
      `${major}哪些课程可以整合为跨课程实践模块？`,
      `面向主要匹配职业，${major}最需要补齐哪些技能？`,
      `${major}应如何把AI协作能力嵌入现有课程？`
    ];
  }
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

export function formatNoDataCareerAnswer(question: string, audience: UserAudience = "individual"): string {
  if (audience === "curriculum_designer") {
    return "要进行培养方案供需诊断，请先提供学校、年级和专业，例如“请诊断首经贸2025级经济学（实验班）培养方案”。系统识别方案后，会对照培养目标、课程能力供给、匹配职业、高频技能、AI影响和未来需求提出修订建议。当前已接入首都经济贸易大学2023—2025级培养方案。";
  }
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

function majorDestinationSentence(evidence: CareerEvidence): string {
  const rows = evidence.majorDestinations ?? [];
  if (!rows.length) return "";
  const names = Array.from(new Set(rows.filter((row) => row.destinationTier !== "通用去向").map((row) => row.destinationName))).slice(0, 5);
  const classLevel = rows.some((row) => row.dataScope !== "专业");
  return names.length
    ? `毕业去向资料显示，该专业${classLevel ? "或所属专业类" : ""}较常见的方向包括${names.join("、")}；本次职业排序先以这些专业相关方向为边界，再用个人确认技能区分具体路径。`
    : "本次职业排序已使用专业就业去向作为先验约束，避免通用或工具技能脱离专业背景主导推荐。";
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
    evidence.curriculum ? majorDestinationSentence(evidence) : "",
    "**数据依据**",
    ...profiles.slice(0, 2).map((profile) => `- ${profileSentence(profile, evidence.forecastYear)}`),
    "**怎么组合投入**",
    unsupported.length
      ? `${unsupported[0]}可以作为专业分析或方法基础，${leadingName}则更适合转化为招聘中可识别、可展示的工具能力。实际学习中不必二选一，但求职作品应优先让${leadingName}形成可验证成果。`
      : `先围绕需求信号更强的${leadingName}形成一个完整项目，再把另一项技能用于增强问题定义、分析方法或应用场景。`
  ].filter(Boolean).join("\n\n");
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
  const occupation = evidence.targetOccupationSkills?.[0]?.occupationName || evidence.occupations[0]?.name || "目标职业";
  const occupationSkills = (evidence.targetOccupationSkills ?? []).filter((item) => item.occupationName === occupation).slice(0, 10);
  const confirmed = new Set(evidence.confirmedSkills ?? []);
  const professionalSkills = occupationSkills.filter((item) => !/沟通|团队|责任|学习|抗压|协调|表达|英语/.test(item.skill)).slice(0, 6);
  const commonSkills = occupationSkills.filter((item) => !professionalSkills.includes(item)).slice(0, 3);
  const missingSkills = professionalSkills.filter((item) => !confirmed.has(item.skill)).slice(0, 4);
  const nextSkill = evidence.nextSkills.find((item) => item.cooccurrence !== null && Math.abs(item.cooccurrence) >= 0.01)?.skill;
  const shareText = professionalSkills.slice(0, 4).map((item) => item.forecastDemandShare !== null
    ? `${item.skill}（约${(item.forecastDemandShare * 100).toFixed(1)}%）`
    : item.skill).join("、");
  return [
    "**课程学习建议**",
    `建议围绕${occupation}建立“专业理论—定量工具—岗位应用”的学习主线。培养方案提供的是能力基础，真正影响求职的是能否把课程方法转化为目标职业可识别的项目成果。`,
    majorDestinationSentence(evidence),
    "**目标职业需要什么**",
    occupationSkills.length
      ? `${evidence.forecastYear}年预测中，该方向较常出现的专业技能包括${shareText}${commonSkills.length ? `，同时也重视${commonSkills.map((item) => item.skill).join("、")}等通用能力` : ""}。括号内为技能在该职业岗位中的预测需求占比，不是个人求职成功率。`
      : "当前未取得该职业的细分技能排序，以下先依据培养方案安排学习主线，不虚构具体岗位技能。",
    "**学习顺序**",
    `1. 先吃透${theory.slice(0, 3).join("、") || "专业基础课程"}，训练问题定义、理论解释和专业判断，使技术工作能够落到真实业务问题上。`,
    `2. 再强化${quantitative.join("、") || "定量与工具课程"}，把公式和方法转化为可复现的数据清洗、分析与验证过程。`,
    `3. 最后完成一个面向${occupation}的综合项目，呈现“问题提出—数据处理—方法选择—结果核验—业务解释”的完整链条。`,
    "**课程外补充**",
    missingSkills.length
      ? `对照目标职业技能画像，建议优先验证${missingSkills.map((item) => item.skill).join("、")}。其中先选1-2项与课程项目结合，不要把技能名单平均用力。${nextSkill && !missingSkills.some((item) => item.skill === nextSkill) ? `${nextSkill}与现有能力另有直接共现证据，可作为备选。` : ""}`
      : nextSkill ? `${nextSkill}与现有能力存在直接共现证据，可作为优先验证的补充技能。` : "现有证据不足以确定唯一的下一技能，应先把已有课程能力转化为可验证成果。",
    "**AI辅助方式**",
    `可以使用AI辅助资料梳理、代码解释、调试和初步结果检查；问题设定、数据质量判断、方法选择、结果解释与最终责任仍应由你完成。作品集中应明确展示AI做了什么、你如何核验，以及错误输出是怎样被发现和修正的。`
  ].filter(Boolean).join("\n\n");
}

function formatSkillGrowthFallback(evidence: CareerEvidence): string {
  const confirmedSkills = evidence.confirmedSkills ?? evidence.recognizedSkills;
  const candidate = evidence.nextSkills[0];
  if (!candidate) {
    return [
      "**结论**",
      "现有关系数据尚不足以可靠地指定唯一下一技能，因此不应为了给出答案而随意推荐。",
      evidence.curriculum ? majorDestinationSentence(evidence) : "",
      "**当前可确定的方向**",
      `你现有的${confirmedSkills.join("和") || "技能"}更适合先围绕${evidence.occupations.slice(0, 2).map((item) => item.name).join("、") || "目标职业"}形成可验证项目；系统会在获得有效候选技能证据后再比较其职业、工资和城市影响。`
    ].filter(Boolean).join("\n\n");
  }

  const alternatives = evidence.nextSkills.slice(1, 3).map((item) => item.skill);
  const currentCities = new Set(evidence.cities.map((item) => item.city));
  const occupationsAfter = candidate.occupationsAfter ?? [];
  const citiesAfter = candidate.citiesAfter ?? [];
  const addedCities = citiesAfter.filter((city) => !currentCities.has(city));
  const marketFacts = [
    candidate.demandPer10k2025 != null ? `2025年需求强度约${candidate.demandPer10k2025.toFixed(1)}个/万岗位` : "",
    candidate.forecastTrend ? `${evidence.forecastYear}年预测趋势为${candidate.forecastTrend}` : ""
  ].filter(Boolean).join("，");
  const salaryText = candidate.salaryMedian2025 != null
    ? `${candidate.skill}对应岗位当前月薪中位数约${Math.round(candidate.salaryMedian2025)}元。这是技能相关岗位的市场参照，不代表掌握该技能后个人工资会等额提高；现有数据也未估计它加入原组合后的额外工资变化。`
    : "目前没有足够数据估计新增技能对应的工资水平，更不能推断个人加薪幅度。";
  const cityText = citiesAfter.length
    ? `加入该技能后，综合匹配靠前的城市为${citiesAfter.join("、")}${addedCities.length ? `；相较当前技能排序，新进入前列的城市包括${addedCities.join("、")}` : "，城市名单总体没有发生明显变化"}。`
    : "目前没有足够的城市数据判断新增技能会怎样改变地域选择。";

  const confirmed = new Set(confirmedSkills);
  const observedPair = evidence.observedPairs.filter((pair) => confirmed.has(pair.skillA) && confirmed.has(pair.skillB)).find(isMeaningfulPair);
  const pairDemand = observedPair && observedPair.demandRate2025 !== null && observedPair.demandRate2028 !== null
    ? `组合需求率预计由2025年的${(observedPair.demandRate2025 * 100).toFixed(3)}%升至${evidence.forecastYear}年的${(observedPair.demandRate2028 * 100).toFixed(3)}%${observedPair.demandGrowthPct !== null ? `，增幅约${observedPair.demandGrowthPct.toFixed(1)}%` : ""}`
    : "";
  const pairCities = (evidence.pairCities ?? [])
    .filter((item) => item.pairId === observedPair?.id)
    .sort((left, right) => (right.probability ?? 0) - (left.probability ?? 0))
    .slice(0, 5)
    .map((item) => item.city);
  return [
    observedPair ? "**现有组合判断**" : "**优先建议**",
    evidence.curriculum ? majorDestinationSentence(evidence) : "",
    observedPair ? `${pairSentence(observedPair)}${pairDemand ? `${pairDemand}。` : ""}` : "",
    observedPair && pairCities.length ? `该组合历史岗位覆盖靠前的城市为${pairCities.join("、")}；这是组合岗位的空间分布依据，不等同于未来增长排名。` : "",
    "**下一技能建议**",
    `下一步优先补充${candidate.skill}。它与现有的${candidate.relatedTo}存在技能关系记录，${marketFacts || "并具有可用的市场需求证据"}。${alternatives.length ? `可比较的备选是${alternatives.join("和")}，但当前综合证据弱于${candidate.skill}。` : ""}`,
    "**它会改变什么**",
    `- **职业：** ${occupationsAfter.length ? `加入${candidate.skill}后，综合匹配靠前的方向为${occupationsAfter.join("、")}，说明它主要用于强化这些职业方向的技能覆盖。` : "目前没有足够职业关系数据测算排序变化。"}`,
    `- **工资：** ${salaryText}`,
    `- **城市：** ${cityText}`,
    "**怎么补才有用**",
    `用${confirmedSkills.slice(0, 2).join("、") || "现有技能"}与${candidate.skill}完成一个完整项目，至少呈现数据或任务处理、方法选择、结果验证和业务解释四个环节，使新增技能成为可核验的求职证据。`
  ].filter(Boolean).join("\n\n");
}

function formatCurriculumDesignFallback(evidence: CareerEvidence): string {
  const curriculum = evidence.curriculum as Record<string, unknown> | null | undefined;
  if (!curriculum) return formatNoDataCareerAnswer("", "curriculum_designer");
  const major = String(curriculum.major || "该专业");
  const cohort = String(curriculum.cohort || "当前年级");
  const courses = String(curriculum.core_courses || "").split(/[、，,；;\n]/).map((item) => item.trim()).filter(Boolean);
  const supplied = new Set(evidence.inferredSkills ?? evidence.recognizedSkills);
  const target = evidence.occupations.slice(0, 2).map((item) => item.name);
  const destinationNames = Array.from(new Set((evidence.majorDestinations ?? [])
    .filter((item) => item.destinationTier !== "通用去向")
    .map((item) => item.destinationName))).slice(0, 6);
  const targetRows = evidence.targetOccupationSkills ?? [];
  const targetSkills = Array.from(new Set(targetRows.map((item) => item.skill))).slice(0, 10);
  const covered = targetSkills.filter((skill) => supplied.has(skill));
  const gaps = targetSkills.filter((skill) => !supplied.has(skill)).slice(0, 5);
  const rising = evidence.profiles.filter((profile) => {
    const forecast = typeof profile.forecast === "object" && profile.forecast ? profile.forecast as Record<string, unknown> : {};
    return typeof forecast.trend === "string" && /上升|增长/.test(forecast.trend);
  }).map(profileName).slice(0, 4);
  const versions = [...(evidence.curriculumVersions ?? [])].sort((left, right) => String(left.cohort || "").localeCompare(String(right.cohort || ""), "zh-CN"));
  let versionLine = "当前仅检索到一个年级版本，暂不对历年变化作推断。";
  if (versions.length > 1) {
    const first = versions[0];
    const latest = versions[versions.length - 1];
    const skillNames = (version: Record<string, unknown>) => new Set((Array.isArray(version.skillEvidence) ? version.skillEvidence : []).map((row) => String((row as Record<string, unknown>).canonical_name || "")).filter(Boolean));
    const firstSkills = skillNames(first);
    const latestSkills = skillNames(latest);
    const additions = Array.from(latestSkills).filter((skill) => !firstSkills.has(skill)).slice(0, 5);
    versionLine = `已对照${versions.map((version) => String(version.cohort || "")).join("、")}级方案。${additions.length ? `相较最早版本，最新版本的代表性能力中新增或更突出${additions.join("、")}；这一变化仍需结合课程学分和教学内容复核。` : "各年级代表性技能供给总体延续，暂未识别出足以支持结构性变化判断的新增能力。"}`;
  }
  return [
    "**诊断结论**",
    `${cohort}级${major}已形成以${courses.slice(0, 6).join("、") || "专业基础与方法课程"}为代表的课程主线。课程文本可映射出${Array.from(supplied).slice(0, 8).join("、") || "若干专业能力"}等潜在技能供给，但这反映培养覆盖，不等同于学生实际掌握。`,
    destinationNames.length ? `专业就业去向资料显示，相关毕业或从业方向包括${destinationNames.join("、")}。课程调整应优先服务这些专业主路径，再评估数字工具对专业工作的增强作用。` : "当前未取得可用的专业就业去向资料，职业对应仅作为待复核的招聘市场信号。",
    "**岗位需求对应**",
    target.length ? `当前课程供给较适合对接${target.join("、")}。${targetSkills.length ? `这些方向较常见的技能包括${targetSkills.join("、")}。` : "当前尚未取得职业内部技能排序。"}` : "现有证据尚不足以确定主要对接职业，应先明确专业培养定位后再缩小比较范围。",
    covered.length ? `其中课程能力映射已覆盖${covered.join("、")}。` : "在当前代表性技能口径下，课程供给与目标职业高频技能尚未形成明确交集。",
    gaps.length ? `较值得进一步核查的能力缺口是${gaps.join("、")}；“缺口”表示未被培养方案文本稳定识别，并不等于课程实际没有教学。` : "未识别出明确的高频技能缺口，下一步应重点检查教学深度和成果评价。",
    rising.length ? `${rising.join("、")}在${evidence.forecastYear}年预测中呈上升趋势，可作为课程实践内容调整的市场信号。` : "现有预测证据未形成需要单独强调的上升技能清单。",
    "**历年方案变化**",
    versionLine,
    "**修订建议**",
    `1. 保留能够支撑学科基础和长期迁移能力的核心理论课程，避免仅依据短期招聘热度删减基础训练。`,
    `2. ${gaps.length ? `围绕${gaps.slice(0, 3).join("、")}优先核查现有课程覆盖；能由既有课程承接的，采用模块整合和案例更新，而非简单增设课程。` : "将修订重点由增加课程数量转向课程衔接、项目深度和学习成果评价。"}`,
    `3. 建立跨课程实践项目，让学生完成“专业问题定义—数据或任务处理—结果核验—业务解释”，并将作品质量纳入能力达成评价。`,
    "4. 将AI工具嵌入资料检索、代码辅助和初步分析，同时强化数据质量判断、方法选择、结果解释、伦理与责任边界。",
    "**证据边界**",
    "本诊断使用的招聘样本主要来自上市公司及集团公司，适合提供岗位需求与技能变化信号，但不能单独决定培养方案；最终修订还应结合专业定位、师资条件、课程学分和学生长期发展目标审议。"
  ].filter(Boolean).join("\n\n");
}

export function formatFallbackCareerAnswer(evidence: CareerEvidence, question = ""): string {
  if (evidence.queryPlan?.answerStyle === "curriculum_design") return formatCurriculumDesignFallback(evidence);
  if (evidence.queryPlan?.answerStyle === "ai_tasks") return formatAiTaskFallback(evidence);
  if (evidence.queryPlan?.answerStyle === "comparison") return formatComparisonFallback(evidence, question);
  if (evidence.queryPlan?.answerStyle === "skill_growth") return formatSkillGrowthFallback(evidence);
  const curriculum = evidence.curriculum as Record<string, unknown> | null | undefined;
  if (curriculum && /课程|学习建议|学习规划/.test(question)) return formatCurriculumLearningAnswer(evidence, curriculum);
  if (evidence.targetOccupationSkills?.length) return formatTargetOccupationFallback(evidence);
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
    const destinationSummary = majorDestinationSentence(evidence);
    if (destinationSummary) reasonLines.push(destinationSummary);
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
  const relevantCities = preferredCities.length ? preferredCities : evidence.cities.slice(0, 3);
  if (relevantCities.length) {
    reasonLines.push(preferredCities.length
      ? `地域上可优先比较${relevantCities.map((city) => city.city).join("、")}，这些城市与当前技能和已表达偏好更匹配。`
      : `按当前技能需求匹配，${relevantCities.map((city) => city.city).join("、")}可作为优先比较的城市；城市排序反映岗位与技能需求，不替代对生活成本和个人偏好的判断。`);
  }

  const usefulNextSkills = evidence.nextSkills
    .filter((item) => item.cooccurrence !== null && Math.abs(item.cooccurrence) >= 0.01 && confirmedSet.has(item.relatedTo))
    .slice(0, 2);
  const primaryOccupation = occupations[0]?.item.name || "目标岗位";
  const secondaryOccupation = occupations[1]?.item.name;
  const targetGaps = (evidence.targetOccupationSkills ?? [])
    .filter((item) => item.occupationName === primaryOccupation && !item.userHasSkill)
    .filter((item) => !/沟通|团队|责任|学习|抗压|协调|表达/.test(item.skill))
    .slice(0, 3);
  const actions = [
    `将${primaryOccupation}作为主方向${secondaryOccupation ? `，将${secondaryOccupation}作为备选` : ""}，简历、课程项目和实习经历优先围绕主方向组织。`,
    usefulNextSkills.length
      ? usefulNextSkills.length === 1
        ? `优先验证${usefulNextSkills[0].skill}：它与现有的${usefulNextSkills[0].relatedTo}存在直接共现证据。`
        : `优先验证${usefulNextSkills.map((item) => item.skill).join("或")}：它们分别与现有的${usefulNextSkills.map((item) => item.relatedTo).join("、")}存在直接共现证据。`
      : targetGaps.length
        ? `围绕${primaryOccupation}，可优先验证${targetGaps.map((item) => item.skill).join("、")}；这些技能在该职业的招聘要求中更常见，应先选择一项与课程项目结合。`
        : "当前没有足够证据确定唯一的下一技能，可先围绕主方向强化已有专业能力并形成可验证成果。",
    `完成一个面向${primaryOccupation}的课程项目或作品集，明确展示${confirmedSkills.slice(0, 2).join("和") || "核心能力"}的应用过程，以及AI辅助与人工核验各自负责的环节。`
  ];

  return [
    "**建议**",
    decision,
    "**为什么**",
    ...reasonLines,
    "**下一步**",
    ...actions.map((action, index) => `${index + 1}. ${action}`)
  ].filter(Boolean).join("\n\n");
}

function formatTargetOccupationFallback(evidence: CareerEvidence): string {
  const target = evidence.targetOccupationSkills?.[0]?.occupationName ?? "目标职业";
  const skills = (evidence.targetOccupationSkills ?? []).filter((item) => item.occupationName === target).slice(0, 10);
  const held = skills.filter((item) => item.userHasSkill).map((item) => item.skill);
  const missing = skills.filter((item) => !item.userHasSkill);
  const technical = missing.filter((item) => !/沟通|团队|责任|学习|抗压|协调|表达|英语/.test(item.skill)).slice(0, 4);
  const priorities = technical.length ? technical : missing.slice(0, 4);
  return [
    `**${target}的技能画像**`,
    evidence.curriculum ? majorDestinationSentence(evidence) : "",
    `${evidence.forecastYear}年预测中，这一职业方向较常要求的技能包括${skills.map((item) => item.skill).join("、")}。这些占比反映岗位要求中的常用程度，不是个人进入该职业的概率。`,
    held.length ? `你已经覆盖了其中的${held.join("、")}。` : "目前尚未从你的输入中确认已覆盖上述核心技能。",
    priorities.length ? `下一步可优先补充${priorities.map((item) => item.skill).join("、")}，并用一个面向${target}的项目同时证明工具应用、结果核验和业务解释能力。` : "现有输入已覆盖主要技能，可进一步用项目或实习证明实际应用深度。"
  ].filter(Boolean).join("\n\n");
}
