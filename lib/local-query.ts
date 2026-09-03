import type { ParsedCareerQuery, QueryIntent } from "@/types/career";

export interface LocalSkillCatalogEntry {
  canonicalName: string;
  aliases: readonly string[];
}

export interface LocalProgramCatalogEntry {
  programKey: string;
  school: string;
  cohort: string;
  major: string;
  aliases: readonly string[];
}

export interface LocalOccupationCatalogEntry {
  subclassName: string;
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
  if (/下一步.{0,12}(?:补|学|掌握|提升)|补什么技能|学习什么技能|提升什么技能|下一项技能/.test(question)) return "skill_growth";
  if (/对比|比较|相比|区别|哪个|哪一个|哪项|孰优|还是.+更|更值得/.test(question)) return "job_comparison";
  if (/学习|提升/.test(question)) return "skill_growth";
  if (/城市|哪里|哪座/.test(question)) return "city_recommendation";
  if (/适合|岗位|职业|工作|转行|想去|去哪/.test(question)) return "career_recommendation";
  return "skill_trend";
}

function isGenericAiImpactQuestion(question: string): boolean {
  return /(?:AI|人工智能).{0,12}(?:辅助|替代|影响|冲击|暴露|渗透)/i.test(question)
    && !/(?:会|掌握|熟悉|使用过|擅长|具备|学习|学过).{0,10}(?:AI|人工智能)|(?:AI|人工智能)(?:技术|开发|应用|工程|技能)/i.test(question);
}

function extractConfirmedSkills(question: string, matched: Array<{ canonicalName: string; aliases: readonly string[] }>): string[] {
  const segments = Array.from(question.matchAll(/(?:我|本人)?(?:会|掌握|熟悉|使用过|擅长|具备|技能(?:有|包括|是))\s*([^，,。！？；;\n]+)/g), (match) => normalise(match[1]));
  const confirmed = matched.filter((entry) => segments.some((segment) => [entry.canonicalName, ...entry.aliases].some((alias) => {
    const token = normalise(alias);
    return token.length > 1 && segment.includes(token);
  }))).map((entry) => entry.canonicalName);
  if (confirmed.length) return confirmed;
  const isPlainSkillList = question.length <= 80 && !/[？?]|哪个|哪项|值得|趋势|需求|工资|薪资|辅助|替代|影响|适合|应该/.test(question);
  return isPlainSkillList ? matched.map((entry) => entry.canonicalName) : [];
}

export function parseCareerQuestionLocally(
  question: string,
  catalog: readonly LocalSkillCatalogEntry[],
  programs: readonly LocalProgramCatalogEntry[] = [],
  occupations: readonly LocalOccupationCatalogEntry[] = []
): ParsedCareerQuery {
  const normalisedQuestion = normalise(question);
  const genericAiImpactQuestion = isGenericAiImpactQuestion(question);
  const matchedSkills = catalog
    .map((entry) => ({
      canonicalName: entry.canonicalName,
      aliases: entry.aliases,
      matchIndex: Math.min(...[entry.canonicalName, ...entry.aliases].map((alias) => {
        const token = normalise(alias);
        return token.length > 1 ? normalisedQuestion.indexOf(token) : -1;
      }).filter((index) => index >= 0)),
      longestMatchedAlias: Math.max(
        0,
        ...[entry.canonicalName, ...entry.aliases].map((alias) => {
          const token = normalise(alias);
          return token.length > 1 && normalisedQuestion.includes(token) ? token.length : 0;
        })
      )
    }))
    .filter((entry) => entry.longestMatchedAlias > 0 && !(genericAiImpactQuestion && entry.canonicalName === "人工智能技术"))
    .sort((left, right) => left.matchIndex - right.matchIndex);
  const skills = matchedSkills
    .map((entry) => entry.canonicalName)
    .slice(0, 12);
  const confirmedSkills = extractConfirmedSkills(question, matchedSkills).slice(0, 12);
  const cities = KNOWN_CITIES.filter((city) => question.includes(city));
  const salary = extractSalary(question);
  const forecastYear = ([2028, 2027, 2026] as const).find((year) => question.includes(String(year))) ?? 2028;
  const experienceMatch = question.match(/(\d+(?:\.\d+)?)\s*年(?:工作)?经验/);
  const education = /博士/.test(question) ? "doctor" : /硕士|研究生/.test(question) ? "master" : /本科/.test(question) ? "bachelor" : /大专/.test(question) ? "associate" : /中专|高中/.test(question) ? "secondary" : null;
  const cohort = question.match(/(20\d{2})\s*(?:级|届)/)?.[1]
    ?? question.match(/(20\d{2})\s*年(?:入学|招生)/)?.[1]
    ?? null;
  const candidates = programs.filter((program) => !cohort || program.cohort.startsWith(cohort)).map((program) => ({
    program,
    matchLength: Math.max(0, ...[program.major, ...program.aliases].map((alias) => {
      const token = normalise(alias);
      return token.length > 1 && normalisedQuestion.includes(token) ? token.length : 0;
    }))
  })).filter((candidate) => candidate.matchLength > 0).sort((left, right) => right.matchLength - left.matchLength || right.program.cohort.localeCompare(left.program.cohort));
  const matchedProgram = candidates[0]?.program ?? null;
  const hasOccupationContext = /职业|岗位|工作|就业|求职|转行|方向|从事|进入|想做|希望做|准备做/.test(question);
  const occupationKeywords = Array.from(new Set(occupations
    .filter((occupation) => [occupation.subclassName, ...(hasOccupationContext ? occupation.aliases : [])].some((name) => {
      const token = normalise(name);
      return token.length > 2 && normalisedQuestion.includes(token);
    }))
    .sort((left, right) => normalise(right.subclassName).length - normalise(left.subclassName).length)
    .map((occupation) => occupation.subclassName))).slice(0, 3);

  return {
    skills,
    confirmedSkills,
    occupationKeywords,
    cities,
    salaryMinYuan: salary,
    salaryMaxYuan: salary,
    experienceYears: experienceMatch ? Number(experienceMatch[1]) : null,
    education,
    forecastYear,
    intent: occupationKeywords.length ? "career_recommendation" : extractIntent(question),
    programKey: matchedProgram?.programKey ?? null,
    school: matchedProgram?.school ?? (/首经贸|首都经济贸易大学/i.test(question) ? "首都经济贸易大学" : null),
    cohort: matchedProgram?.cohort ?? cohort,
    major: matchedProgram?.major ?? null
  };
}
