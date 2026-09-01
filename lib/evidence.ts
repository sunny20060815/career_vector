import { normaliseSkillToken } from "@/lib/query";
import { parseCareerQuestionLocally, type LocalProgramCatalogEntry, type LocalSkillCatalogEntry } from "@/lib/local-query";
import { rankOccupations, selectObservedPairs, type OccupationSkillStat, type PairOccupationStat, type SkillPair } from "@/lib/ranking";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ParsedCareerQuery } from "@/types/career";

type Row = Record<string, unknown>;

let catalogPromise: Promise<{ skills: LocalSkillCatalogEntry[]; programs: LocalProgramCatalogEntry[] }> | undefined;

export interface CareerEvidence {
  forecastYear: number;
  recognizedSkills: string[];
  unresolvedSkills: string[];
  profiles: Array<Record<string, unknown>>;
  occupations: ReturnType<typeof rankOccupations>;
  cities: Array<{ city: string; score: number; matchedSkills: string[]; preferred: boolean }>;
  nextSkills: Array<{ skill: string; relatedTo: string; cooccurrence: number | null }>;
  observedPairCount: number;
  preferenceNotes: string[];
  confirmedSkills?: string[];
  inferredSkills?: string[];
  curriculum?: Record<string, unknown> | null;
  occupationDetails?: Array<{ subclassCode: string; subclassName: string; occupations: Array<{ name: string; description: string }> }>;
}

function text(row: Row, key: string): string {
  return typeof row[key] === "string" ? row[key] : "";
}

function numeric(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function profileView(row: Row, year: number): Record<string, unknown> {
  const forecast = row[`forecast_${year}`];
  return {
    skill: text(row, "canonical_name"),
    displayName: text(row, "display_name"),
    skillType: text(row, "skill_type"),
    demandPer10k2025: numeric(row, "demand_per_10k_2025"),
    salaryMedian2025: numeric(row, "salary_median_2025"),
    experienceMean2025: numeric(row, "experience_mean_2025"),
    bachelorOrAboveShare2025: numeric(row, "bachelor_or_above_share_2025"),
    graduateShare2025: numeric(row, "graduate_share_2025"),
    aiExposure: numeric(row, "ai_exposure"),
    aiGroup: text(row, "ai_group"),
    aiCooccurrence: numeric(row, "ai_cooccurrence_npmi"),
    forecast: typeof forecast === "object" && forecast !== null ? forecast : {},
    factSummary: text(row, "fact_summary")
  };
}

export async function parseCareerQuestionFromCatalog(question: string): Promise<ParsedCareerQuery> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const admin = createAdminClient();
      const [{ data: skills, error: skillsError }, { data: aliases, error: aliasesError }, { data: programs, error: programsError }] = await Promise.all([
        admin.from("skills").select("canonical_name"),
        admin.from("skill_aliases").select("canonical_name,alias"),
        admin.from("major_programs").select("program_key,school,cohort,major,aliases")
      ]);
      if (skillsError || aliasesError) {
        console.error("Core skill catalog query failed", { skillsError, aliasesError });
        throw new Error("无法加载技能识别词典");
      }
      if (programsError) console.warn("Program catalog is unavailable; continuing with skill-only matching", programsError.message);
      const aliasesBySkill = new Map<string, string[]>();
      for (const row of (aliases ?? []) as Row[]) {
        const canonicalName = text(row, "canonical_name");
        const alias = text(row, "alias");
        if (canonicalName && alias) {
          const current = aliasesBySkill.get(canonicalName) ?? [];
          current.push(alias);
          aliasesBySkill.set(canonicalName, current);
        }
      }
      const skillCatalog = ((skills ?? []) as Row[]).map((row) => {
        const canonicalName = text(row, "canonical_name");
        return { canonicalName, aliases: aliasesBySkill.get(canonicalName) ?? [] };
      }).filter((entry) => Boolean(entry.canonicalName));
      const programCatalog = ((programsError ? [] : programs ?? []) as Row[]).map((row) => ({
        programKey: text(row, "program_key"), school: text(row, "school"), cohort: text(row, "cohort"), major: text(row, "major"),
        aliases: text(row, "aliases").split("|").map((value) => value.trim()).filter(Boolean)
      })).filter((entry) => entry.programKey && entry.major);
      return { skills: skillCatalog, programs: programCatalog };
    })().catch((error: unknown) => {
      catalogPromise = undefined;
      throw error;
    });
  }
  const catalog = await catalogPromise;
  return parseCareerQuestionLocally(question, catalog.skills, catalog.programs);
}

