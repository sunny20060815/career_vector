import { describe, expect, it } from "vitest";

import { buildEvidencePreview, buildSuggestedQuestions, formatFallbackCareerAnswer, formatNoDataCareerAnswer } from "@/lib/career-presentation";
import { fallbackCareerPlan } from "@/lib/career-plan";
import { parseCareerQuestionLocally } from "@/lib/local-query";
import type { CareerEvidence } from "@/lib/evidence";

const evidence: CareerEvidence = {
  forecastYear: 2028,
  recognizedSkills: ["Python", "药学"],
  unresolvedSkills: [],
  profiles: [
    { displayName: "Python", demandRate2025: 0.19, demandPer10k2025: 1900, salaryMedian2025: 17500, experienceMean2025: 2, bachelorOrAboveShare2025: 0.82, aiExposure: 72.4, aiCooccurrence: 0.54, forecast: { demandRatio: 0.21, demandPer10k: 2100, salaryMedian: 18200, trend: "上升" } },
    { displayName: "药学", salaryMedian2025: 9000, aiExposure: 67.8, forecast: { trend: "上升" } }
  ],
  occupations: [{ code: "202", name: "数字技术工程技术人员", score: 88, matchedSkills: ["Python"], observedPairCount: 0 }],
  cities: [{ city: "上海", score: 93, matchedSkills: ["Python", "药学"], preferred: true }],
  nextSkills: [{ skill: "Linux", relatedTo: "Python", cooccurrence: 0.87 }],
  observedPairCount: 0,
  observedPairs: [],
  aiExposureDetails: [{ skill: "Python", aiGroup: "高AI渗透率", demandShare2025: 0.2, demandShare2028: 0.23 }],
  aiCooccurrenceSource: "local_csv",
  preferenceNotes: ["已将理想城市 上海 作为城市排序加分项。"],
  confirmedSkills: ["Python"],
  inferredSkills: ["药学"],
  curriculum: { school: "首都经济贸易大学", cohort: "2024级", major: "经济学", training_objectives: "培养复合型经济人才", core_courses: "微观经济学、宏观经济学、统计学、计量经济学、经济预测" },
  occupationDetails: [{ subclassCode: "202", subclassName: "工程技术人员", occupations: [{ name: "软件工程技术人员", description: "开发软件系统" }] }]
};

