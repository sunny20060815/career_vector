import { describe, expect, it } from "vitest";

import { localMajorDestinationPriors, resolveLocalMajor } from "@/lib/major-destinations-local";

describe("local major destination evidence", () => {
  it("recovers the national major code from another cohort when needed", () => {
    const resolved = resolveLocalMajor("CUEB-2025-130");
    expect(resolved?.majorName).toContain("经济学");
    expect(resolved?.majorCode).toBe("020101");
  });

  it("loads mapped economics destinations without treating study routes as occupations", () => {
    const rows = localMajorDestinationPriors("020101", "经济学（实验班）");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.destinationName.includes("财务") || row.destinationName.includes("经济"))).toBe(true);
    expect(rows.every((row) => row.occupationCode && row.occupationName)).toBe(true);
  });

  it("gives education majors teacher-related destinations", () => {
    const rows = localMajorDestinationPriors("040113", "融合教育");
    expect(rows.some((row) => /教师/.test(row.destinationName))).toBe(true);
  });

  it("normalizes special major-code suffixes", () => {
    const rows = localMajorDestinationPriors("030101K", "法学");
    expect(rows.length).toBeGreaterThan(0);
  });
});
