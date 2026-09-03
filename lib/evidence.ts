import { normaliseSkillToken } from "@/lib/query";
import { parseCareerQuestionLocally, type LocalOccupationCatalogEntry, type LocalProgramCatalogEntry, type LocalSkillCatalogEntry } from "@/lib/local-query";
import { localAiCooccurrence } from "@/lib/ai-cooccurrence-local";
import { localOccupationEvidence, localProgramCatalog, localProgramEvidence, localProgramSeriesEvidence } from "@/lib/curriculum-local";
import { localMajorDestinationPriors, resolveLocalMajor } from "@/lib/major-destinations-local";
import { applyMajorDestinationPriors, rankOccupations, selectObservedPairs, type MajorDestinationPrior, type OccupationSkillStat, type PairOccupationStat, type SkillPair } from "@/lib/ranking";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CareerEvidenceModule, CareerQueryPlan } from "@/lib/career-plan";
import type { ParsedCareerQuery } from "@/types/career";

type Row = Record<string, unknown>;

export interface ObservedSkillPair {
  id: string;
  skillA: string;
  skillB: string;
  cooccurrence: number | null;
  wageComplementPct: number | null;
  wageComplementPValue: number | null;
  demandRate2025: number | null;
  demandRate2028: number | null;
  demandGrowthPct: number | null;
  evidenceLevel: string;
}

export interface AiExposureDetail {
  skill: string;
  aiGroup: string;
  demandShare2025: number | null;
  demandShare2028: number | null;
}

export interface NextSkillRecommendation {
  skill: string;
  relatedTo: string;
  cooccurrence: number | null;
  demandPer10k2025?: number | null;
  salaryMedian2025?: number | null;
  forecastDemandPer10k?: number | null;
  forecastTrend?: string;
  occupationsAfter?: string[];
  citiesAfter?: string[];
}

export interface TargetOccupationSkill {
  occupationName: string;
  skill: string;
  forecastDemandShare: number | null;
  concentration: number | null;
  userHasSkill: boolean;
}

export interface PairCityEvidence {
  pairId: string;
  city: string;
  probability: number | null;
  concentration: number | null;
}

let catalogPromise: Promise<{ skills: LocalSkillCatalogEntry[]; programs: LocalProgramCatalogEntry[]; occupations: LocalOccupationCatalogEntry[] }> | undefined;

export interface CareerEvidence {
  forecastYear: number;
  recognizedSkills: string[];
  unresolvedSkills: string[];
  profiles: Array<Record<string, unknown>>;
  occupations: ReturnType<typeof rankOccupations>;
  cities: Array<{ city: string; score: number; matchedSkills: string[]; preferred: boolean }>;
  nextSkills: NextSkillRecommendation[];
  observedPairCount: number;
  observedPairs: ObservedSkillPair[];
  aiExposureDetails: AiExposureDetail[];
  aiCooccurrenceSource: "supabase" | "local_csv" | "none";
  preferenceNotes: string[];
  confirmedSkills?: string[];
  inferredSkills?: string[];
  majorDestinations?: MajorDestinationPrior[];
  curriculum?: Record<string, unknown> | null;
  curriculumVersions?: Array<Record<string, unknown>>;
  occupationDetails?: Array<{ subclassCode: string; subclassName: string; occupations: Array<{ name: string; description: string }> }>;
  queryPlan?: CareerQueryPlan;
  queriedModules?: CareerEvidenceModule[];
  targetOccupationSkills?: TargetOccupationSkill[];
  pairCities?: PairCityEvidence[];
}

const LOCAL_SUPPORTED_PAIRS: Row[] = [{
  id: "ZH01389",
  skill_a: "TPM",
  skill_b: "设备管理",
  npmi: 0.4265684188432289,
  wage_complement_pct: 9.06313367029755,
  wage_complement_p_value: 0.0486674789753573,
  demand_rate_2025: 0.0008419557719618,
  demand_rate_2028: 0.0012141814176568,
  demand_growth_pct: 44.20964355736825,
  evidence_level: "稳健子技能互补"
}];