describe("career presentation", () => {
  it("shows traceable evidence before the final advice", () => {
    expect(buildEvidencePreview(evidence)).toMatchObject({
      sources: expect.arrayContaining(["skills", "occupation_skill_stats", "city_skill_forecasts", "major_programs", "major_skills", "occupation_catalog", "skill_ai_exposure", "ai_skill_cooccurrence（本地索引兜底）"]),
      skills: ["Python", "药学"],
      occupations: ["数字技术工程技术人员"],
      cities: ["上海"]
    });
  });

  it("creates a concise decision-first recommendation when the model is unavailable", () => {
    const answer = formatFallbackCareerAnswer(evidence);

    expect(answer).toContain("**建议**");
    expect(answer).toContain("优先考虑数字技术工程技术人员");
    expect(answer).toContain("经济学+Python");
    expect(answer).toContain("核心课程主要包括微观经济学、宏观经济学、统计学、计量经济学、经济预测");
    expect(answer).toContain("校内学习可能为药学等能力提供基础");
    expect(answer).toContain("与AI技能的共现强度");
    expect(answer).toContain("AI时代下");
    expect(answer).toContain("因果识别");
    expect(answer).toContain("可优先比较上海");
    expect(answer).toContain("Linux");
    expect(answer).not.toContain("收集约20条招聘信息");
    expect(answer).not.toContain("培养复合型经济人才");
    expect(answer).not.toContain("培养方案基础");
    expect(answer).not.toContain("技能市场画像");
    expect(answer).not.toContain("AI 渗透率补充");
    expect(answer).not.toContain("{\"");
    expect(answer.length).toBeLessThan(1200);
  });

  it("keeps curriculum-design fallback focused on program revision", () => {
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      inferredSkills: ["统计分析", "经济预测"],
      queryPlan: {
        route: "adaptive",
        answerStyle: "curriculum_design",
        modules: ["curriculum", "skill_profiles", "occupations", "ai_impact"],
        focus: "诊断培养方案"
      },
      curriculumVersions: [
        { cohort: "2023级", skillEvidence: [{ canonical_name: "统计分析" }] },
        { cohort: "2025级", skillEvidence: [{ canonical_name: "统计分析" }, { canonical_name: "人工智能技术" }] }
      ],
      majorDestinations: [{
        occupationCode: "2-06-03", occupationName: "会计专业人员", destinationName: "财务分析", destinationShare: 3.7,
        displayRank: 1, directionType: "已毕业人员从业方向", dataScope: "专业类", destinationTier: "核心去向", mappingConfidence: "高"
      }],
      majorIdentity: { inputMajorName: "经济学（实验班）", standardMajorName: "经济学", standardMajorCode: "020101" },
      targetOccupationSkills: [
        { occupationName: "数字技术工程技术人员", skill: "责任心", forecastDemandShare: 0.9, concentration: 1, userHasSkill: false },
        { occupationName: "数字技术工程技术人员", skill: "统计分析", forecastDemandShare: 0.3, concentration: 1, userHasSkill: true },
        { occupationName: "数字技术工程技术人员", skill: "Python", forecastDemandShare: 0.2, concentration: 1, userHasSkill: false }
      ]
    });

    expect(answer).toContain("**核心判断**");
    expect(answer).toContain("应继续以专业定位和主要就业去向为培养主轴");
    expect(answer).toContain("财务分析");
    expect(answer).toContain("国标专业“经济学”（020101）");
    expect(answer).toContain("**历年方案变化**");
    expect(answer).toContain("人工智能技术");
    expect(answer).toContain("**修订建议**");
    expect(answer).toContain("所属专业类的共同去向信号");
    expect(answer).not.toContain("责任心（2028年90.0%）");
    expect(answer).toContain("因果解释与预测准确性");
    expect(answer).toContain("考核方法选择与结论解释");
    expect(answer).toContain("不能单独决定培养方案");
    expect(answer).not.toContain("2024级级");
    expect(answer).not.toContain("如果以就业为目标，我会优先考虑");
  });

  it("treats a program and confirmed skill statement as a comprehensive profile", () => {
    const question = "我是首经贸2024级经济学（实验班）专业的学生，我会Stata";
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      recognizedSkills: ["Stata", "Excel"],
      confirmedSkills: ["Stata"],
      inferredSkills: ["Excel"],
      profiles: [{ displayName: "Stata", skill: "Stata", salaryMedian2025: 12500, demandPer10k2025: 0.4, aiExposure: 72.8, forecast: { trend: "基本稳定" } }],
      nextSkills: [{ skill: "Office办公软件", relatedTo: "Excel", cooccurrence: 0.8 }],
      queryPlan: {
        route: "standard",
        answerStyle: "recommendation",
        modules: ["curriculum", "skill_profiles", "occupations", "next_skills", "cities", "ai_impact", "occupation_catalog"],
        focus: "结合培养方案与用户确认技能生成综合职业规划"
      }
    }, question);

    expect(answer).toContain("经济学+Stata");
    expect(answer).toContain("核心课程主要包括");
    expect(answer).toContain("不等于你已经掌握");
    expect(answer).toContain("Stata");
    expect(answer).toContain("AI时代下");
    expect(answer).toContain("可优先比较上海");
    expect(answer).not.toContain("下一步优先补充Office办公软件");
    expect(answer).not.toContain("**它会改变什么**");
  });

  it("keeps professional destination evidence in every curriculum fallback path", () => {
    const withDestinations: CareerEvidence = {
      ...evidence,
      majorDestinations: [{
        occupationCode: "2-06-03", occupationName: "会计专业人员", destinationName: "财务分析", destinationShare: 3.7,
        displayRank: 4, directionType: "已毕业人员从业方向", dataScope: "专业类", destinationTier: "核心去向", mappingConfidence: "高"
      }]
    };
    const learning = formatFallbackCareerAnswer(withDestinations, "请给我课程学习建议");
    const target = formatFallbackCareerAnswer({ ...withDestinations, targetOccupationSkills: [
      { occupationName: "会计专业人员", skill: "财务分析", forecastDemandShare: 0.2, concentration: 1, userHasSkill: false }
    ] }, "我想做会计专业人员");
    const growth = formatFallbackCareerAnswer({
      ...withDestinations,
      queryPlan: { route: "adaptive", answerStyle: "skill_growth", modules: ["curriculum", "major_destinations", "next_skills"], focus: "下一技能" }
    }, "下一步学什么");

    for (const answer of [learning, target, growth]) expect(answer).toContain("依据阳光高考网公布的专业就业去向资料");
  });

  it("does not present zero-value pair or next-skill evidence", () => {
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      confirmedSkills: ["Python", "药学"],
      observedPairCount: 1,
      observedPairs: [{
        id: "pair-zero",
        skillA: "Python",
        skillB: "药学",
        cooccurrence: 0,
        wageComplementPct: 0,
        wageComplementPValue: 1,
        demandRate2025: 0,
        demandRate2028: 0,
        demandGrowthPct: 0,
        evidenceLevel: "暂无"
      }],
      nextSkills: [{ skill: "无效建议", relatedTo: "Python", cooccurrence: 0 }]
    });

    expect(answer).toContain("没有足够直接组合证据");
    expect(answer).not.toContain("0.000");
    expect(answer).not.toContain("无效建议");
    expect(answer).toContain("当前没有足够证据确定唯一的下一技能");
  });

  it("builds three evidence-based follow-up questions for fallback responses", () => {
    expect(buildSuggestedQuestions(evidence)).toEqual([
      "我距离数字技术工程技术人员还缺哪些关键技能？",
      "如果补充Linux，我的职业匹配会发生什么变化？",
      "培养方案中的哪些课程最有助于进入数字技术工程技术人员？"
    ]);
  });

  it("answers general guidance questions even without recognized skills", () => {
    expect(formatNoDataCareerAnswer("我应该怎样描述自己的专业和技能？")).toContain("学校与年级+专业+已经掌握的技能");
    expect(formatNoDataCareerAnswer("培养方案里哪些课程更重要？")).toContain("学校、年级和专业");
  });

  it("creates a curriculum-based learning path when the model is unavailable", () => {
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      inferredSkills: ["统计分析", "经济预测", "数据分析"],
      targetOccupationSkills: [
        { occupationName: "软件和信息技术服务人员", skill: "沟通能力", forecastDemandShare: 0.527, concentration: 1, userHasSkill: false },
        { occupationName: "软件和信息技术服务人员", skill: "数据库技术", forecastDemandShare: 0.136, concentration: 2, userHasSkill: false },
        { occupationName: "软件和信息技术服务人员", skill: "Python", forecastDemandShare: 0.098, concentration: 2, userHasSkill: true },
        { occupationName: "软件和信息技术服务人员", skill: "数据分析", forecastDemandShare: 0.097, concentration: 2, userHasSkill: false },
        { occupationName: "软件和信息技术服务人员", skill: "Linux", forecastDemandShare: 0.097, concentration: 2, userHasSkill: false }
      ]
    }, "培养方案中的哪些课程最有助于进入软件和信息技术服务人员？");

    expect(answer).toContain("**课程学习建议**");
    expect(answer).toContain("专业理论—定量工具—岗位应用");
    expect(answer).toContain("**专业课程与能力基础**");
    expect(answer).toContain("核心课程主要包括微观经济学、宏观经济学、统计学、计量经济学、经济预测");
    expect(answer).toContain("校内学习可能为统计分析、经济预测、数据分析等能力提供基础");
    expect(answer).toContain("不等于你已经掌握");
    expect(answer).toContain("**目标职业需要什么**");
    expect(answer).toContain("数据库技术（约13.6%）");
    expect(answer).toContain("Python（约9.8%）");
    expect(answer).toContain("数据分析（约9.7%）");
    expect(answer).toContain("同时也重视沟通能力");
    expect(answer).toContain("统计学、计量经济学、经济预测");
    expect(answer).toContain("优先验证数据库技术、数据分析、Linux");
    expect(answer).toContain("课程外补充");
    expect(answer).toContain("AI辅助方式");
    expect(answer).toContain("关联职业AI暴露度约72.4");
    expect(answer).toContain("与AI技能的共现强度为0.540");
  });

  it("keeps an explicit cross-major target above broad destination priors", () => {
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      occupations: [{ code: "20603", name: "会计专业人员", score: 99, matchedSkills: [], observedPairCount: 0 }],
      majorIdentity: { inputMajorName: "经济统计学", standardMajorName: "经济统计学", standardMajorCode: "020102" },
      majorDestinations: [{
        occupationCode: "2-06-03", occupationName: "会计专业人员", destinationName: "财务助理", destinationShare: 3.7,
        displayRank: 1, directionType: "已毕业人员从业方向", dataScope: "专业类", destinationTier: "核心去向", mappingConfidence: "高"
      }],
      requestedOccupations: ["数字技术工程技术人员"],
      targetOccupationSkills: [
        { occupationName: "数字技术工程技术人员", skill: "数据分析", forecastDemandShare: 0.3, concentration: 1, userHasSkill: false },
        { occupationName: "数字技术工程技术人员", skill: "Python", forecastDemandShare: 0.2, concentration: 1, userHasSkill: true }
      ],
      curriculum: { ...evidence.curriculum, major: "经济统计学" }
    }, "我是首经贸2024级经济统计学学生，想进入数字技术相关职业。请结合培养方案和岗位需求，给我一份分阶段学习建议。");

    expect(answer).toContain("建议围绕数字技术工程技术人员");
    expect(answer).toContain("依据阳光高考网公布的专业就业去向资料");
    expect(answer).toContain("但你已明确选择数字技术工程技术人员");
    expect(answer).not.toContain("建议围绕会计专业人员");
  });

  it("keeps observed pair value before recommending the next skill", () => {
    const question = "我会 TPM 和设备管理，这组技能有工资互补价值吗？未来适合哪些职业和城市，下一步还应补什么技能？";
    const query = parseCareerQuestionLocally(question, [
      { canonicalName: "TPM", aliases: ["TPM"] },
      { canonicalName: "设备管理", aliases: ["设备管理"] }
    ]);
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      recognizedSkills: ["TPM", "设备管理"],
      confirmedSkills: ["TPM", "设备管理"],
      curriculum: null,
      observedPairCount: 1,
      observedPairs: [{
        id: "ZH01389",
        skillA: "TPM",
        skillB: "设备管理",
        cooccurrence: 0.426568,
        wageComplementPct: 9.0631,
        wageComplementPValue: 0.0487,
        demandRate2025: 0.00084196,
        demandRate2028: 0.00121418,
        demandGrowthPct: 44.2096,
        evidenceLevel: "稳健子技能互补"
      }],
      pairCities: [
        { pairId: "ZH01389", city: "深圳", probability: 0.2, concentration: 1 },
        { pairId: "ZH01389", city: "上海", probability: 0.4, concentration: 1 },
        { pairId: "other", city: "错误城市", probability: 0.9, concentration: 1 }
      ],
      nextSkills: [{
        skill: "安全生产",
        relatedTo: "设备管理",
        cooccurrence: 0.2,
        demandPer10k2025: 342.7,
        salaryMedian2025: 10000,
        forecastTrend: "基本稳定",
        occupationsAfter: ["机械工程技术人员", "生产现场技术工艺人员"],
        citiesAfter: ["荆门", "九江", "宜宾"]
      }],
      queryPlan: fallbackCareerPlan(question, query)
    }, question);

    expect(answer).toContain("存在直接观测到的工资互补证据");
    expect(answer).toContain("互补效应约9.1%");
    expect(answer).toContain("增幅约44.2%");
    expect(answer).toContain("上海、深圳");
    expect(answer).toContain("下一步优先补充安全生产");
    expect(answer).not.toContain("缺少显著工资互补证据");
    expect(answer).not.toContain("错误城市");
  });

  it("keeps AI task questions focused when the model fallback is used", () => {
    const question = "我会财务分析和 Excel，AI 更可能辅助还是替代哪些工作任务？";
    const query = parseCareerQuestionLocally(question, [
      { canonicalName: "财务分析", aliases: ["财务分析"] },
      { canonicalName: "Excel", aliases: ["Excel"] },
      { canonicalName: "人工智能技术", aliases: ["AI"] }
    ]);
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      recognizedSkills: ["财务分析", "Excel"],
      confirmedSkills: ["财务分析", "Excel"],
      inferredSkills: [],
      curriculum: null,
      profiles: [{ displayName: "Excel", skill: "Excel", aiExposure: 70.5, aiGroup: "高AI渗透率", aiCooccurrence: -0.071 }],
      queryPlan: fallbackCareerPlan(question, query)
    }, question);

    expect(answer).toContain("AI更适合辅助的任务");
    expect(answer).toContain("表格清洗");
    expect(answer).toContain("财务口径与业务逻辑判断");
    expect(answer).not.toContain("优先考虑数字技术工程技术人员");
  });

  it("compares available skill evidence without failing on an unindexed course", () => {
    const question = "计量经济学和机器学习在就业上哪个更值得优先投入？";
    const query = parseCareerQuestionLocally(question, [{ canonicalName: "机器学习", aliases: ["机器学习"] }]);
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      recognizedSkills: ["机器学习"],
      confirmedSkills: [],
      inferredSkills: [],
      curriculum: null,
      profiles: [{ displayName: "机器学习", skill: "机器学习", demandPer10k2025: 60.6, salaryMedian2025: 21500, forecast: { trend: "明显上升" } }],
      queryPlan: fallbackCareerPlan(question, query)
    }, question);

    expect(answer).toContain("优先投入机器学习");
    expect(answer).toContain("没有把计量经济学作为独立标准技能统计");
    expect(answer).toContain("2025年需求强度约60.6个/万岗位");
  });

  it("gives a complete next-skill answer when the model fallback is used", () => {
    const question = "我会 Python 和统计分析，下一步最值得补什么技能？它会怎样改变我的职业、工资与城市选择？";
    const query = parseCareerQuestionLocally(question, [
      { canonicalName: "Python", aliases: ["Python"] },
      { canonicalName: "统计分析", aliases: ["统计分析"] }
    ]);
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      recognizedSkills: ["Python", "统计分析"],
      confirmedSkills: ["Python", "统计分析"],
      inferredSkills: [],
      curriculum: null,
      nextSkills: [{
        skill: "数据分析",
        relatedTo: "Python、统计分析",
        cooccurrence: null,
        demandPer10k2025: 188.2,
        salaryMedian2025: 14500,
        forecastTrend: "温和上升",
        occupationsAfter: ["数字技术工程技术人员", "软件和信息技术服务人员"],
        citiesAfter: ["北京", "上海", "深圳", "杭州", "广州"]
      }],
      queryPlan: fallbackCareerPlan(question, query)
    }, question);

    expect(answer).toContain("下一步优先补充数据分析");
    expect(answer).toContain("数字技术工程技术人员");
    expect(answer).toContain("不代表掌握该技能后个人工资会等额提高");
    expect(answer).toContain("北京、上海、深圳、杭州、广州");
    expect(answer).not.toContain("自行去招聘网站");
  });

  it("lists common skills when the user specifies an occupation direction", () => {
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      recognizedSkills: ["Python"],
      confirmedSkills: ["Python"],
      targetOccupationSkills: [
        { occupationName: "数字技术工程技术人员", skill: "大语言模型", forecastDemandShare: 0.55, concentration: 4, userHasSkill: false },
        { occupationName: "数字技术工程技术人员", skill: "Python", forecastDemandShare: 0.42, concentration: 3, userHasSkill: true },
        { occupationName: "数字技术工程技术人员", skill: "PyTorch", forecastDemandShare: 0.38, concentration: 3, userHasSkill: false }
      ]
    }, "我想进入数字技术工程技术人员方向，最常用哪些技能？");

    expect(answer).toContain("数字技术工程技术人员的技能画像");
    expect(answer).toContain("你已经覆盖了其中的Python");
    expect(answer).toContain("优先补充大语言模型、PyTorch");
    expect(answer).toContain("不是个人进入该职业的概率");
  });
});
