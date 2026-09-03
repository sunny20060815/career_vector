import { describe, expect, it } from "vitest";

import { parseCareerQuestionLocally } from "@/lib/local-query";
import { mergeCareerQueryContext } from "@/lib/query";

const catalog = [
  { canonicalName: "Python", aliases: ["python", "Python 编程"] },
  { canonicalName: "沟通能力", aliases: ["沟通", "沟通能力"] },
  { canonicalName: "药学", aliases: ["药学", "药物学"] },
  { canonicalName: "财务分析", aliases: ["财务分析"] },
  { canonicalName: "Excel", aliases: ["Excel"] },
  { canonicalName: "人工智能技术", aliases: ["AI", "人工智能"] },
  { canonicalName: "机器学习", aliases: ["机器学习"] },
  { canonicalName: "统计分析", aliases: ["统计分析"] }
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

  it("inherits skills and curriculum context across follow-up questions", () => {
    const previous = parseCareerQuestionLocally("我是首经贸2024级经济学（实验班）学生，会 Python", catalog, [{ programKey: "cueb-2024-econ-lab", school: "首都经济贸易大学", cohort: "2024级", major: "经济学（实验班）", aliases: ["经济学实验班"] }]);
    const followUp = parseCareerQuestionLocally("培养方案中的哪些课程最有助于进入软件和信息技术服务人员？", catalog);

    expect(mergeCareerQueryContext(followUp, previous)).toMatchObject({
      skills: ["Python"],
      programKey: "cueb-2024-econ-lab",
      school: "首都经济贸易大学",
      cohort: "2024级",
      major: "经济学（实验班）"
    });
  });

  it("does not mistake AI as a confirmed skill in an AI impact question", () => {
    expect(parseCareerQuestionLocally("我会财务分析和 Excel，AI 更可能辅助还是替代哪些工作任务？", catalog)).toMatchObject({
      skills: ["财务分析", "Excel"],
      confirmedSkills: ["财务分析", "Excel"]
    });
  });

  it("routes skill investment comparisons without claiming the compared skill is mastered", () => {
    expect(parseCareerQuestionLocally("计量经济学和机器学习在就业上哪个更值得优先投入？", catalog)).toMatchObject({
      skills: ["机器学习"],
      confirmedSkills: [],
      intent: "job_comparison"
    });
  });

  it("routes a next-skill question to skill growth before generic comparison", () => {
    expect(parseCareerQuestionLocally("我会 Python 和统计分析，下一步最值得补什么技能？它会怎样改变我的职业、工资与城市选择？", catalog)).toMatchObject({
      skills: ["Python", "统计分析"],
      intent: "skill_growth"
    });
  });

  it("recognizes an explicitly named occupation direction", () => {
    expect(parseCareerQuestionLocally(
      "我想进入数字技术工程技术人员方向，最常用哪些技能？",
      catalog,
      [],
      [{ subclassName: "数字技术工程技术人员", aliases: ["人工智能工程技术人员"] }]
    )).toMatchObject({ occupationKeywords: ["数字技术工程技术人员"], intent: "career_recommendation" });
  });

  it("recognizes a common occupation alias instead of requiring the full catalog name", () => {
    expect(parseCareerQuestionLocally(
      "我想做人工智能工程师，这个方向常用哪些技能？",
      catalog,
      [],
      [{ subclassName: "数字技术工程技术人员", aliases: ["人工智能工程师", "大数据工程师"] }]
    )).toMatchObject({ occupationKeywords: ["数字技术工程技术人员"], intent: "career_recommendation" });
  });
});