const COMMON_OCCUPATION_ALIASES: Record<string, string[]> = {
  "数字技术工程技术人员": ["数字技术", "人工智能工程师", "大数据工程师", "云计算工程师", "物联网工程师", "智能制造工程师"],
  "软件和信息技术服务人员": ["软件开发", "软件测试", "程序员", "数据库运维", "信息技术服务"],
  "会计专业人员": ["会计", "财务会计"],
  "统计专业人员": ["统计分析师", "统计师"],
  "销售人员": ["销售", "销售岗位"]
};

function text(row: Row, key: string): string {
  return typeof row[key] === "string" ? row[key] : "";
}

function numeric(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nullableNumeric(row: Row, key: string): number | null {
  const value = row[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

function profileView(row: Row, year: number, localAi: ReadonlyMap<string, { cooccurrence: number | null; share: number | null }>): Record<string, unknown> {
  const forecast = row[`forecast_${year}`];
  const localAiRecord = localAi.get(text(row, "canonical_name"));
  const demandPer10k2025 = numeric(row, "demand_per_10k_2025");
  return {
    skill: text(row, "canonical_name"),
    displayName: text(row, "display_name"),
    skillType: text(row, "skill_type"),
    demandRate2025: demandPer10k2025 / 10_000,
    demandPer10k2025,
    salaryMedian2025: numeric(row, "salary_median_2025"),
    experienceMean2025: numeric(row, "experience_mean_2025"),
    bachelorOrAboveShare2025: numeric(row, "bachelor_or_above_share_2025"),
    graduateShare2025: numeric(row, "graduate_share_2025"),
    aiExposure: numeric(row, "ai_exposure"),
    aiGroup: text(row, "ai_group"),
    aiCooccurrence: nullableNumeric(row, "ai_cooccurrence_npmi") ?? localAiRecord?.cooccurrence ?? null,
    aiCooccurrenceShare: nullableNumeric(row, "ai_cooccurrence_share") ?? localAiRecord?.share ?? null,
    forecast: typeof forecast === "object" && forecast !== null ? forecast : {},
    factSummary: text(row, "fact_summary")
  };
}

export async function parseCareerQuestionFromCatalog(question: string): Promise<ParsedCareerQuery> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const admin = createAdminClient();
      const [{ data: skills, error: skillsError }, { data: aliases, error: aliasesError }, { data: programs, error: programsError }, { data: occupations, error: occupationsError }] = await Promise.all([
        admin.from("skills").select("canonical_name"),
        admin.from("skill_aliases").select("canonical_name,alias"),
        admin.from("major_programs").select("program_key,school,cohort,major,aliases"),
        admin.from("occupation_catalog").select("subclass_name,occupation_name").eq("is_displayable", true)
      ]);
      if (skillsError || aliasesError) {
        console.error("Core skill catalog query failed", { skillsError, aliasesError });
        throw new Error("无法加载技能识别词典");
      }
      if (programsError) console.warn("Program catalog is unavailable; using bundled curriculum index", programsError.message);
      if (occupationsError) console.warn("Occupation catalog is unavailable; explicit occupation matching is disabled", occupationsError.message);
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
      const databasePrograms = ((programsError ? [] : programs ?? []) as Row[]).map((row) => ({
        programKey: text(row, "program_key"), school: text(row, "school"), cohort: text(row, "cohort"), major: text(row, "major"),
        aliases: text(row, "aliases").split("|").map((value) => value.trim()).filter(Boolean)
      })).filter((entry) => entry.programKey && entry.major);
      const aliasesByOccupation = new Map<string, Set<string>>();
      for (const row of (occupationsError ? [] : occupations ?? []) as Row[]) {
        const subclassName = text(row, "subclass_name");
        const occupationName = text(row, "occupation_name");
        if (!subclassName) continue;
        const current = aliasesByOccupation.get(subclassName) ?? new Set<string>();
        if (occupationName) {
          current.add(occupationName);
          const shortName = occupationName.replace(/^计算机/, "").replace(/(?:工程技术人员|专业人员|技术人员|管理员|操作员|设计员|服务员|分析师|工程师)$/, "");
          if (shortName.length >= 4) current.add(shortName);
        }
        for (const alias of COMMON_OCCUPATION_ALIASES[subclassName] ?? []) current.add(alias);
        aliasesByOccupation.set(subclassName, current);
      }
      const occupationCatalog = Array.from(aliasesByOccupation, ([subclassName, occupationAliases]) => ({ subclassName, aliases: Array.from(occupationAliases) }));
      const mergedPrograms = Array.from(new Map(
        [...databasePrograms, ...localProgramCatalog()].map((program) => [program.programKey, program])
      ).values());
      return { skills: skillCatalog, programs: mergedPrograms, occupations: occupationCatalog };
    })().catch((error: unknown) => {
      catalogPromise = undefined;
      throw error;
    });
  }
  const catalog = await catalogPromise;
  return parseCareerQuestionLocally(question, catalog.skills, catalog.programs, catalog.occupations);
}

