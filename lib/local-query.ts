import type { ParsedCareerQuery, QueryIntent } from "@/types/career";

export interface LocalSkillCatalogEntry {
  canonicalName: string;
  aliases: readonly string[];
}

const KNOWN_CITIES = [
  "北京", "上海", "广州", "深圳", "杭州", "南京", "苏州", "成都", "武汉", "西安", "重庆", "天津",
  "长沙", "郑州", "厦门", "青岛", "宁波", "佛山", "东莞", "合肥", "济南", "大连", "沈阳", "昆明"
];

function normalise(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN").replace(/[\s_\-—－/\\（）()、，,；;。！？!?]/g, "");
}

function parseMoney(value: string, unit: string | undefined): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  if (unit === "万") return Math.round(amount * 10000);
  if (unit?.toLowerCase() === "k") return Math.round(amount * 1000);
  if (unit === "千") return Math.round(amount * 1000);
  return Math.round(amount);
}

function extractSalary(question: string): number | null {
  const match = question.match(/(?:月薪|薪资|工资|薪酬|收入|待遇)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|[kK]|千|元)?/);
  if (!match) return null;
  const amount = parseMoney(match[1], match[2]);
  return amount > 0 ? amount : null;
}

function extractIntent(question: string): QueryIntent {
  if (/适合|岗位|职业|工作|转行|想去|去哪/.test(question)) return "career_recommendation";
  if (/下一步|补什么|学习|提升/.test(question)) return "skill_growth";
  if (/城市|哪里|哪座/.test(question)) return "city_recommendation";
  if (/对比|比较/.test(question)) return "job_comparison";
  return "skill_trend";
}

export function parseCareerQuestionLocally(
  question: string,
  catalog: readonly LocalSkillCatalogEntry[]
): ParsedCareerQuery {
  const normalisedQuestion = normalise(question);
  const skills = catalog
    .map((entry) => ({
      canonicalName: entry.canonicalName,
      longestMatchedAlias: Math.max(
        0,
        ...[entry.canonicalName, ...entry.aliases].map((alias) => {
          const token = normalise(alias);
          return token.length > 1 && normalisedQuestion.includes(token) ? token.length : 0;
        })
      )
    }))
    .filter((entry) => entry.longestMatchedAlias > 0)
    .sort((left, right) => normalisedQuestion.indexOf(normalise(left.canonicalName)) - normalisedQuestion.indexOf(normalise(right.canonicalName)))
    .map((entry) => entry.canonicalName)
    .slice(0, 12);
  const cities = KNOWN_CITIES.filter((city) => question.includes(city));
  const salary = extractSalary(question);
  const forecastYear = ([2028, 2027, 2026] as const).find((year) => question.includes(String(year))) ?? 2028;
  const experienceMatch = question.match(/(\d+(?:\.\d+)?)\s*年(?:工作)?经验/);
  const education = /博士/.test(question) ? "doctor" : /硕士|研究生/.test(question) ? "master" : /本科/.test(question) ? "bachelor" : /大专/.test(question) ? "associate" : /中专|高中/.test(question) ? "secondary" : null;

  return {
    skills,
    occupationKeywords: [],
    cities,
    salaryMinYuan: salary,
    salaryMaxYuan: salary,
    experienceYears: experienceMatch ? Number(experienceMatch[1]) : null,
    education,
    forecastYear,
    intent: extractIntent(question)
  };
}
