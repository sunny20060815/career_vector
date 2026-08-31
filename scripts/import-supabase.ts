import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  createCanonicalSkillNameLookup,
  deduplicateByKey,
  deduplicateSkillAliases,
  normaliseSkillName,
  orderSkillPair,
  resolveCanonicalSkillName,
  resolveImportSectionFromArgs,
  type CanonicalSkillName
} from "../lib/import";

type SourceRow = Record<string, string>;
type DestinationRow = Record<string, string | number | boolean | null | object>;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const FILES = {
  skills: "01_核心表/01_技能主表.csv",
  aliases: "01_核心表/02_技能别名表.csv",
  pairs: "01_核心表/03_技能组合关系表.csv",
  occupations: "02_关系表/04_职业技能关系表.csv",
  cities: "02_关系表/05_城市技能关系表.csv",
  pairOccupations: "02_关系表/06_技能组合职业关系表.csv",
  pairCities: "02_关系表/07_技能组合城市关系表.csv",
  programs: "02_关系表/09_专业培养方案主表.csv",
  majorSkills: "02_关系表/10_专业技能关系表.csv",
  occupationCatalog: "02_关系表/11_职业大典职业明细表.csv"
} as const;
loadEnv({ path: path.join(ROOT, ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

function text(row: SourceRow, key: string): string | null { const value = row[key]?.trim(); return value ? value : null; }
function number(row: SourceRow, key: string): number | null { const value = Number(row[key]); return Number.isFinite(value) ? value : null; }
function boolean(row: SourceRow, key: string): boolean { return row[key] === "是"; }
function sourceSkillName(row: SourceRow): string {
  const value = text(row, "标准技能名称") ?? text(row, "canonical_skill");
  if (!value) throw new Error("源数据缺少标准技能名称和 canonical_skill");
  return value;
}

async function readCsv(file: string): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  await new Promise<void>((resolve, reject) => createReadStream(path.join(DATA_DIR, file)).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true })).on("data", (row: SourceRow) => rows.push(row)).on("error", reject).on("end", resolve));
  return rows;
}

async function loadCanonicalSkillNameLookup(): Promise<Map<string, string>> {
  const rows = await readCsv(FILES.skills);
  const canonicalSkills: CanonicalSkillName[] = rows.flatMap((row) => {
    const canonicalName = text(row, "标准技能名称");
    if (!canonicalName) return [];
    const aliases = (text(row, "同义词及原始写法") ?? "").split(/[、，,;；]+/).map((value) => value.trim()).filter(Boolean);
    return [{ canonicalName, aliases }];
  });
  return createCanonicalSkillNameLookup(canonicalSkills);
}

async function upsert(table: string, rows: DestinationRow[], conflict?: string): Promise<void> {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + 500), conflict ? { onConflict: conflict } : undefined);
    if (error) throw new Error(`${table} 第 ${index + 1} 批导入失败：${error.message}`);
  }
  console.log(`${table}: ${rows.length} 行`);
}

function forecast(row: SourceRow, year: number): object {
  return {
    demandRatio: number(row, `${year}年岗位需求占比预测`),
    demandPer10k: number(row, `${year}年岗位需求每万岗位数预测`),
    salaryMedian: number(row, `${year}年月薪中位数预测`),
    experienceMean: number(row, `${year}年最低经验年限均值预测`),
    trend: text(row, "需求趋势判断"),
    confidence: text(row, "预测可信度等级")
  };
}

async function importSkills() {
  const rows = await readCsv(FILES.skills);
  await upsert("skills", rows.map((row) => ({
    canonical_name: text(row, "标准技能名称")!, display_name: text(row, "技能展示名称") ?? text(row, "标准技能名称")!, normalized_name: normaliseSkillName(text(row, "标准技能名称")!),
    skill_type: text(row, "技能一级类型"), cluster_name: text(row, "技能簇名称"), is_ai_core: boolean(row, "是否AI核心技能"),
    demand_per_10k_2025: number(row, "2025年每万岗位需求数"), salary_median_2025: number(row, "2025年月薪中位数"), experience_mean_2025: number(row, "2025年最低经验年限均值"),
    bachelor_or_above_share_2025: (number(row, "2025年本科学历占比") ?? 0) + (number(row, "2025年硕士学历占比") ?? 0) + (number(row, "2025年博士学历占比") ?? 0),
    graduate_share_2025: (number(row, "2025年硕士学历占比") ?? 0) + (number(row, "2025年博士学历占比") ?? 0), ai_exposure: number(row, "关联职业加权AI暴露度"), ai_group: text(row, "主要AI渗透率职业组"),
    ai_cooccurrence_npmi: number(row, "AI共现强度_NPMI"), ai_cooccurrence_share: number(row, "历史AI协同占比"), forecast_2026: forecast(row, 2026), forecast_2027: forecast(row, 2027), forecast_2028: forecast(row, 2028), fact_summary: text(row, "面向大模型的事实摘要"), data_version: text(row, "数据版本")
  })), "canonical_name");
}

