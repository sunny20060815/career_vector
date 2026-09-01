import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

interface AiCooccurrenceRecord {
  cooccurrence: number | null;
  share: number | null;
}

let cache: Map<string, AiCooccurrenceRecord> | undefined;

export function localAiCooccurrence(): Map<string, AiCooccurrenceRecord> {
  if (cache) return cache;
  const rows = parse(readFileSync(path.join(process.cwd(), "data", "02_关系表", "08_AI技能共现关系表.csv"), "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true
  }) as Array<Record<string, string>>;
  cache = new Map(rows.map((row) => [row["标准技能名称"], {
    cooccurrence: Number.isFinite(Number(row["与AI共现强度_NPMI"])) ? Number(row["与AI共现强度_NPMI"]) : null,
    share: Number.isFinite(Number(row["历史AI协同占比"])) ? Number(row["历史AI协同占比"]) : null
  }]));
  return cache;
}
