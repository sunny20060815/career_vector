export interface SkillAliasImportRow extends Record<string, string> {
  canonical_name: string;
  alias: string;
  normalized_alias: string;
}

export interface CanonicalSkillName {
  canonicalName: string;
  aliases?: readonly string[];
}

export const importSections = ["skills", "aliases", "relations", "supplemental"] as const;

export type ImportSection = (typeof importSections)[number] | "all";

export function resolveImportSection(value: string | undefined): ImportSection {
  if (!value || value === "all") return "all";
  if (importSections.some((section) => section === value)) return value as (typeof importSections)[number];
  throw new Error(`未知的 IMPORT_SECTION: ${value}`);
}

export function resolveImportSectionFromArgs(args: readonly string[]): ImportSection {
  const sectionIndex = args.indexOf("--section");
  return resolveImportSection(sectionIndex === -1 ? undefined : args[sectionIndex + 1]);
}

export function normaliseSkillName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN").replace(/[\s_\-—－/\\（）()]+/g, "");
}

export function createCanonicalSkillNameLookup(
  canonicalSkills: readonly CanonicalSkillName[]
): Map<string, string> {
  return new Map(
    canonicalSkills.flatMap(({ canonicalName, aliases = [] }) =>
      [canonicalName, ...aliases].map((name) => [normaliseSkillName(name), canonicalName] as const)
    )
  );
}

export function resolveCanonicalSkillName(sourceName: string, lookup: ReadonlyMap<string, string>): string {
  return lookup.get(normaliseSkillName(sourceName)) ?? sourceName;
}

export function orderSkillPair(first: string, second: string): [string, string] {
  return first.localeCompare(second, "en-US") < 0 ? [first, second] : [second, first];
}

export function deduplicateByKey<T>(rows: readonly T[], keyForRow: (row: T) => string): T[] {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = keyForRow(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deduplicateSkillAliases(rows: readonly SkillAliasImportRow[]): SkillAliasImportRow[] {
  return deduplicateByKey(rows, (row) => `${row.canonical_name}\u0000${row.normalized_alias}`);
}

export function canonicaliseSkillAliases(
  rows: readonly SkillAliasImportRow[],
  canonicalSkills: readonly CanonicalSkillName[]
): SkillAliasImportRow[] {
  const canonicalByNormalisedName = createCanonicalSkillNameLookup(canonicalSkills);

  return rows.map((row) => ({
    ...row,
    canonical_name: resolveCanonicalSkillName(row.canonical_name, canonicalByNormalisedName)
  }));
}