async function importAliases(canonicalSkillNameLookup: ReadonlyMap<string, string>) {
  const rows = await readCsv(FILES.aliases);
  const aliases = deduplicateSkillAliases(rows.flatMap((row) => [text(row, "标准技能名称"), text(row, "技能别名")].filter((value): value is string => Boolean(value)).map((alias) => ({ canonical_name: resolveCanonicalSkillName(sourceSkillName(row), canonicalSkillNameLookup), alias, normalized_alias: normaliseSkillName(alias) }))));
  await upsert("skill_aliases", aliases, "canonical_name,normalized_alias");
}

async function importRelations(canonicalSkillNameLookup: ReadonlyMap<string, string>) {
  const [pairs, occupations, cities, pairOccupations, pairCities] = await Promise.all([readCsv(FILES.pairs), readCsv(FILES.occupations), readCsv(FILES.cities), readCsv(FILES.pairOccupations), readCsv(FILES.pairCities)]);
  await upsert("skill_pairs", pairs.filter((row) => row["组合层级"] === "标准技能组合" && text(row, "标准技能名称_技能一") && text(row, "标准技能名称_技能二")).map((row) => {
    const [skillA, skillB] = orderSkillPair(resolveCanonicalSkillName(text(row, "标准技能名称_技能一")!, canonicalSkillNameLookup), resolveCanonicalSkillName(text(row, "标准技能名称_技能二")!, canonicalSkillNameLookup));
    return { id: text(row, "技能组合编号")!, skill_a: skillA, skill_b: skillB, npmi: number(row, "标准化共现强度_NPMI") ?? number(row, "NPMI_2016_2025"), wage_complement_pct: number(row, "工资互补效应_%") ?? number(row, "strict_complement_pct"), wage_complement_p_value: number(row, "互补效应BH调整p值") ?? number(row, "strict_complement_bh_p"), demand_rate_2025: number(row, "2025组合需求率"), demand_rate_2028: number(row, "2028组合需求率预测"), demand_growth_pct: number(row, "2025_2028需求增长_%"), evidence_level: text(row, "互补证据等级") ?? text(row, "证据等级") };
  }), "id");
  await upsert("occupation_skill_stats", occupations.map((row) => ({ id: text(row, "职业技能关系主键")!, canonical_name: resolveCanonicalSkillName(sourceSkillName(row), canonicalSkillNameLookup), occupation_code: text(row, "职业小类代码")!, occupation_name: text(row, "职业小类名称")!, probability: number(row, "平滑后职业匹配概率") ?? number(row, "掌握技能后进入该职业的概率") ?? 0, concentration: number(row, "职业技能相对集中度") ?? 0, forecast_demand_2026: number(row, "2026年职业内技能需求占比预测"), forecast_demand_2027: number(row, "2027年职业内技能需求占比预测"), forecast_demand_2028: number(row, "2028年职业内技能需求占比预测") })), "id");
  await upsert("city_skill_forecasts", cities.map((row) => ({ id: text(row, "城市技能关系主键")!, canonical_name: resolveCanonicalSkillName(sourceSkillName(row), canonicalSkillNameLookup), city: text(row, "城市")!, forecast_year: number(row, "预测年份")!, demand_ratio: number(row, "城市内技能需求占比预测"), demand_per_10k: number(row, "每万岗位需求数预测"), demand_volume_index: null })), "id");
  await upsert("pair_occupation_stats", pairOccupations.map((row) => ({ id: text(row, "组合职业关系主键")!, pair_id: text(row, "技能组合编号")!, occupation_code: text(row, "职业小类代码")!, occupation_name: text(row, "职业小类名称")!, probability: number(row, "掌握组合后进入该职业概率") ?? 0, concentration: number(row, "职业组合相对集中度") ?? 0 })), "id");
  await upsert("pair_city_stats", pairCities.map((row) => ({ id: text(row, "组合城市关系主键")!, pair_id: text(row, "技能组合编号")!, city: text(row, "城市")!, probability: number(row, "掌握组合后进入该城市概率") ?? 0, concentration: number(row, "城市组合相对集中度") ?? 0 })), "id");
}

