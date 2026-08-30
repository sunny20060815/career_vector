import { describe, expect, it } from "vitest";

import { normaliseSkillToken, validateParsedCareerQuery } from "@/lib/query";

describe("normaliseSkillToken", () => {
  it("removes formatting differences from a skill token", () => {
    expect(normaliseSkillToken(" Microsoft SQL-Server （数据库） ")).toBe("microsoftsqlserver数据库");
  });
});

describe("validateParsedCareerQuery", () => {
  it("uses the latest forecast year when the model omits it", () => {
    const result = validateParsedCareerQuery({
      skills: ["Python", "药学"],
      cities: ["上海"],
      salaryMinYuan: 12000,
      salaryMaxYuan: null,
      experienceYears: 2,
      education: "bachelor",
      forecastYear: null,
      intent: "career_recommendation"
    });

    expect(result.forecastYear).toBe(2028);
    expect(result.skills).toEqual(["Python", "药学"]);
  });

  it("rejects a model response with an unknown intent", () => {
    expect(() => validateParsedCareerQuery({ skills: [], intent: "free_text" })).toThrow("意图类型");
  });
});
