import { describe, expect, it } from "vitest";

import { buildEvidencePreview, formatFallbackCareerAnswer } from "@/lib/career-presentation";
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
  curriculum: { school: "首都经济贸易大学", cohort: "2024级", major: "经济学", training_objectives: "培养复合型经济人才", core_courses: "微观经济学" },
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
    expect(answer).toContain("课程覆盖不能视为你已经掌握");
    expect(answer).toContain("与AI技能的共现强度");
    expect(answer).toContain("可优先比较上海");
    expect(answer).toContain("Linux");
    expect(answer).not.toContain("培养复合型经济人才");
    expect(answer).not.toContain("培养方案基础");
    expect(answer).not.toContain("技能市场画像");
    expect(answer).not.toContain("AI 渗透率补充");
    expect(answer).not.toContain("{\"");
    expect(answer.length).toBeLessThan(1200);
  });

  it("does not present zero-value pair or next-skill evidence", () => {
    const answer = formatFallbackCareerAnswer({
      ...evidence,
      confirmedSkills: ["Python", "药学"],
      observedPairCount: 1,
      observedPairs: [{
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
  });
});
