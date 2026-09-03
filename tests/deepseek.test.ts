import { describe, expect, it } from "vitest";

import {
  CAREER_ADVISOR_SYSTEM_PROMPT,
  buildCareerAdvisorMessages,
  buildDeepSeekPayload,
  isAdequateCurriculumDesignerAnswer,
  isAdequateIndividualCareerAnswer,
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
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("从 core_courses 点名 3-6 门真实课程");
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("结合 inferredSkills 说明校内学习可能训练的 3-5 项能力");
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
    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("不得只给泛化的“AI辅助方式”");
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

  it("rejects program advice that ignores destination evidence or treats courses as mastery", () => {
    const evidence = {
      curriculum: { major: "经济学（实验班）" },
      majorDestinations: [{ destinationName: "财务分析", occupationName: "会计专业人员" }],
      occupations: [{ name: "会计专业人员" }]
    };
    expect(isAdequateIndividualCareerAnswer("你会Python，建议转向数字技术工程技术人员。", evidence)).toBe(false);
    expect(isAdequateIndividualCareerAnswer(
      `${"培养方案中的计量和统计课程为经济分析提供基础，但课程覆盖不等于已经掌握。".repeat(8)}专业就业去向显示财务分析较常见，因此可优先考虑会计专业人员，并用Python增强数据处理。`,
      evidence
    )).toBe(true);
  });

  it("rejects curriculum advice that does not name actual courses and potential skills", () => {
    const evidence = {
      curriculum: { major: "经济统计学", core_courses: "微观经济学、概率论、数理统计、计量经济学、Python数据分析" },
      inferredSkills: ["统计分析", "数据分析", "Python"],
      occupations: [{ name: "数字技术工程技术人员" }]
    };
    const generic = `${"培养方案中的课程提供专业基础，但课程覆盖不等于已经掌握，需要转化为项目成果。".repeat(10)}数字技术工程技术人员是可考虑的方向。`;
    const detailed = `${generic}专业课程与能力基础方面，核心课程包括微观经济学、概率论、数理统计和计量经济学，校内学习可能为统计分析、数据分析提供基础。`;

    expect(isAdequateIndividualCareerAnswer(generic, evidence)).toBe(false);
    expect(isAdequateIndividualCareerAnswer(detailed, evidence)).toBe(true);
  });

  it("rejects AI-related program advice that omits available exposure or cooccurrence evidence", () => {
    const evidence = {
      curriculum: { major: "经济统计学" },
      majorDestinations: [{ destinationName: "数据分析", occupationName: "数字技术工程技术人员" }],
      requestedOccupations: ["数字技术工程技术人员"],
      occupations: [{ name: "数字技术工程技术人员" }],
      profiles: [{ skill: "Python", aiExposure: 72.4, aiCooccurrence: 0.54 }]
    };
    const base = `${"培养方案中的统计课程提供基础，但课程覆盖不等于已经掌握，需要转化为项目成果。".repeat(8)}依据阳光高考网就业去向资料，数字技术工程技术人员是本次明确目标。`;

    expect(isAdequateIndividualCareerAnswer(base, evidence)).toBe(false);
    expect(isAdequateIndividualCareerAnswer(`${base}Python的关联职业AI暴露度为72.4，与AI技能的共现强度为0.540。`, evidence)).toBe(true);
  });
});
