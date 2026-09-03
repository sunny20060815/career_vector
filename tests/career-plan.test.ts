import { describe, expect, it } from "vitest";

import { fallbackCareerPlan, parseCareerQueryPlan } from "@/lib/career-plan";
import { parseCareerQuestionLocally } from "@/lib/local-query";

const catalog = [
  { canonicalName: "Excel", aliases: ["Excel"] },
  { canonicalName: "财务分析", aliases: ["财务分析"] },
  { canonicalName: "机器学习", aliases: ["机器学习"] },
  { canonicalName: "Python", aliases: ["Python"] },
  { canonicalName: "统计分析", aliases: ["统计分析"] }
];

describe("career evidence planning", () => {
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
});