export async function retrieveCareerEvidence(query: ParsedCareerQuery): Promise<CareerEvidence> {
  const admin = createAdminClient();
  const { data: majorSkillRows, error: majorSkillError } = query.programKey
    ? await admin.from("major_skills").select("canonical_name,skill_type,cluster_name,rank,evidence_summary,mapping_basis").eq("program_key", query.programKey).eq("is_representative", true).order("rank").limit(12)
    : { data: [], error: null };
  if (majorSkillError) console.warn("Program skills are unavailable; continuing with confirmed skills", majorSkillError.message);
  const inferredSkills = (((majorSkillError ? [] : majorSkillRows) ?? []) as Row[]).map((row) => text(row, "canonical_name")).filter(Boolean);
  const tokens = query.skills.map(normaliseSkillToken).filter(Boolean);
  const [{ data: aliases, error: aliasError }, { data: directSkills, error: directError }] = await Promise.all([
    tokens.length ? admin.from("skill_aliases").select("canonical_name, normalized_alias").in("normalized_alias", tokens) : Promise.resolve({ data: [], error: null }),
    query.skills.length ? admin.from("skills").select("canonical_name").in("canonical_name", query.skills) : Promise.resolve({ data: [], error: null })
  ]);
  if (aliasError || directError) {
    throw new Error("技能库查询失败");
  }
  const recognizedSkills = Array.from(new Set([
    ...((aliases ?? []) as Row[]).map((row) => text(row, "canonical_name")),
    ...((directSkills ?? []) as Row[]).map((row) => text(row, "canonical_name")),
    ...inferredSkills
  ].filter(Boolean)));
  const confirmedSkills = recognizedSkills.filter((skill) => !inferredSkills.includes(skill) || query.skills.some((item) => normaliseSkillToken(item) === normaliseSkillToken(skill)));
  const unresolvedSkills = query.skills.filter((skill) => !recognizedSkills.some((item) => normaliseSkillToken(item) === normaliseSkillToken(skill)));
  if (!recognizedSkills.length) {
    return { forecastYear: query.forecastYear, recognizedSkills: [], unresolvedSkills, profiles: [], occupations: [], cities: [], nextSkills: [], observedPairCount: 0, preferenceNotes: ["暂无可识别的技能记录"], confirmedSkills: [], inferredSkills: [], curriculum: null, occupationDetails: [] };
  }

  const [{ data: profiles, error: profileError }, { data: occupationRows, error: occupationError }, { data: cityRows, error: cityError }, { data: pairsFromSkillA, error: pairFromSkillAError }, { data: pairsFromSkillB, error: pairFromSkillBError }] = await Promise.all([
    admin.from("skills").select("canonical_name,display_name,skill_type,demand_per_10k_2025,salary_median_2025,experience_mean_2025,bachelor_or_above_share_2025,graduate_share_2025,ai_exposure,ai_group,ai_cooccurrence_npmi,forecast_2026,forecast_2027,forecast_2028,fact_summary").in("canonical_name", recognizedSkills),
    admin.from("occupation_skill_stats").select("canonical_name,occupation_code,occupation_name,probability,concentration,forecast_demand_2026,forecast_demand_2027,forecast_demand_2028").in("canonical_name", recognizedSkills),
    admin.from("city_skill_forecasts").select("canonical_name,city,demand_per_10k,demand_volume_index").in("canonical_name", recognizedSkills).eq("forecast_year", query.forecastYear),
    admin.from("skill_pairs").select("id,skill_a,skill_b,npmi").in("skill_a", recognizedSkills),
    admin.from("skill_pairs").select("id,skill_a,skill_b,npmi").in("skill_b", recognizedSkills)
  ]);
  if (profileError || occupationError || cityError || pairFromSkillAError || pairFromSkillBError) {
    throw new Error("职业证据查询失败");
  }
  const pairs = Array.from(new Map([...(pairsFromSkillA ?? []), ...(pairsFromSkillB ?? [])].map((row) => [text(row as Row, "id"), row as Row])).values());
  const mappedPairs: SkillPair[] = ((pairs ?? []) as Row[]).map((row) => ({ id: text(row, "id"), skillA: text(row, "skill_a"), skillB: text(row, "skill_b") }));
  const observedPairIds = selectObservedPairs(recognizedSkills, mappedPairs);
  const { data: pairOccupationRows, error: pairOccupationError } = observedPairIds.length
    ? await admin.from("pair_occupation_stats").select("pair_id,occupation_code,probability,concentration").in("pair_id", observedPairIds)
    : { data: [], error: null };
  if (pairOccupationError) {
    throw new Error("组合职业证据查询失败");
  }
  const occupationStats: OccupationSkillStat[] = ((occupationRows ?? []) as Row[]).map((row) => ({
    skill: text(row, "canonical_name"), code: text(row, "occupation_code"), name: text(row, "occupation_name"),
    probability: numeric(row, "probability"), concentration: numeric(row, "concentration"), futureDemandRatio: numeric(row, `forecast_demand_${query.forecastYear}`)
  }));
  const pairOccupationStats: PairOccupationStat[] = ((pairOccupationRows ?? []) as Row[]).map((row) => ({
    pairId: text(row, "pair_id"), code: text(row, "occupation_code"), probability: numeric(row, "probability"), concentration: numeric(row, "concentration")
  }));
  const rankedOccupations = rankOccupations(recognizedSkills, occupationStats, pairOccupationStats);
  const { data: occupationCatalogRows, error: occupationCatalogError } = rankedOccupations.length
    ? await admin.from("occupation_catalog").select("subclass_code,subclass_name,occupation_name,description").in("subclass_code", rankedOccupations.slice(0, 5).map((row) => row.code)).eq("is_displayable", true)
    : { data: [], error: null };
  if (occupationCatalogError) console.warn("Occupation catalog is unavailable; continuing without occupation details", occupationCatalogError.message);
  const { data: programRow, error: programError } = query.programKey
    ? await admin.from("major_programs").select("program_key,school,cohort,college,major,training_objectives,ability_requirements,core_courses,program_features,degree_summary").eq("program_key", query.programKey).maybeSingle()
    : { data: null, error: null };
  if (programError) console.warn("Program details are unavailable; continuing without curriculum summary", programError.message);
  const cities = rankCities(((cityRows ?? []) as Row[]), recognizedSkills, query.cities);
  const nextSkills = recommendNextSkills(mappedPairs, recognizedSkills, (pairs ?? []) as Row[]);
  const preferenceNotes = buildPreferenceNotes((profiles ?? []) as Row[], query);
  return { forecastYear: query.forecastYear, recognizedSkills, unresolvedSkills, profiles: ((profiles ?? []) as Row[]).map((row) => profileView(row, query.forecastYear)), occupations: rankedOccupations, cities, nextSkills, observedPairCount: observedPairIds.length, preferenceNotes, confirmedSkills, inferredSkills, curriculum: programError || !programRow ? null : { ...(programRow as Row), skillEvidence: majorSkillError ? [] : majorSkillRows ?? [], note: "培养方案推断技能表示课程和培养要求覆盖的能力，不等于用户已经掌握。" }, occupationDetails: occupationCatalogError ? [] : groupOccupationDetails((occupationCatalogRows ?? []) as Row[]) };
}