async function importCurriculum(canonicalSkillNameLookup: ReadonlyMap<string, string>) {
  const [programs, majorSkills, occupationCatalog] = await Promise.all([
    readCsv(FILES.programs), readCsv(FILES.majorSkills), readCsv(FILES.occupationCatalog)
  ]);
  await upsert("major_programs", programs.map((row) => ({
    program_key: text(row, "专业主键")!, school: text(row, "学校")!, cohort: text(row, "年级")!, college: text(row, "学院"), major: text(row, "专业")!,
    direction: text(row, "专业方向_路径"), title: text(row, "培养方案标题"), major_code: text(row, "专业代码"), aliases: text(row, "专业别名"),
    training_objectives: text(row, "培养目标概括"), ability_requirements: text(row, "主要能力要求概括"), core_courses: text(row, "核心课程概括"),
    program_features: text(row, "培养特色概括"), degree_summary: text(row, "学制与学位概括")
  })), "program_key");
  await upsert("major_skills", majorSkills.map((row) => ({
    program_key: text(row, "专业主键")!, canonical_name: resolveCanonicalSkillName(sourceSkillName(row), canonicalSkillNameLookup), skill_type: text(row, "技能一级类型"),
    cluster_name: text(row, "技能簇名称"), supply_score: number(row, "技能供给原始分"), distinctiveness_score: number(row, "技能供给区分度得分"), rank: number(row, "专业内排名"),
    evidence_summary: text(row, "证据摘要"), mapping_basis: text(row, "映射依据"), is_representative: boolean(row, "是否代表性技能")
  })), "program_key,canonical_name");
  await upsert("occupation_catalog", occupationCatalog.filter((row) => text(row, "具体职业代码") && text(row, "具体职业名称")).map((row) => ({
    occupation_code: text(row, "具体职业代码")!, occupation_name: text(row, "具体职业名称")!, description: text(row, "具体职业描述"),
    subclass_code: text(row, "职业小类代码")!, subclass_name: text(row, "职业小类名称")!, major_code: text(row, "职业大类代码"), major_name: text(row, "职业大类名称"),
    middle_code: text(row, "职业中类代码"), middle_name: text(row, "职业中类名称"), is_displayable: boolean(row, "是否可展示"), source: text(row, "数据来源")
  })), "occupation_code");
}

async function importSupplemental(canonicalSkillNameLookup: ReadonlyMap<string, string>) {
  if (!["skill_yearly_trends.csv", "skill_monthly_trends.csv", "skill_ai_exposure.csv"].every((file) => existsSync(path.join(DATA_DIR, file)))) {
    console.log("supplemental: 未提供旧版趋势文件，跳过");
    return;
  }
  const [yearly, monthly, ai] = await Promise.all([readCsv("skill_yearly_trends.csv"), readCsv("skill_monthly_trends.csv"), readCsv("skill_ai_exposure.csv")]);
  await upsert("skill_yearly_trends", yearly.map((row) => ({ canonical_name: resolveCanonicalSkillName(sourceSkillName(row), canonicalSkillNameLookup), year: number(row, "年份")!, demand_per_10k: number(row, "每万岗位需求数") ?? number(row, "岗位需求每万岗位数预测"), salary_median: number(row, "月薪中位数") ?? number(row, "月薪中位数预测"), experience_mean: number(row, "最低经验年限均值") ?? number(row, "最低经验年限均值预测"), is_forecast: row["数据类型"] === "预测值" })), "canonical_name,year");
  const monthlyRows = deduplicateByKey(monthly.map((row) => ({ canonical_name: resolveCanonicalSkillName(sourceSkillName(row), canonicalSkillNameLookup), month: text(row, "月份")!, demand_per_10k: number(row, "每万岗位需求数"), salary_median: number(row, "月薪中位数"), experience_mean: number(row, "最低经验年限均值"), is_forecast: row["数据类型"] === "预测值" })), (row) => `${row.canonical_name}\u0000${row.month}`);
  await upsert("skill_monthly_trends", monthlyRows, "canonical_name,month");
  await upsert("skill_ai_exposure", ai.map((row) => ({ canonical_name: resolveCanonicalSkillName(sourceSkillName(row), canonicalSkillNameLookup), ai_group: text(row, "AI渗透率职业组")!, demand_share_2025: number(row, "2025年组内技能需求占比"), demand_share_2028: number(row, "2028年组内技能需求占比预测") })), "canonical_name,ai_group");
}

async function main() {
  const section = resolveImportSectionFromArgs(process.argv.slice(2));
  if (section === "all" || section === "skills") await importSkills();
  if (section === "skills") return;

  const canonicalSkillNameLookup = await loadCanonicalSkillNameLookup();
  if (section === "all" || section === "aliases") await importAliases(canonicalSkillNameLookup);
  if (section === "all" || section === "relations") await importRelations(canonicalSkillNameLookup);
  if (section === "all" || section === "curriculum") await importCurriculum(canonicalSkillNameLookup);
  if (section === "all" || section === "supplemental") await importSupplemental(canonicalSkillNameLookup);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
