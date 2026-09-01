import { describe, expect, it } from "vitest";

import { localOccupationEvidence, localProgramCatalog, localProgramEvidence } from "@/lib/curriculum-local";
import { parseCareerQuestionLocally } from "@/lib/local-query";

describe("local curriculum fallback", () => {
  it("loads the 2024 CUEB economics experimental program and representative skills", () => {
    const catalog = localProgramCatalog();
    const program = catalog.find((row) => row.cohort === "2024级" && row.major === "经济学（实验班）");

    expect(program?.programKey).toBe("CUEB-2024-086");
    const evidence = localProgramEvidence(program!.programKey);
    expect(evidence.program?.coreCourses).toContain("计量经济学");
    expect(evidence.skills.map((row) => row.canonicalName)).toContain("统计分析");
  });

  it("recognizes a natural-language school, cohort and major description", () => {
    const query = parseCareerQuestionLocally(
      "我是首经贸2024级经济学（实验班）专业的学生，我会Python、Stata和R语言",
      [
        { canonicalName: "Python", aliases: ["python"] },
        { canonicalName: "Stata", aliases: ["stata"] },
        { canonicalName: "R", aliases: ["R语言"] }
      ],
      localProgramCatalog()
    );

    expect(query.programKey).toBe("CUEB-2024-086");
    expect(query.skills).toEqual(["Python", "Stata", "R"]);
  });

  it("loads displayable occupations from the national catalog", () => {
    const occupations = localOccupationEvidence(["1-01-00"]);
    expect(occupations.length).toBeGreaterThan(0);
    expect(occupations.every((row) => row.isDisplayable)).toBe(true);
  });
});