export async function retrieveCareerEvidence(query: ParsedCareerQuery, queryPlan?: CareerQueryPlan): Promise<CareerEvidence> {
  const admin = createAdminClient();
  const modules = new Set<CareerEvidenceModule>(queryPlan?.modules ?? ["skill_profiles", "occupations", "skill_pairs", "next_skills", "cities", "ai_impact", "curriculum", "major_destinations", "occupation_catalog"]);
  const needsCurriculum = modules.has("curriculum");
  const needsProfiles = modules.has("skill_profiles") || modules.has("ai_impact");
  const needsOccupations = modules.has("occupations") || modules.has("occupation_catalog");
  const needsPairs = modules.has("skill_pairs") || modules.has("next_skills");
  const needsCities = modules.has("cities");
  const needsAi = modules.has("ai_impact");
  const curriculumDesign = queryPlan?.answerStyle === "curriculum_design";
  const localMajor = query.programKey ? resolveLocalMajor(query.programKey) : null;
  let majorDestinations: MajorDestinationPrior[] = [];
  if (localMajor && modules.has("major_destinations")) {
    const destinationQuery = admin.from("major_destination_priors")
      .select("occupation_code,occupation_name,destination_name,destination_share,display_rank,direction_type,data_scope,destination_tier,mapping_confidence")
      .eq(localMajor.majorCode ? "major_code" : "major_name", localMajor.majorCode || localMajor.majorName)
      .eq("is_rankable", true);
    const { data, error } = await destinationQuery;
    if (error) console.warn("Major destination priors are unavailable; using bundled index", error.message);
    majorDestinations = !error && data?.length ? (data as Row[]).map((row) => ({
      occupationCode: text(row, "occupation_code"), occupationName: text(row, "occupation_name"), destinationName: text(row, "destination_name"),
      destinationShare: nullableNumeric(row, "destination_share"), displayRank: numeric(row, "display_rank") || 999,
      directionType: text(row, "direction_type"), dataScope: text(row, "data_scope"), destinationTier: text(row, "destination_tier"), mappingConfidence: text(row, "mapping_confidence")
    })) : localMajorDestinationPriors(localMajor.majorCode, localMajor.majorName);
  }
  const majorSkillLimit = curriculumDesign ? 24 : 12;
  const { data: majorSkillRows, error: majorSkillError } = query.programKey && needsCurriculum
    ? await admin.from("major_skills").select("canonical_name,skill_type,cluster_name,rank,evidence_summary,mapping_basis").eq("program_key", query.programKey).eq("is_representative", true).order("rank").limit(majorSkillLimit)
    : { data: [], error: null };
  if (majorSkillError) console.warn("Program skills are unavailable; continuing with confirmed skills", majorSkillError.message);
  let localProgram = { program: null, skills: [] } as ReturnType<typeof localProgramEvidence>;
  if (query.programKey && needsCurriculum && (majorSkillError || !majorSkillRows?.length)) localProgram = localProgramEvidence(query.programKey, majorSkillLimit);
  const effectiveMajorSkillRows: Row[] = !needsCurriculum
    ? []
    : majorSkillError || !majorSkillRows?.length
    ? localProgram.skills.map((row) => ({ canonical_name: row.canonicalName, skill_type: row.skillType, cluster_name: row.clusterName, rank: row.rank, evidence_summary: row.evidenceSummary, mapping_basis: row.mappingBasis }))
    : (majorSkillRows as Row[]);
  const inferredSkills = effectiveMajorSkillRows.map((row) => text(row, "canonical_name")).filter(Boolean);
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
  const confirmedTokens = (query.confirmedSkills ?? query.skills).map(normaliseSkillToken);
  const confirmedSkills = recognizedSkills.filter((skill) => confirmedTokens.includes(normaliseSkillToken(skill)));
  const rankingSkills = confirmedSkills.length ? confirmedSkills : query.occupationKeywords.length ? inferredSkills : query.programKey ? [] : recognizedSkills;
  const unresolvedSkills = query.skills.filter((skill) => !recognizedSkills.some((item) => normaliseSkillToken(item) === normaliseSkillToken(skill)));
  const { data: targetOccupationRows, error: targetOccupationError } = needsOccupations && query.occupationKeywords.length
    ? await admin.from("occupation_skill_stats")
      .select(`canonical_name,occupation_name,concentration,forecast_demand_${query.forecastYear}`)
      .in("occupation_name", query.occupationKeywords)
      .order(`forecast_demand_${query.forecastYear}`, { ascending: false })
      .limit(120)
    : { data: [], error: null };
  if (targetOccupationError) console.warn("Target occupation skills are unavailable", targetOccupationError.message);
  let targetOccupationSkills = rankTargetOccupationSkills((targetOccupationRows ?? []) as Row[], recognizedSkills, query.forecastYear);
  if (!recognizedSkills.length && !majorDestinations.length) {
    return { forecastYear: query.forecastYear, recognizedSkills: [], unresolvedSkills, profiles: [], occupations: [], cities: [], nextSkills: [], observedPairCount: 0, observedPairs: [], aiExposureDetails: [], aiCooccurrenceSource: "none", preferenceNotes: targetOccupationSkills.length ? [] : ["暂无可识别的技能记录"], confirmedSkills: [], inferredSkills: [], majorDestinations, curriculum: null, occupationDetails: [], queryPlan, queriedModules: Array.from(modules), targetOccupationSkills };
  }

  const profileFields = `canonical_name,display_name,skill_type,demand_per_10k_2025,salary_median_2025,experience_mean_2025,bachelor_or_above_share_2025,graduate_share_2025,forecast_2026,forecast_2027,forecast_2028,fact_summary${needsAi ? ",ai_exposure,ai_group,ai_cooccurrence_npmi,ai_cooccurrence_share" : ""}`;
  const [{ data: profiles, error: profileError }, { data: occupationRows, error: occupationError }, { data: cityRows, error: cityError }, { data: pairsFromSkillA, error: pairFromSkillAError }, { data: pairsFromSkillB, error: pairFromSkillBError }] = await Promise.all([
    needsProfiles ? admin.from("skills").select(profileFields).in("canonical_name", recognizedSkills) : Promise.resolve({ data: [], error: null }),
    needsOccupations ? admin.from("occupation_skill_stats").select("canonical_name,occupation_code,occupation_name,probability,concentration,forecast_demand_2026,forecast_demand_2027,forecast_demand_2028").in("canonical_name", recognizedSkills) : Promise.resolve({ data: [], error: null }),
    needsCities ? admin.from("city_skill_forecasts").select("canonical_name,city,demand_per_10k,demand_volume_index").in("canonical_name", recognizedSkills).eq("forecast_year", query.forecastYear) : Promise.resolve({ data: [], error: null }),
    needsPairs ? admin.from("skill_pairs").select("id,skill_a,skill_b,npmi,wage_complement_pct,wage_complement_p_value,demand_rate_2025,demand_rate_2028,demand_growth_pct,evidence_level").in("skill_a", recognizedSkills) : Promise.resolve({ data: [], error: null }),
    needsPairs ? admin.from("skill_pairs").select("id,skill_a,skill_b,npmi,wage_complement_pct,wage_complement_p_value,demand_rate_2025,demand_rate_2028,demand_growth_pct,evidence_level").in("skill_b", recognizedSkills) : Promise.resolve({ data: [], error: null })
  ]);
  if (profileError || occupationError || cityError || pairFromSkillAError || pairFromSkillBError) {
    throw new Error("职业证据查询失败");
  }
  const localPairs = needsPairs ? LOCAL_SUPPORTED_PAIRS.filter((row) => recognizedSkills.includes(text(row, "skill_a")) || recognizedSkills.includes(text(row, "skill_b"))) : [];
  const pairs = Array.from(new Map([...(pairsFromSkillA ?? []), ...(pairsFromSkillB ?? []), ...localPairs].map((row) => [text(row as Row, "id"), row as Row])).values());
  const mappedPairs: SkillPair[] = ((pairs ?? []) as Row[]).map((row) => ({ id: text(row, "id"), skillA: text(row, "skill_a"), skillB: text(row, "skill_b") }));
  const nextSkillCandidates = candidateSkillNames(mappedPairs, rankingSkills);
  const { data: nextSkillProfileRows, error: nextSkillProfileError } = modules.has("next_skills") && nextSkillCandidates.length
    ? await admin.from("skills").select(`canonical_name,skill_type,demand_per_10k_2025,salary_median_2025,forecast_${query.forecastYear}`).limit(1000)
    : { data: [], error: null };
  if (nextSkillProfileError) throw new Error("候选技能指标查询失败");
  const observedPairIds = selectObservedPairs(rankingSkills, mappedPairs);
  const observedPairIdSet = new Set(observedPairIds);
  const observedPairs: ObservedSkillPair[] = ((pairs ?? []) as Row[])
    .filter((row) => observedPairIdSet.has(text(row, "id")))
    .map((row) => ({
      id: text(row, "id"),
      skillA: text(row, "skill_a"),
      skillB: text(row, "skill_b"),
      cooccurrence: nullableNumeric(row, "npmi"),
      wageComplementPct: nullableNumeric(row, "wage_complement_pct"),
      wageComplementPValue: nullableNumeric(row, "wage_complement_p_value"),
      demandRate2025: nullableNumeric(row, "demand_rate_2025"),
      demandRate2028: nullableNumeric(row, "demand_rate_2028"),
      demandGrowthPct: nullableNumeric(row, "demand_growth_pct"),
      evidenceLevel: text(row, "evidence_level")
    }));
  const [{ data: pairOccupationRows, error: pairOccupationError }, { data: pairCityRows, error: pairCityError }] = await Promise.all([
    needsOccupations && observedPairIds.length
      ? admin.from("pair_occupation_stats").select("pair_id,occupation_code,probability,concentration").in("pair_id", observedPairIds)
      : Promise.resolve({ data: [], error: null }),
    needsCities && observedPairIds.length
      ? admin.from("pair_city_stats").select("pair_id,city,probability,concentration").in("pair_id", observedPairIds).order("probability", { ascending: false }).limit(25)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (pairOccupationError) {
    throw new Error("组合职业证据查询失败");
  }
  if (pairCityError) console.warn("Pair city evidence is unavailable", pairCityError.message);
  const occupationStats: OccupationSkillStat[] = ((occupationRows ?? []) as Row[]).map((row) => ({
    skill: text(row, "canonical_name"), code: text(row, "occupation_code"), name: text(row, "occupation_name"),
    probability: numeric(row, "probability"), concentration: numeric(row, "concentration"), futureDemandRatio: numeric(row, `forecast_demand_${query.forecastYear}`)
  }));
  const pairOccupationStats: PairOccupationStat[] = ((pairOccupationRows ?? []) as Row[]).map((row) => ({
    pairId: text(row, "pair_id"), code: text(row, "occupation_code"), probability: numeric(row, "probability"), concentration: numeric(row, "concentration")
  }));
  const skillRankedOccupations = rankOccupations(rankingSkills, occupationStats, pairOccupationStats);
  const rankedOccupations = applyMajorDestinationPriors(skillRankedOccupations, majorDestinations, query.occupationKeywords.length === 0);
  if (!targetOccupationSkills.length && needsOccupations && rankedOccupations[0] && (modules.has("next_skills") || queryPlan?.answerStyle === "learning_plan" || curriculumDesign)) {
    const { data: inferredTargetRows, error: inferredTargetError } = await admin.from("occupation_skill_stats")
      .select(`canonical_name,occupation_name,concentration,forecast_demand_${query.forecastYear}`)
      .eq("occupation_name", rankedOccupations[0].name)
      .order(`forecast_demand_${query.forecastYear}`, { ascending: false })
      .limit(12);
    if (inferredTargetError) console.warn("Inferred target occupation skills are unavailable", inferredTargetError.message);
    targetOccupationSkills = rankTargetOccupationSkills((inferredTargetRows ?? []) as Row[], confirmedSkills, query.forecastYear);
  }
  const rankedNextSkills = modules.has("next_skills")
    ? recommendNextSkills(mappedPairs, rankingSkills, (pairs ?? []) as Row[], (nextSkillProfileRows ?? []) as Row[], query.forecastYear, new Set(targetOccupationSkills.map((item) => item.skill)))
    : [];
  const rankedNextSkillNames = rankedNextSkills.map((item) => item.skill);
  const [{ data: nextSkillOccupationRows, error: nextSkillOccupationError }, { data: nextSkillCityRows, error: nextSkillCityError }] = await Promise.all([
    rankedNextSkillNames.length
      ? admin.from("occupation_skill_stats").select("canonical_name,occupation_code,occupation_name,probability,concentration,forecast_demand_2026,forecast_demand_2027,forecast_demand_2028").in("canonical_name", rankedNextSkillNames)
      : Promise.resolve({ data: [], error: null }),
    rankedNextSkillNames.length
      ? admin.from("city_skill_forecasts").select("canonical_name,city,demand_per_10k,demand_volume_index").in("canonical_name", rankedNextSkillNames).eq("forecast_year", query.forecastYear)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (nextSkillOccupationError || nextSkillCityError) throw new Error("候选技能影响查询失败");
  const nextOccupationStats: OccupationSkillStat[] = ((nextSkillOccupationRows ?? []) as Row[]).map((row) => ({
    skill: text(row, "canonical_name"), code: text(row, "occupation_code"), name: text(row, "occupation_name"),
    probability: numeric(row, "probability"), concentration: numeric(row, "concentration"), futureDemandRatio: numeric(row, `forecast_demand_${query.forecastYear}`)
  }));
  const nextSkills: NextSkillRecommendation[] = rankedNextSkills.map((item) => ({
    ...item,
    occupationsAfter: applyMajorDestinationPriors(rankOccupations([...rankingSkills, item.skill], [...occupationStats, ...nextOccupationStats.filter((row) => row.skill === item.skill)], []), majorDestinations, query.occupationKeywords.length === 0).slice(0, 3).map((row) => row.name),
    citiesAfter: rankCities([...((cityRows ?? []) as Row[]), ...((nextSkillCityRows ?? []) as Row[]).filter((row) => text(row, "canonical_name") === item.skill)], [...rankingSkills, item.skill], query.cities).map((row) => row.city)
  }));
  const [{ data: aiExposureRows, error: aiExposureError }, { data: aiCooccurrenceRows, error: aiCooccurrenceError }] = await Promise.all([
    needsAi ? admin.from("skill_ai_exposure").select("canonical_name,ai_group,demand_share_2025,demand_share_2028").in("canonical_name", recognizedSkills) : Promise.resolve({ data: [], error: null }),
    needsAi ? admin.from("ai_skill_cooccurrence").select("canonical_name,cooccurrence_npmi,historical_ai_collaboration_share").in("canonical_name", recognizedSkills) : Promise.resolve({ data: [], error: null })
  ]);
  if (aiExposureError) console.warn("AI exposure detail table is unavailable; using skill profile fields", aiExposureError.message);
  if (aiCooccurrenceError) console.warn("AI cooccurrence table is unavailable; using bundled index", aiCooccurrenceError.message);
  const aiExposureDetails: AiExposureDetail[] = (aiExposureError ? [] : (aiExposureRows ?? []) as Row[]).map((row) => ({
    skill: text(row, "canonical_name"),
    aiGroup: text(row, "ai_group"),
    demandShare2025: nullableNumeric(row, "demand_share_2025"),
    demandShare2028: nullableNumeric(row, "demand_share_2028")
  }));
  const aiCooccurrenceBySkill = new Map<string, { cooccurrence: number | null; share: number | null }>(
    (aiCooccurrenceError ? [] : (aiCooccurrenceRows ?? []) as Row[]).map((row) => [text(row, "canonical_name"), {
      cooccurrence: nullableNumeric(row, "cooccurrence_npmi"),
      share: nullableNumeric(row, "historical_ai_collaboration_share")
    }])
  );
  const localAi = needsAi ? localAiCooccurrence() : new Map<string, { cooccurrence: number | null; share: number | null }>();
  const effectiveAiCooccurrence = aiCooccurrenceBySkill.size ? aiCooccurrenceBySkill : localAi;
  const aiCooccurrenceSource: CareerEvidence["aiCooccurrenceSource"] = aiCooccurrenceBySkill.size
    ? "supabase"
    : recognizedSkills.some((skill) => localAi.has(skill)) ? "local_csv" : "none";
  const { data: occupationCatalogRows, error: occupationCatalogError } = modules.has("occupation_catalog") && rankedOccupations.length
    ? await admin.from("occupation_catalog").select("subclass_code,subclass_name,occupation_name,description").in("subclass_code", rankedOccupations.slice(0, 5).map((row) => row.code)).eq("is_displayable", true)
    : { data: [], error: null };
  if (occupationCatalogError) console.warn("Occupation catalog is unavailable; using bundled occupation index", occupationCatalogError.message);
  const effectiveOccupationCatalogRows: Row[] = !modules.has("occupation_catalog")
    ? []
    : occupationCatalogError || !occupationCatalogRows?.length
    ? localOccupationEvidence(rankedOccupations.slice(0, 5).map((row) => row.code)).map((row) => ({ subclass_code: row.subclassCode, subclass_name: row.subclassName, occupation_name: row.occupationName, description: row.description }))
    : occupationCatalogRows as Row[];
  const { data: programRow, error: programError } = query.programKey && needsCurriculum
    ? await admin.from("major_programs").select("program_key,school,cohort,college,major,training_objectives,ability_requirements,core_courses,program_features,degree_summary").eq("program_key", query.programKey).maybeSingle()
    : { data: null, error: null };
  if (programError) console.warn("Program details are unavailable; using bundled curriculum index", programError.message);
  if (query.programKey && needsCurriculum && (programError || !programRow) && !localProgram.program) localProgram = localProgramEvidence(query.programKey, majorSkillLimit);
  const effectiveProgramRow: Row | null = !needsCurriculum
    ? null
    : programError || !programRow
    ? localProgram.program ? {
        program_key: localProgram.program.programKey,
        school: localProgram.program.school,
        cohort: localProgram.program.cohort,
        college: localProgram.program.college,
        major: localProgram.program.major,
        major_code: localProgram.program.majorCode,
        training_objectives: localProgram.program.trainingObjectives,
        ability_requirements: localProgram.program.abilityRequirements,
        core_courses: localProgram.program.coreCourses,
        program_features: localProgram.program.programFeatures,
        degree_summary: localProgram.program.degreeSummary
      } : null
    : programRow as Row;
  const cities = rankCities(((cityRows ?? []) as Row[]), rankingSkills.length ? rankingSkills : recognizedSkills, query.cities);
  const preferenceNotes = buildPreferenceNotes((profiles ?? []) as Row[], query);
  const pairCities: PairCityEvidence[] = ((pairCityRows ?? []) as Row[]).map((row) => ({
    pairId: text(row, "pair_id"),
    city: text(row, "city"),
    probability: nullableNumeric(row, "probability"),
    concentration: nullableNumeric(row, "concentration")
  }));
  const curriculumVersions = query.programKey && needsCurriculum
    ? localProgramSeriesEvidence(query.programKey, majorSkillLimit).map(({ program, skills }) => ({
        program_key: program.programKey,
        school: program.school,
        cohort: program.cohort,
        college: program.college,
        major: program.major,
        training_objectives: program.trainingObjectives,
        ability_requirements: program.abilityRequirements,
        core_courses: program.coreCourses,
        program_features: program.programFeatures,
        skillEvidence: skills.map((skill) => ({
          canonical_name: skill.canonicalName,
          skill_type: skill.skillType,
          cluster_name: skill.clusterName,
          rank: skill.rank,
          evidence_summary: skill.evidenceSummary,
          mapping_basis: skill.mappingBasis
        }))
      }))
    : [];
  return { forecastYear: query.forecastYear, recognizedSkills, unresolvedSkills, profiles: ((profiles ?? []) as Row[]).map((row) => profileView(row, query.forecastYear, effectiveAiCooccurrence)), occupations: rankedOccupations, cities, nextSkills, observedPairCount: observedPairIds.length, observedPairs, aiExposureDetails, aiCooccurrenceSource, preferenceNotes, confirmedSkills, inferredSkills, majorDestinations, curriculum: effectiveProgramRow ? { ...effectiveProgramRow, skillEvidence: effectiveMajorSkillRows, note: "培养方案推断技能表示课程和培养要求覆盖的能力，不等于用户已经掌握。" } : null, curriculumVersions, occupationDetails: groupOccupationDetails(effectiveOccupationCatalogRows), queryPlan, queriedModules: Array.from(modules), targetOccupationSkills, pairCities };
}

function rankTargetOccupationSkills(rows: Row[], userSkills: string[], forecastYear: number): TargetOccupationSkill[] {
  const selected = new Set(userSkills);
  const counts = new Map<string, number>();
  return rows
    .sort((left, right) => numeric(right, `forecast_demand_${forecastYear}`) - numeric(left, `forecast_demand_${forecastYear}`))
    .filter((row) => {
      const occupation = text(row, "occupation_name");
      const count = counts.get(occupation) ?? 0;
      counts.set(occupation, count + 1);
      return count < 12;
    })
    .map((row) => ({
      occupationName: text(row, "occupation_name"),
      skill: text(row, "canonical_name"),
      forecastDemandShare: nullableNumeric(row, `forecast_demand_${forecastYear}`),
      concentration: nullableNumeric(row, "concentration"),
      userHasSkill: selected.has(text(row, "canonical_name"))
    }));
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

function candidateSkillNames(pairs: SkillPair[], skills: string[]): string[] {
  const selected = new Set(skills);
  return Array.from(new Set(pairs
    .filter((pair) => selected.has(pair.skillA) !== selected.has(pair.skillB))
    .map((pair) => selected.has(pair.skillA) ? pair.skillB : pair.skillA)));
}

function recommendNextSkills(pairs: SkillPair[], skills: string[], pairRows: Row[], profileRows: Row[], forecastYear: number, targetSkills = new Set<string>()): Omit<NextSkillRecommendation, "occupationsAfter" | "citiesAfter">[] {
  const byId = new Map(pairRows.map((row) => [text(row, "id"), row]));
  const profiles = new Map(profileRows.map((row) => [text(row, "canonical_name"), row]));
  const selected = new Set(skills);
  const relatedSkills = new Map<string, Set<string>>();
  pairs.filter((pair) => selected.has(pair.skillA) !== selected.has(pair.skillB)).forEach((pair) => {
    const skill = selected.has(pair.skillA) ? pair.skillB : pair.skillA;
    const related = selected.has(pair.skillA) ? pair.skillA : pair.skillB;
    if (!relatedSkills.has(skill)) relatedSkills.set(skill, new Set());
    relatedSkills.get(skill)?.add(related);
  });
  const candidates = pairs.filter((pair) => selected.has(pair.skillA) !== selected.has(pair.skillB)).map((pair) => {
    const row = byId.get(pair.id) ?? {};
    const skill = selected.has(pair.skillA) ? pair.skillB : pair.skillA;
    const profile = profiles.get(skill) ?? {};
    const forecast = typeof profile[`forecast_${forecastYear}`] === "object" && profile[`forecast_${forecastYear}`] !== null
      ? profile[`forecast_${forecastYear}`] as Row
      : {};
    const demandPer10k2025 = nullableNumeric(profile, "demand_per_10k_2025");
    const forecastDemandPer10k = nullableNumeric(forecast, "demandPer10k");
    const growth = demandPer10k2025 && forecastDemandPer10k !== null
      ? Math.max(-0.5, Math.min(1, forecastDemandPer10k / demandPer10k2025 - 1))
      : 0;
    const cooccurrence = nullableNumeric(row, "npmi");
    const typeWeight = text(profile, "skill_type") === "非技术性能力" ? 0.65 : 1;
    const relationCount = relatedSkills.get(skill)?.size ?? 1;
    const score = typeWeight * (0.55 * Math.max(cooccurrence ?? 0, 0) + 0.35 * Math.log1p(demandPer10k2025 ?? 0) + 0.1 * Math.max(growth, 0) + 0.2 * (relationCount - 1));
    return {
      skill,
      relatedTo: Array.from(relatedSkills.get(skill) ?? []).join("、"),
      cooccurrence,
      demandPer10k2025,
      salaryMedian2025: nullableNumeric(profile, "salary_median_2025"),
      forecastDemandPer10k,
      forecastTrend: text(forecast, "trend"),
      score
    };
  });
  return candidates
    .filter((item) => targetSkills.size === 0 || targetSkills.has(item.skill))
    .sort((left, right) => right.score - left.score)
    .filter((value, index, all) => all.findIndex((item) => item.skill === value.skill) === index)
    .slice(0, 5)
    .map(({ score: _score, ...item }) => item);
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
