export interface SkillPair {
  id: string;
  skillA: string;
  skillB: string;
}

export interface OccupationSkillStat {
  skill: string;
  code: string;
  name: string;
  probability: number;
  concentration: number;
  futureDemandRatio: number;
}

export interface PairOccupationStat {
  pairId: string;
  code: string;
  probability: number;
  concentration: number;
}

export interface RankedOccupation {
  code: string;
  name: string;
  score: number;
  matchedSkills: string[];
  observedPairCount: number;
}

function pairKey(left: string, right: string): string {
  return [left, right].sort((a, b) => a.localeCompare(b, "zh-CN")).join("\u0000");
}

function relative(value: number, maximum: number): number {
  return maximum > 0 ? Math.max(value, 0) / maximum : 0;
}

export function selectObservedPairs(skills: readonly string[], pairs: readonly SkillPair[]): string[] {
  const selected = new Set(skills);
  return pairs
    .filter((pair) => selected.has(pair.skillA) && selected.has(pair.skillB) && pair.skillA !== pair.skillB)
    .map((pair) => pair.id);
}

export function rankOccupations(
  skills: readonly string[],
  stats: readonly OccupationSkillStat[],
  pairStats: readonly PairOccupationStat[]
): RankedOccupation[] {
  if (skills.length === 0) {
    return [];
  }

  const evidence = new Map<string, { name: string; values: Map<string, number> }>();
  for (const skill of skills) {
    const rows = stats.filter((row) => row.skill === skill);
    const maxProbability = Math.max(...rows.map((row) => row.probability), 0);
    const maxConcentration = Math.max(...rows.map((row) => Math.log1p(row.concentration)), 0);
    const maxDemand = Math.max(...rows.map((row) => row.futureDemandRatio), 0);

    for (const row of rows) {
      const value =
        0.4 * relative(row.probability, maxProbability) +
        0.35 * relative(Math.log1p(row.concentration), maxConcentration) +
        0.25 * relative(row.futureDemandRatio, maxDemand);
      if (value < 0.15) {
        continue;
      }
      const current = evidence.get(row.code) ?? { name: row.name, values: new Map<string, number>() };
      current.values.set(skill, value);
      evidence.set(row.code, current);
    }
  }

  const pairByOccupation = new Map<string, number[]>();
  for (const row of pairStats) {
    const value = 0.65 * Math.max(row.probability, 0) + 0.35 * Math.log1p(Math.max(row.concentration, 0));
    const current = pairByOccupation.get(row.code) ?? [];
    current.push(value);
    pairByOccupation.set(row.code, current);
  }
  const hasPairEvidence = pairStats.length > 0;

  return Array.from(evidence.entries())
    .map(([code, occupation]) => {
      const matchedSkills = skills.filter((skill) => occupation.values.has(skill));
      const singleScore = Array.from(occupation.values.values()).reduce((sum, value) => sum + value, 0) / skills.length;
      const coverage = matchedSkills.length / skills.length;
      const baseScore = 0.7 * singleScore + 0.3 * coverage;
      const pairEvidence = pairByOccupation.get(code) ?? [];
      const pairScore = pairEvidence.length
        ? pairEvidence.reduce((sum, value) => sum + value, 0) / pairEvidence.length
        : 0;
      const pairWeight = hasPairEvidence ? 0.2 : 0;
      return {
        code,
        name: occupation.name,
        score: Math.round(1000 * ((1 - pairWeight) * baseScore + pairWeight * pairScore)) / 10,
        matchedSkills,
        observedPairCount: pairEvidence.length
      };
    })
    .sort((left, right) => right.score - left.score || right.matchedSkills.length - left.matchedSkills.length)
    .slice(0, 10);
}

export function pairLookupKey(skillA: string, skillB: string): string {
  return pairKey(skillA, skillB);
}
