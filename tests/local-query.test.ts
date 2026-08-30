import { describe, expect, it } from "vitest";

import { parseCareerQuestionLocally } from "@/lib/local-query";

const catalog = [
  { canonicalName: "Python", aliases: ["python", "Python 编程"] },
  { canonicalName: "沟通能力", aliases: ["沟通", "沟通能力"] },
  { canonicalName: "药学", aliases: ["药学", "药物学"] }
];

describe("parseCareerQuestionLocally", () => {
  it("extracts skills and preferences without waiting for a model", () => {
    expect(
      parseCareerQuestionLocally(
        "我会 Python、沟通能力和药学，想去上海，期望月薪 15000 元，准备看 2028 年趋势。",
        catalog
      )
    ).toMatchObject({
      skills: ["Python", "沟通能力", "药学"],
      cities: ["上海"],
      salaryMinYuan: 15000,
      salaryMaxYuan: 15000,
      forecastYear: 2028,
      intent: "career_recommendation"
    });
  });
});
