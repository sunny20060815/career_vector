import {
  FORECAST_YEARS,
  type EducationLevel,
  type ForecastYear,
  type ParsedCareerQuery,
  type QueryIntent
} from "@/types/career";

const EDUCATION_LEVELS: readonly EducationLevel[] = [
  "secondary",
  "associate",
  "bachelor",
  "master",
  "doctor"
];

const QUERY_INTENTS: readonly QueryIntent[] = [
  "career_recommendation",
  "skill_trend",
  "city_recommendation",
  "job_comparison",
  "skill_growth"
];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} 必须是字符串数组`);
  }

  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} 必须是非负数或 null`);
  }

  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normaliseSkillToken(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s_\-—－/\\（）()]+/g, "");
}

export function mergeCareerQueryContext(current: ParsedCareerQuery, previous?: ParsedCareerQuery | null): ParsedCareerQuery {
  if (!previous) return current;
  return {
    ...current,
    skills: Array.from(new Set([...previous.skills, ...current.skills])).slice(0, 12),
    confirmedSkills: Array.from(new Set([...(previous.confirmedSkills ?? previous.skills), ...(current.confirmedSkills ?? [])])).slice(0, 12),
    occupationKeywords: Array.from(new Set([...previous.occupationKeywords, ...current.occupationKeywords])).slice(0, 12),
    occupationCandidates: current.occupationCandidates?.length ? current.occupationCandidates : previous.occupationCandidates,
    cities: current.cities.length ? current.cities : previous.cities,
    salaryMinYuan: current.salaryMinYuan ?? previous.salaryMinYuan,
    salaryMaxYuan: current.salaryMaxYuan ?? previous.salaryMaxYuan,
    experienceYears: current.experienceYears ?? previous.experienceYears,
    education: current.education ?? previous.education,
    programKey: current.programKey ?? previous.programKey,
    school: current.school ?? previous.school,
    cohort: current.cohort ?? previous.cohort,
    major: current.major ?? previous.major
  };
}

export function validateParsedCareerQuery(value: unknown): ParsedCareerQuery {
  if (!isRecord(value)) {
    throw new Error("模型返回的查询对象不是 JSON 对象");
  }

  const forecastYear = value.forecastYear ?? 2028;
  if (!FORECAST_YEARS.includes(forecastYear as ForecastYear)) {
    throw new Error("预测年份仅支持 2026、2027 或 2028");
  }

  const intent = value.intent;
  if (typeof intent !== "string" || !QUERY_INTENTS.includes(intent as QueryIntent)) {
    throw new Error("意图类型不受支持");
  }

  const education = value.education ?? null;
  if (education !== null && (typeof education !== "string" || !EDUCATION_LEVELS.includes(education as EducationLevel))) {
    throw new Error("学历类型不受支持");
  }

  const salaryMinYuan = nullableNumber(value.salaryMinYuan, "最低期望薪资");
  const salaryMaxYuan = nullableNumber(value.salaryMaxYuan, "最高期望薪资");
  if (salaryMinYuan !== null && salaryMaxYuan !== null && salaryMinYuan > salaryMaxYuan) {
    throw new Error("最低期望薪资不能高于最高期望薪资");
  }

  return {
    skills: stringArray(value.skills, "技能"),
    confirmedSkills: stringArray(value.confirmedSkills, "用户确认技能"),
    occupationKeywords: stringArray(value.occupationKeywords, "职业关键词"),
    occupationCandidates: stringArray(value.occupationCandidates, "职业候选"),
    cities: stringArray(value.cities, "城市"),
    salaryMinYuan,
    salaryMaxYuan,
    experienceYears: nullableNumber(value.experienceYears, "工作经验"),
    education: education as EducationLevel | null,
    forecastYear: forecastYear as ForecastYear,
    intent: intent as QueryIntent,
    programKey: nullableString(value.programKey),
    school: nullableString(value.school),
    cohort: nullableString(value.cohort),
    major: nullableString(value.major)
  };
}
