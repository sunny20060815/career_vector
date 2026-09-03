import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import type { LocalProgramCatalogEntry } from "@/lib/local-query";

type CsvRow = Record<string, string>;

export interface LocalProgramRecord {
  programKey: string;
  school: string;
  cohort: string;
  college: string;
  major: string;
  majorCode: string;
  aliases: string;
  trainingObjectives: string;
  abilityRequirements: string;
  coreCourses: string;
  programFeatures: string;
  degreeSummary: string;
}

export interface LocalMajorSkillRecord {
  programKey: string;
  canonicalName: string;
  skillType: string;
  clusterName: string;
  rank: number;
  evidenceSummary: string;
  mappingBasis: string;
  isRepresentative: boolean;
}

export interface LocalOccupationRecord {
  subclassCode: string;
  subclassName: string;
  occupationName: string;
  description: string;
  isDisplayable: boolean;
}

interface LocalCurriculumData {
  programs: LocalProgramRecord[];
  majorSkills: LocalMajorSkillRecord[];
  occupations: LocalOccupationRecord[];
}

const DATA_DIRECTORY = path.join(process.cwd(), "data", "02_关系表");
const PROGRAMS_FILE = path.join(DATA_DIRECTORY, "09_专业培养方案主表.csv");
const MAJOR_SKILLS_FILE = path.join(DATA_DIRECTORY, "10_专业技能关系表.csv");
const OCCUPATIONS_FILE = path.join(DATA_DIRECTORY, "11_职业大典职业明细表.csv");
let cache: LocalCurriculumData | undefined;

function readCsv(file: string): CsvRow[] {
  return parse(readFileSync(file, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true
  }) as CsvRow[];
}

function value(row: CsvRow, key: string): string {
  return row[key]?.trim() ?? "";
}

export function loadLocalCurriculum(): LocalCurriculumData {
  if (cache) return cache;
  const programs = readCsv(PROGRAMS_FILE).map((row) => ({
    programKey: value(row, "专业主键"),
    school: value(row, "学校"),
    cohort: value(row, "年级"),
    college: value(row, "学院"),
    major: value(row, "专业"),
    majorCode: value(row, "专业代码"),
    aliases: value(row, "专业别名"),
    trainingObjectives: value(row, "培养目标概括"),
    abilityRequirements: value(row, "主要能力要求概括"),
    coreCourses: value(row, "核心课程概括"),
    programFeatures: value(row, "培养特色概括"),
    degreeSummary: value(row, "学制与学位概括")
  })).filter((row) => row.programKey && row.major);
  const majorSkills = readCsv(MAJOR_SKILLS_FILE).map((row) => ({
    programKey: value(row, "专业主键"),
    canonicalName: value(row, "标准技能名称"),
    skillType: value(row, "技能一级类型"),
    clusterName: value(row, "技能簇名称"),
    rank: Number(value(row, "专业内排名")) || 999,
    evidenceSummary: value(row, "证据摘要"),
    mappingBasis: value(row, "映射依据"),
    isRepresentative: value(row, "是否代表性技能") === "是"
  })).filter((row) => row.programKey && row.canonicalName);
  const occupations = readCsv(OCCUPATIONS_FILE).map((row) => ({
    subclassCode: value(row, "职业小类代码"),
    subclassName: value(row, "职业小类名称"),
    occupationName: value(row, "具体职业名称"),
    description: value(row, "具体职业描述"),
    isDisplayable: value(row, "是否可展示") === "是"
  })).filter((row) => row.subclassCode && row.occupationName);
  cache = { programs, majorSkills, occupations };
  return cache;
}

export function localProgramCatalog(): LocalProgramCatalogEntry[] {
  return loadLocalCurriculum().programs.map((program) => ({
    programKey: program.programKey,
    school: program.school,
    cohort: program.cohort,
    major: program.major,
    aliases: program.aliases.split("|").map((alias) => alias.trim()).filter(Boolean)
  }));
}

export function localProgramEvidence(programKey: string, skillLimit = 12): { program: LocalProgramRecord | null; skills: LocalMajorSkillRecord[] } {
  const data = loadLocalCurriculum();
  const program = data.programs.find((row) => row.programKey === programKey) ?? null;
  const skills = data.majorSkills
    .filter((row) => row.programKey === programKey && row.isRepresentative)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, skillLimit);
  return { program, skills };
}

export function localProgramSeriesEvidence(programKey: string, skillLimit = 20): Array<{ program: LocalProgramRecord; skills: LocalMajorSkillRecord[] }> {
  const data = loadLocalCurriculum();
  const current = data.programs.find((row) => row.programKey === programKey);
  if (!current) return [];
  return data.programs
    .filter((program) => program.school === current.school && program.major === current.major)
    .sort((left, right) => left.cohort.localeCompare(right.cohort, "zh-CN"))
    .map((program) => ({
      program,
      skills: data.majorSkills
        .filter((skill) => skill.programKey === program.programKey && skill.isRepresentative)
        .sort((left, right) => left.rank - right.rank)
        .slice(0, skillLimit)
    }));
}

export function localOccupationEvidence(codes: string[]): LocalOccupationRecord[] {
  const selected = new Set(codes);
  return loadLocalCurriculum().occupations.filter((row) => selected.has(row.subclassCode) && row.isDisplayable);
}
