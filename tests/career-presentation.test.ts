import { describe, expect, it } from "vitest";

import { buildEvidencePreview, formatFallbackCareerAnswer } from "@/lib/career-presentation";
import type { CareerEvidence } from "@/lib/evidence";

const evidence: CareerEvidence = {
  forecastYear: 2028,
  recognizedSkills: ["Python", "药学"],
  unresolvedSkills: [],
  profiles: [
    { displayName: "Python", salaryMedian2025: 17500, aiExposure: 72.4, forecast: { trend: "上升" } },
    { displayName: "药学", salaryMedian2025: 9000, aiExposure: 67.8, forecast: { trend: "上升" } }
  ],
  occupations: [{ code: "202", name: "数字技术工程技术人员", score: 88, matchedSkills: ["Python"], observedPairCount: 0 }],
  cities: [{ city: "上海", score: 93, matchedSkills: ["Python", "药学"], preferred: true }],
  nextSkills: [{ skill: "Linux", relatedTo: "Python", cooccurrence: 0.87 }],
  observedPairCount: 0,
  observedPairs: [],
  preferenceNotes: ["已将理想城市 上海 作为城市排序加分项。"]
};

describe("career presentation", () => {
  it("shows traceable evidence before the final advice", () => {
    expect(buildEvidencePreview(evidence)).toMatchObject({
      sources: ["skills", "occupation_skill_stats", "city_skill_forecasts"],
      skills: ["Python", "药学"],
      occupations: ["数字技术工程技术人员"],
      cities: ["上海"]
    });
  });

  it("creates a concise recommendation when the model is unavailable", () => {
    const answer = formatFallbackCareerAnswer(evidence);

    expect(answer).toContain("优先关注上海");
    expect(answer).toContain("数字技术工程技术人员");
    expect(answer).toContain("Linux");
    expect(answer).not.toContain("{\"");
  });
});
