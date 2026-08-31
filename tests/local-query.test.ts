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

  it("matches a CUEB cohort and major from natural language", () => {
    expect(parseCareerQuestionLocally(
      "我是首经贸2024级经济学（实验班）专业的学生，我会 Python",
      catalog,
      [{ programKey: "cueb-2024-econ-lab", school: "首都经济贸易大学", cohort: "2024级", major: "经济学（实验班）", aliases: ["经济学实验班"] }]
    )).toMatchObject({
      skills: ["Python"],
      programKey: "cueb-2024-econ-lab",
      school: "首都经济贸易大学",
      cohort: "2024级",
      major: "经济学（实验班）"
    });
  });
});
