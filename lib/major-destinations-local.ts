import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { loadLocalCurriculum } from "@/lib/curriculum-local";
import type { MajorDestinationPrior } from "@/lib/ranking";

type CsvRow = Record<string, string>;

const FILE = path.join(process.cwd(), "data", "02_关系表", "13_专业职业先验表.csv");
let cache: CsvRow[] | undefined;

function rows(): CsvRow[] {
  cache ??= parse(readFileSync(FILE, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true
  }) as CsvRow[];
  return cache;
}

function baseMajorName(value: string): string {
  return value.replace(/[（(][^）)]*[）)]/g, "").replace(/专业$/, "").trim();
}

function normalizedMajorCode(value: string): string {
  return value.match(/\d{6}/)?.[0] ?? value.trim();
}

export function resolveLocalMajor(programKey: string): { majorCode: string; majorName: string } | null {
  const programs = loadLocalCurriculum().programs;
  const current = programs.find((program) => program.programKey === programKey);
  if (!current) return null;
  const majorCode = current.majorCode || programs.find((program) =>
    program.school === current.school && baseMajorName(program.major) === baseMajorName(current.major) && program.majorCode
  )?.majorCode || "";
  return { majorCode: normalizedMajorCode(majorCode), majorName: current.major };
}

export function localMajorDestinationPriors(majorCode: string, majorName: string): MajorDestinationPrior[] {
  const baseName = baseMajorName(majorName);
  return rows()
    .filter((row) => row["是否用于职业排序"] === "是")
    .filter((row) => majorCode ? normalizedMajorCode(row["专业代码"] ?? "") === normalizedMajorCode(majorCode) : baseMajorName(row["专业名称"] ?? "") === baseName)
    .map((row) => ({
      occupationCode: row["职业小类代码"]?.trim() ?? "",
      occupationName: row["职业小类名称"]?.trim() ?? "",
      destinationName: row["去向名称"]?.trim() ?? "",
      destinationShare: Number(row["去向占比"]) || null,
      displayRank: Number(row["展示顺序"]) || 999,
      directionType: row["去向类型"]?.trim() ?? "",
      dataScope: row["数据口径"]?.trim() ?? "",
      destinationTier: row["专业去向层级"]?.trim() ?? "",
      mappingConfidence: row["映射置信度"]?.trim() ?? ""
    }))
    .filter((row) => row.occupationCode && row.occupationName);
}