function groupOccupationDetails(rows: Row[]) {
  const grouped = new Map<string, { subclassCode: string; subclassName: string; occupations: Array<{ name: string; description: string }> }>();
  for (const row of rows) {
    const code = text(row, "subclass_code");
    const entry = grouped.get(code) ?? { subclassCode: code, subclassName: text(row, "subclass_name"), occupations: [] };
    entry.occupations.push({ name: text(row, "occupation_name"), description: text(row, "description") });
    grouped.set(code, entry);
  }
  return Array.from(grouped.values()).map((entry) => ({ ...entry, occupations: entry.occupations.slice(0, 8) }));
}

function rankCities(rows: Row[], skills: string[], preferredCities: string[]) {
  const perSkillMax = new Map<string, number>();
  for (const row of rows) {
    const skill = text(row, "canonical_name");
    const scale = numeric(row, "demand_volume_index") || numeric(row, "demand_per_10k");
    perSkillMax.set(skill, Math.max(perSkillMax.get(skill) ?? 0, scale));
  }
  const grouped = new Map<string, { score: number; skills: Set<string> }>();
  for (const row of rows) {
    const skill = text(row, "canonical_name");
    const city = text(row, "city");
    const max = perSkillMax.get(skill) ?? 0;
    const scale = numeric(row, "demand_volume_index") || numeric(row, "demand_per_10k");
    const score = max ? scale / max : 0;
    const entry = grouped.get(city) ?? { score: 0, skills: new Set<string>() };
    entry.score += score;
    entry.skills.add(skill);
    grouped.set(city, entry);
  }
  const preferred = new Set(preferredCities);
  return Array.from(grouped.entries()).map(([city, value]) => ({ city, score: Math.round(1000 * Math.min(1, value.score / skills.length + (preferred.has(city) ? 0.08 : 0))) / 10, matchedSkills: Array.from(value.skills), preferred: preferred.has(city) })).sort((left, right) => right.score - left.score).slice(0, 5);
}

