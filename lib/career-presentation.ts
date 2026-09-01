import type { CareerEvidence } from "@/lib/evidence";

export interface EvidencePreview {
  sources: string[];
  skills: string[];
  occupations: string[];
  cities: string[];
  nextSkills: string[];
  observedPairCount: number;
}

function names(rows: Array<Record<string, unknown>>, key: string): string[] {
  return rows.map((row) => typeof row[key] === "string" ? row[key] : "").filter(Boolean);
}

export function buildEvidencePreview(evidence: CareerEvidence): EvidencePreview {
  const sources = ["skills", "occupation_skill_stats", "city_skill_forecasts"];
  if (evidence.curriculum) sources.push("major_programs", "major_skills");
  if (evidence.occupationDetails?.length) sources.push("occupation_catalog");
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

function fixed(value: number | null, digits = 1): string {
  return value === null ? "暂无" : value.toFixed(digits);
}

function share(value: number | null): string {
  return value === null ? "暂无" : `${(value * 100).toFixed(1)}%`;
}

export function formatFallbackCareerAnswer(evidence: CareerEvidence): string {
  const curriculum = evidence.curriculum as Record<string, unknown> | null | undefined;
  const skillLines = evidence.profiles.slice(0, 6).map((profile) => {
    const forecast = typeof profile.forecast === "object" && profile.forecast !== null ? profile.forecast as Record<string, unknown> : {};
    const name = String(profile.displayName || profile.skill || "相关技能");
    return `- ${name}：2025年需求率${share(numberValue(profile, "demandRate2025"))}、需求强度${fixed(numberValue(profile, "demandPer10k2025"))}个/万岗位，月薪中位数${fixed(numberValue(profile, "salaryMedian2025"), 0)}元，最低经验${fixed(numberValue(profile, "experienceMean2025"))}年，本科及以上占比${share(numberValue(profile, "bachelorOrAboveShare2025"))}；${evidence.forecastYear}年预测需求率${share(numberValue(forecast, "demandRatio"))}、需求强度${fixed(numberValue(forecast, "demandPer10k"))}个/万岗位、月薪${fixed(numberValue(forecast, "salaryMedian"), 0)}元，趋势为${String(forecast.trend || "暂无判断")}；关联职业AI暴露度${fixed(numberValue(profile, "aiExposure"))}，与AI技能的共现强度${fixed(numberValue(profile, "aiCooccurrence"), 3)}。`;
  });
  const occupationLines = evidence.occupations.slice(0, 5).map((item, index) => `${index + 1}. ${item.name}（匹配技能：${item.matchedSkills.join("、") || "暂无"}）`);
  const detailLines = (evidence.occupationDetails ?? []).slice(0, 5).map((item) => `${item.subclassName}包含${item.occupations.slice(0, 5).map((occupation) => occupation.name).join("、")}`);
  const pairLines = evidence.observedPairs.length
    ? evidence.observedPairs.slice(0, 6).map((pair) => `- ${pair.skillA}+${pair.skillB}：共现强度${fixed(pair.cooccurrence, 3)}，工资互补效应${pair.wageComplementPct === null ? "暂无" : `${pair.wageComplementPct.toFixed(1)}%`}，2025至2028年组合需求增长${pair.demandGrowthPct === null ? "暂无" : `${pair.demandGrowthPct.toFixed(1)}%`}。`)
    : ["- 当前没有直接观测到完整技能组合，因此不推断组合工资互补效应。"];
  const cityLines = evidence.cities.slice(0, 5).map((item, index) => `${index + 1}. ${item.city}（匹配技能：${item.matchedSkills.join("、")}）`);
  const nextLines = evidence.nextSkills.slice(0, 5).map((item) => `- ${item.skill}：与现有的${item.relatedTo}联系较紧密，共现强度${fixed(item.cooccurrence, 3)}。`);
  const curriculumSection = curriculum ? [
    "**培养方案基础**",
    `${String(curriculum.school || "")}${String(curriculum.cohort || "")}${String(curriculum.major || "")}；培养目标：${String(curriculum.training_objectives || "暂无")}；核心课程：${String(curriculum.core_courses || "暂无")}。`,
    `专业基础路径：培养方案推断能力包括${(evidence.inferredSkills ?? []).join("、") || "暂无"}，这些是课程和培养要求覆盖的能力，不等于你已经掌握。`,
    `个人增强路径：你明确输入的技能为${(evidence.confirmedSkills ?? []).join("、") || "暂无"}；系统已将其与专业基础能力合并后重新计算职业、城市和下一技能建议。`
  ] : [];
  return [
    `建议优先围绕${evidence.occupations.slice(0, 3).map((item) => item.name).join("、") || "现有技能相关岗位"}规划求职，并重点补齐能形成直接组合证据的技能。`,
    ...curriculumSection,
    "**技能市场画像**",
    ...skillLines,
    "与AI技能的共现强度表示该技能与AI技能在同一岗位要求中共同出现的紧密程度，反映联系而非因果。",
    "**职业匹配**",
    ...(occupationLines.length ? occupationLines : ["当前职业证据不足。"]),
    ...(detailLines.length ? detailLines : []),
    "**已观测技能组合**",
    ...pairLines,
    `**${evidence.forecastYear}年城市建议**`,
    evidence.cities.length ? `可优先关注${evidence.cities.slice(0, 5).map((item) => item.city).join("、")}。` : "当前城市证据不足。",
    ...(cityLines.length ? cityLines : ["当前城市证据不足。"]),
    "**下一项技能与行动**",
    ...(nextLines.length ? nextLines : ["先围绕现有技能完成一个可展示项目并积累岗位经验。"]),
    "接下来可先选定一个目标职业，补充一项推荐技能，并用课程项目、实习或作品集形成可验证证据。"
  ].join("\n\n");
}
