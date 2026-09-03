import { describe, expect, it } from "vitest";

import {
  CAREER_ADVISOR_SYSTEM_PROMPT,
  buildCareerAdvisorMessages,
  buildDeepSeekPayload,
  isAdequateCurriculumDesignerAnswer,
  limitCareerAnswer,
  parseCareerAdvisorOutput
} from "@/lib/deepseek";

describe("buildDeepSeekPayload", () => {
  it("enables server-side thinking and reserves tokens for a detailed visible answer", () => {
    const payload = buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "enabled");

    expect(payload).toMatchObject({
      model: "deepseek-v4-flash",
      stream: false,
      max_tokens: 6000,
      thinking: { type: "enabled" }
    });
    expect(payload).not.toHaveProperty("temperature");
  });

  it("can disable thinking only through explicit server configuration", () => {
    expect(buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "disabled")).toMatchObject({
      max_tokens: 6000,
      thinking: { type: "disabled" }
    });
  });

  it("keeps a long model response concise at a sentence boundary", () => {
    const answer = `${"职业建议。".repeat(200)}最后一句。`;
    const limited = limitCareerAnswer(answer, 120);

    expect(limited.length).toBeLessThanOrEqual(120);
    expect(limited.endsWith("。")).toBe(true);
  });

  it("preserves a complete detailed answer up to 4200 characters at a sentence boundary", () => {
    const limited = limitCareerAnswer("职业建议。".repeat(1000) + "最后一句。");

    expect(limited.length).toBe(4200);
    expect(limited.endsWith("。")).toBe(true);
  });

  it("passes curriculum, occupation catalog, AI exposure and AI cooccurrence evidence to the model", () => {
    const messages = buildCareerAdvisorMessages("我会 Python", {
      curriculum: { major: "经济学（实验班）" },
      occupationDetails: [{ subclassName: "工程技术人员" }],
      aiExposureDetails: [{ aiGroup: "高AI渗透率", demandShare2025: 0.2 }],
      aiCooccurrenceSource: "local_csv"
    });

    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("AI 技能共现");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("课程体系主要由哪些训练模块构成");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("基础理论—定量或工具训练—综合应用");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("不得虚构第几学期");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("AI 时代就业策略");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("不得把平台已经能够完成的数据检索工作重新交给用户");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("<suggested_questions>");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("recognizedSkills 为空不等于问题无法回答");
    expect(messages.at(-1)?.content).toContain("\"curriculum\"");
    expect(messages.at(-1)?.content).toContain("\"occupationDetails\"");
    expect(messages.at(-1)?.content).toContain("\"aiExposureDetails\"");
    expect(messages.at(-1)?.content).toContain("\"aiCooccurrenceSource\"");
  });

  it("prioritizes an actionable career decision over a report-style evidence dump", () => {
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("建议优先");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("培养方案推断能力");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("默认回答结构");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("报告式结构");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("只规定本轮必须覆盖的决策内容，不是固定模板");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("不得为了覆盖上述内容机械使用相同的小标题或句式");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("targetOccupationSkills");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("700-1100 个汉字");
  });

  it("separates the visible answer from clickable follow-up questions", () => {
    const output = parseCareerAdvisorOutput('建议优先学习 SQL。\n<suggested_questions>["SQL会带来哪些职业变化？","哪些城市更需要这项技能？","AI会如何影响目标职业？"]</suggested_questions>');

    expect(output.answer).toBe("建议优先学习 SQL。");
    expect(output.suggestedQuestions).toEqual(["SQL会带来哪些职业变化？", "哪些城市更需要这项技能？", "AI会如何影响目标职业？"]);
  });

  it("normalizes escaped Markdown and literal line breaks", () => {
    const output = parseCareerAdvisorOutput("\\\\*\\\\*优先建议\\\\*\\\\*\\\\n1\\\\. 学习 SQL");

    expect(output.answer).toBe("**优先建议**\n1. 学习 SQL");
  });

  it("rejects short or incomplete curriculum-designer answers", () => {
    const evidence = { curriculum: { major: "经济学（实验班）" }, curriculumVersions: [{ cohort: "2023级" }, { cohort: "2025级" }] };
    const adequate = `${"该培养方案以专业理论和定量课程为基础，并与招聘岗位的技能需求进行对照。".repeat(12)}历年版本变化显示课程能力供给总体延续。建议保留理论基础，强化数据实践，整合课程项目并调整课程衔接。招聘样本主要来自上市公司，不能单独决定培养方案，还需结合学科定位、师资条件和学生长期发展审议。`;

    expect(isAdequateCurriculumDesignerAnswer("建议增加热门课程。", evidence)).toBe(false);
    expect(isAdequateCurriculumDesignerAnswer(adequate, evidence)).toBe(true);
  });

  it("labels curriculum evidence as supply signals rather than student mastery", () => {
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("能力供给信号");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("不能直接断言课程没有覆盖");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("不得把工作重新交给教师去招聘网站收集职位");
  });
});
