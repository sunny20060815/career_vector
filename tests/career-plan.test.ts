import { describe, expect, it } from "vitest";

import { fallbackCareerPlan, parseCareerQueryPlan } from "@/lib/career-plan";
import { parseCareerQuestionLocally } from "@/lib/local-query";

const catalog = [
  { canonicalName: "Excel", aliases: ["Excel"] },
  { canonicalName: "财务分析", aliases: ["财务分析"] },
  { canonicalName: "机器学习", aliases: ["机器学习"] }
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
    expect(plan.modules).toEqual(["skill_pairs", "skill_profiles"]);
    expect(plan.focus).toBe("比较技能");
  });
});
