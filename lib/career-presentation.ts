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
  return {
    sources: ["skills", "occupation_skill_stats", "city_skill_forecasts"],
    skills: evidence.recognizedSkills.slice(0, 5),
    occupations: evidence.occupations.slice(0, 3).map((item) => item.name),
    cities: evidence.cities.slice(0, 3).map((item) => item.city),
    nextSkills: evidence.nextSkills.slice(0, 3).map((item) => item.skill),
    observedPairCount: evidence.observedPairCount
  };
}

export function formatFallbackCareerAnswer(evidence: CareerEvidence): string {
  const occupations = evidence.occupations.slice(0, 3).map((item) => item.name);
  const cities = evidence.cities.slice(0, 3).map((item) => item.city);
  const nextSkills = evidence.nextSkills.slice(0, 3).map((item) => item.skill);
  const trending = evidence.profiles
    .filter((profile) => {
      const forecast = profile.forecast;
      return typeof forecast === "object" && forecast !== null && (forecast as Record<string, unknown>).trend === "上升";
    })
    .map((profile) => typeof profile.displayName === "string" ? profile.displayName : "")
    .filter(Boolean)
    .slice(0, 3);
  const opening = `你的技能组合已匹配到 ${evidence.recognizedSkills.join("、")} 的招聘证据。`;
  const career = occupations.length ? `职业方向上，优先关注${occupations.join("、")}；这些方向与现有技能的匹配度更高。` : "当前证据不足以给出明确职业排序，建议补充更具体的技能或目标岗位。";
  const city = cities.length ? `求职地点可优先关注${cities.join("、")}，它们在目标年份的相关技能需求更集中。` : "城市证据暂未形成明确排序。";
  const trend = trending.length ? `${trending.join("、")}呈上升趋势，可作为你接下来重点保持或强化的能力。` : "建议优先选择与现有技能直接共现的能力进行补强。";
  const learning = nextSkills.length ? `下一步可考虑学习${nextSkills.join("、")}，以扩大可匹配岗位范围。` : "先围绕现有技能积累项目或岗位经验，会比盲目增加技能更有效。";
  return [opening, career, city, trend, learning].join("\n\n");
}
