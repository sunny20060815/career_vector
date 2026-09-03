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
      focus: "结合培养方案、专业就业去向与用户确认技能生成综合职业规划"
    });
    expect(plan.modules).toEqual(expect.arrayContaining(["curriculum", "major_destinations", "skill_profiles", "occupations", "cities", "ai_impact"]));
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

  it("accepts only confident semantic occupation targets from recalled candidates", () => {
    const question = "我是首经贸2024级经济统计学学生，想进入AI技术相关职业，请给我学习建议。";
    const query = {
      ...parseCareerQuestionLocally(question, catalog),
      occupationCandidates: ["数字技术工程技术人员", "软件和信息技术服务人员"]
    };
    const plan = parseCareerQueryPlan(
      '{"route":"standard","answerStyle":"learning_plan","modules":["occupations","curriculum"],"focus":"AI技术职业学习路径","occupationTargets":["数字技术工程技术人员"],"occupationTargetConfidence":0.94}',
      question,
      query
    );

    expect(plan.occupationTargets).toEqual(["数字技术工程技术人员"]);
    expect(plan.occupationTargetConfidence).toBe(0.94);
  });

  it("keeps an explicit natural-language career target when semantic planning falls back", () => {
    const question = "我是首经贸2024级经济统计学专业学生，想进入ai技术相关职业。请结合培养方案和岗位需求，给我一份分阶段学习建议。";
    const query = parseCareerQuestionLocally(question, [
      { canonicalName: "人工智能技术", aliases: ["AI", "人工智能"] }
    ]);
    const plan = parseCareerQueryPlan("", question, query);

    expect(query.occupationKeywords).toEqual([]);
    expect(query.occupationCandidates).toEqual(["数字技术工程技术人员"]);
    expect(plan).toMatchObject({
      answerStyle: "learning_plan",
      occupationTargets: ["数字技术工程技术人员"],
      occupationTargetConfidence: 0.7
    });
  });

  it("does not discard the deterministic target when the planner returns low confidence", () => {
    const question = "我想进入AI技术相关职业，请给我学习建议。";
    const query = parseCareerQuestionLocally(question, [
      { canonicalName: "人工智能技术", aliases: ["AI", "人工智能"] }
    ]);
    const plan = parseCareerQueryPlan(
      '{"route":"standard","answerStyle":"learning_plan","modules":["occupations"],"focus":"AI职业路径","occupationTargets":[],"occupationTargetConfidence":0.4}',
      question,
      query
    );

    expect(plan.occupationTargets).toEqual(["数字技术工程技术人员"]);
  });

  it("accepts a semantic target selected from the full occupation options", () => {
    const question = "我想进入芯片研发相关职业，请给我学习建议。";
    const query = parseCareerQuestionLocally(question, catalog, [], [
      { subclassName: "电子工程技术人员", aliases: ["集成电路工程技术人员"] },
      { subclassName: "数字技术工程技术人员", aliases: ["人工智能工程技术人员"] }
    ]);
    const plan = parseCareerQueryPlan(
      '{"route":"standard","answerStyle":"learning_plan","modules":["occupations","curriculum"],"focus":"芯片研发职业路径","occupationTargets":["电子工程技术人员"],"occupationTargetConfidence":0.93}',
      question,
      query
    );

    expect(plan.occupationTargets).toEqual(["电子工程技术人员"]);
    expect(plan.occupationTargetConfidence).toBe(0.93);
  });
});
