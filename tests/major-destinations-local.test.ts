import { describe, expect, it } from "vitest";

import { localMajorDestinationPriors, resolveLocalMajor } from "@/lib/major-destinations-local";
import { loadLocalCurriculum } from "@/lib/curriculum-local";

describe("local major destination evidence", () => {
  it("recovers the national major code from another cohort when needed", () => {
    const resolved = resolveLocalMajor("CUEB-2025-130");
    expect(resolved?.inputMajorName).toBe("经济学（实验班）");
    expect(resolved?.majorName).toBe("经济学");
    expect(resolved?.majorCode).toBe("020101");
  });

  it("maps program variants to standard majors across disciplines", () => {
    expect(resolveLocalMajor("CUEB-2025-123")).toMatchObject({ majorName: "市场营销", majorCode: "120202" });
    expect(resolveLocalMajor("CUEB-2025-133")).toMatchObject({ majorName: "会计学", majorCode: "120203" });
    expect(resolveLocalMajor("CUEB-2025-135")).toMatchObject({ majorName: "财务管理", majorCode: "120204" });
    expect(resolveLocalMajor("CUEB-2025-154")).toMatchObject({ majorName: "法学", majorCode: "030101" });
    expect(resolveLocalMajor("CUEB-2025-167")).toMatchObject({ majorName: "统计学", majorCode: "071201" });
    expect(resolveLocalMajor("CUEB-2025-134")).toMatchObject({ majorName: "会计学", majorCode: "120203" });
    expect(resolveLocalMajor("CUEB-2025-158")).toMatchObject({ majorName: "金融学", majorCode: "020301" });
  });

  it("provides a standard major and destination priors for every valid curriculum", () => {
    for (const program of loadLocalCurriculum().programs) {
      const major = resolveLocalMajor(program.programKey);
      expect(major?.majorCode, program.major).toMatch(/^\d{6}$/);
      expect(localMajorDestinationPriors(major?.majorCode ?? "", major?.majorName ?? program.major).length, program.major).toBeGreaterThan(0);
    }
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