function recommendNextSkills(pairs: SkillPair[], skills: string[], pairRows: Row[]) {
  const byId = new Map(pairRows.map((row) => [text(row, "id"), row]));
  const selected = new Set(skills);
  return pairs.filter((pair) => selected.has(pair.skillA) !== selected.has(pair.skillB)).map((pair) => {
    const row = byId.get(pair.id) ?? {};
    return { skill: selected.has(pair.skillA) ? pair.skillB : pair.skillA, relatedTo: selected.has(pair.skillA) ? pair.skillA : pair.skillB, cooccurrence: Number.isFinite(numeric(row, "npmi")) ? numeric(row, "npmi") : null };
  }).sort((left, right) => (right.cooccurrence ?? -Infinity) - (left.cooccurrence ?? -Infinity)).filter((value, index, all) => all.findIndex((item) => item.skill === value.skill) === index).slice(0, 5);
}

function buildPreferenceNotes(profiles: Row[], query: ParsedCareerQuery): string[] {
  const notes: string[] = [];
  const salaries = profiles.map((row) => numeric(row, "salary_median_2025")).filter((value) => value > 0);
  if (query.salaryMinYuan !== null && salaries.length) {
    const median = salaries.reduce((sum, value) => sum + value, 0) / salaries.length;
    notes.push(`期望薪资与相关技能当前月薪中位数约 ${Math.round(median)} 元进行对照，不作为硬性过滤条件。`);
  }
  if (query.cities.length) notes.push(`已将理想城市 ${query.cities.join("、")} 作为城市排序加分项。`);
  if (query.experienceYears !== null) notes.push("工作经验与岗位平均最低经验要求进行对照，不会隐藏其他可能方向。");
  return notes;
}
