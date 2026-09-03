import { describe, expect, it } from "vitest";

import { fallbackCareerPlan, parseCareerQueryPlan } from "@/lib/career-plan";
import { parseCareerQuestionLocally } from "@/lib/local-query";

const catalog = [
  { canonicalName: "Excel", aliases: ["Excel"] },
  { canonicalName: "财务分析", aliases: ["财务分析"] },
  { canonicalName: "机器学习", aliases: ["机器学习"] },
  { canonicalName: "Python", aliases: ["Python"] },
  { canonicalName: "Stata", aliases: ["Stata"] },
  { canonicalName: "统计分析", aliases: ["统计分析"] }
];

describe("career evidence planning", () => {
  it("keeps a program and skill introduction on the comprehensive recommendation route", () => {
    const question = "我是首经贸2024级经济学（实验班）专业的学生，我会Stata";
    const query = parseCareerQuestionLocally(question, catalog, [{
      programKey: "cueb-2024-economics-experimental",
      school: "首都经济贸易大学",
      cohort: "2024级",
      major: "经济学（实验班）",
      aliases: ["经济学实验班"]
    }]);
    const plan = parseCareerQueryPlan('{"route":"adaptive","answerStyle":"skill_growth","modules":["skill_pairs","next_skills"],"focus":"推荐下一技能"}', question, query);

    expect(plan).toMatchObject({
      route: "standard",
      answerStyle: "recommendation",
      focus: "结合培养方案与用户确认技能生成综合职业规划"
    });
    expect(plan.modules).toEqual(expect.arrayContaining(["curriculum", "skill_profiles", "occupations", "cities", "ai_impact"]));
  });

  it("uses the adaptive AI task route and only requests relevant modules", () => {
    const question = "我会财务分析和 Excel，AI 更可能辅助还是替代哪些工作任务？";
    const query = parseCareerQuestionLocally(question, catalog);
    expect(fallbackCareerPlan(question, query)).toMatchObject({
      route: "adaptive",
      answerStyle: "ai_tasks",
      modules: ["skill_profiles", "ai_impact", "occupations", "skill_pairs"]
    });
  });

  it("accepts a model-selected allowlist and enforces required skill evidence", () => {
    const question = "计量经济学和机器学习哪个更值得投入？";
    const query = parseCareerQuestionLocally(question, catalog);
    const plan = parseCareerQueryPlan('{"route":"adaptive","answerStyle":"comparison","modules":["skill_pairs"],"focus":"比较技能"}', question, query);
    expect(plan.modules).toEqual(["skill_profiles", "skill_pairs", "occupations"]);
    expect(plan.focus).toBe("围绕用户给出的选项作直接比较并给出优先级");
  });

  it("keeps next-skill questions on the complete skill-growth evidence path", () => {
    const question = "我会 Python 和统计分析，下一步最值得补什么技能？它会怎样改变我的职业、工资与城市选择？";
    const query = parseCareerQuestionLocally(question, catalog);
    const plan = parseCareerQueryPlan('{"route":"adaptive","answerStyle":"comparison","modules":["skill_profiles"],"focus":"普通比较"}', question, query);

    expect(plan).toMatchObject({
      answerStyle: "skill_growth",
      modules: ["skill_profiles", "skill_pairs", "next_skills", "occupations", "cities"]
    });
  });

  it("forces curriculum designers onto the curriculum diagnosis route", () => {
    const question = "请诊断首经贸2025级经济学（实验班）培养方案";
    const query = parseCareerQuestionLocally(question, catalog, [{
      programKey: "cueb-2025-economics-experimental",
      school: "首都经济贸易大学",
      cohort: "2025级",
      major: "经济学（实验班）",
      aliases: ["经济学实验班"]
    }]);
    const plan = parseCareerQueryPlan('{"route":"standard","answerStyle":"recommendation","modules":["occupations"],"focus":"个人求职"}', question, query, "curriculum_designer");

    expect(plan).toMatchObject({ route: "adaptive", answerStyle: "curriculum_design" });
    expect(plan.modules).toEqual(expect.arrayContaining(["curriculum", "skill_profiles", "occupations", "ai_impact"]));
  });
});
