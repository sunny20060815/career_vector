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
  const sources = ["skills", "occupation_skill_stats", "city_skill_forecasts", "skill_pairs"];
  if (evidence.observedPairs.length) sources.push("pair_occupation_stats");
  if (evidence.curriculum) sources.push("major_programs", "major_skills");
  if (evidence.occupationDetails?.length) sources.push("occupation_catalog");
  if (evidence.aiExposureDetails.length) sources.push("skill_ai_exposure");
  if (evidence.aiCooccurrenceSource === "supabase") sources.push("ai_skill_cooccurrence");
  if (evidence.aiCooccurrenceSource === "local_csv") sources.push("ai_skill_cooccurrence（本地索引兜底）");
  return {
    sources,
    skills: evidence.recognizedSkills.slice(0, 5),
    occupations: evidence.occupations.slice(0, 3).map((item) => item.name),
    cities: evidence.cities.slice(0, 3).map((item) => item.city),
    nextSkills: evidence.nextSkills.slice(0, 3).map((item) => item.skill),
    observedPairCount: evidence.observedPairCount
  };
}

function numberValue(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

function profileName(profile: Record<string, unknown>): string {
  return String(profile.displayName || profile.skill || "相关技能");
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

export function formatFallbackCareerAnswer(evidence: CareerEvidence): string {
  const curriculum = evidence.curriculum as Record<string, unknown> | null | undefined;
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
  if (curriculum && inferredSkills.length) {
    reasonLines.push(`培养方案可能覆盖${inferredSkills.slice(0, 3).join("、")}等基础，但课程覆盖不能视为你已经掌握，建议通过项目或实习进一步验证。`);
  }
  for (const occupation of occupations.slice(0, 2)) {
    const matches = occupation.confirmedMatches.length ? occupation.confirmedMatches : occupation.item.matchedSkills.slice(0, 2);
    const detail = evidence.occupationDetails?.find((item) => item.subclassCode === occupation.item.code || item.subclassName === occupation.item.name);
    const examples = detail?.occupations.slice(0, 2).map((item) => item.name).join("、");
    reasonLines.push(`${occupation.item.name}与${matches.join("、") || "现有能力基础"}直接匹配${examples ? `，可重点了解${examples}等具体岗位` : ""}。`);
  }
  reasonLines.push(...selectedProfiles.map((profile) => profileSentence(profile, evidence.forecastYear)));

  const aiProfile = selectedProfiles
    .map((profile) => ({ profile, value: numberValue(profile, "aiCooccurrence") }))
    .filter((item): item is { profile: Record<string, unknown>; value: number } => item.value !== null && Math.abs(item.value) >= 0.01)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))[0];
  if (aiProfile) {
    reasonLines.push(`${profileName(aiProfile.profile)}与AI技能的共现强度为${aiProfile.value.toFixed(3)}，表示两者在同一岗位要求中联系较紧密，但不代表因果关系或工资溢价。`);
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
  const actions = [
    `围绕${occupations.map((item) => item.item.name).join("、") || "目标方向"}各收集约20条招聘信息，比较重复出现的职责和技能缺口。`,
    usefulNextSkills.length
      ? usefulNextSkills.length === 1
        ? `优先验证${usefulNextSkills[0].skill}：它与现有的${usefulNextSkills[0].relatedTo}存在直接共现证据。`
        : `优先验证${usefulNextSkills.map((item) => item.skill).join("或")}：它们分别与现有的${usefulNextSkills.map((item) => item.relatedTo).join("、")}存在直接共现证据。`
      : "先确定一个目标职业，再从真实岗位中选择出现频率较高的缺口技能，不依据零值共现结果盲目补课。",
    `用一个课程项目、实习或作品集证明${confirmedSkills.slice(0, 2).join("和") || "核心能力"}能够完成${primaryOccupation}中的实际任务。`
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
