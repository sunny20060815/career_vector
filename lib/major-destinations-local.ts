import { loadLocalCurriculum } from "@/lib/curriculum-local";
import majorDestinationIndex from "@/lib/generated/major-destination-priors.json";
import type { MajorDestinationPrior } from "@/lib/ranking";

type CompactPrior = [string, string, string, string, string, string, string, string, string];
type MajorIndex = Record<string, { majorName: string; rows: CompactPrior[] }>;
const index = majorDestinationIndex as unknown as MajorIndex;
const majorNameAliases: Record<string, string> = {
  "注册会计师专门化": "会计学",
  "金融学+数据科学与大数据技术": "金融学"
};

function baseMajorName(value: string): string {
  return value.replace(/[（(][^）)]*[）)]/g, "").replace(/专业$/, "").trim();
}

function normalizedMajorCode(value: string): string {
  return value.match(/\d{6}/)?.[0] ?? value.trim();
}

function indexEntryForName(value: string): [string, MajorIndex[string]] | undefined {
  const baseName = majorNameAliases[value] ?? baseMajorName(value);
  return Object.entries(index).find(([, entry]) => baseMajorName(entry.majorName) === baseName)
    ?? Object.entries(index)
      .filter(([, entry]) => value === entry.majorName || value.startsWith(`${entry.majorName}（`) || value.startsWith(`${entry.majorName}(`) || value.startsWith(`${entry.majorName}-`))
      .sort((left, right) => right[1].majorName.length - left[1].majorName.length)[0];
}

export function resolveLocalMajor(programKey: string): { majorCode: string; majorName: string; inputMajorName: string } | null {
  const programs = loadLocalCurriculum().programs;
  const current = programs.find((program) => program.programKey === programKey);
  if (!current) return null;
  let majorCode = current.majorCode || programs.find((program) =>
    program.school === current.school && baseMajorName(program.major) === baseMajorName(current.major) && program.majorCode
  )?.majorCode || "";
  majorCode = normalizedMajorCode(majorCode);
  const matched = (majorCode && index[majorCode] ? [majorCode, index[majorCode]] : indexEntryForName(current.major)) as [string, MajorIndex[string]] | undefined;
  if (!majorCode && matched) majorCode = matched[0];
  return { majorCode, majorName: matched?.[1].majorName ?? baseMajorName(current.major), inputMajorName: current.major };
}

export function localMajorDestinationPriors(majorCode: string, majorName: string): MajorDestinationPrior[] {
  const entry = index[normalizedMajorCode(majorCode)]
    ?? Object.values(index).find((item) => baseMajorName(item.majorName) === baseMajorName(majorName));
  return (entry?.rows ?? []).map((row) => ({
      occupationCode: row[0],
      occupationName: row[1],
      destinationName: row[2],
      destinationShare: Number(row[3]) || null,
      displayRank: Number(row[4]) || 999,
      directionType: row[5],
      dataScope: row[6],
      destinationTier: row[7],
      mappingConfidence: row[8]
    }))
    .filter((row) => row.occupationCode && row.occupationName);
}
