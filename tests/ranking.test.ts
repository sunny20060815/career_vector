import { describe, expect, it } from "vitest";

import { applyMajorDestinationPriors, rankOccupations, selectObservedPairs } from "@/lib/ranking";

describe("selectObservedPairs", () => {
  it("only returns directly observed pairs", () => {
    const pairs = selectObservedPairs(["Python", "药学", "沟通能力"], [
      { id: "pair-python-soft", skillA: "Python", skillB: "沟通能力" }
    ]);

    expect(pairs).toEqual(["pair-python-soft"]);
  });
});

describe("rankOccupations", () => {
  it("prioritises occupations supported by more than one input skill", () => {
    const result = rankOccupations(
      ["Python", "沟通能力"],
      [
        {
          skill: "Python",
          code: "2-02-01",
          name: "软件工程技术人员",
          probability: 0.7,
          concentration: 4,
          futureDemandRatio: 0.2
        },
        {
          skill: "沟通能力",
          code: "2-02-01",
          name: "软件工程技术人员",
          probability: 0.4,
          concentration: 2,
          futureDemandRatio: 0.1
        },
        {
          skill: "沟通能力",
          code: "4-01-02",
          name: "销售人员",
          probability: 0.8,
          concentration: 5,
          futureDemandRatio: 0.15
        }
      ],
      []
    );

    expect(result[0]).toMatchObject({
      code: "2-02-01",
      matchedSkills: ["Python", "沟通能力"],
      observedPairCount: 0
    });
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });
});

describe("applyMajorDestinationPriors", () => {
  const skillRanking = [
    { code: "2-02-10", name: "数字技术工程技术人员", score: 95, matchedSkills: ["Python"], observedPairCount: 0 },
    { code: "2-06-05", name: "经济专业人员", score: 45, matchedSkills: ["Python"], observedPairCount: 0 }
  ];
  const economicsPriors = [{
    occupationCode: "2-06-05", occupationName: "经济专业人员", destinationName: "经济分析人员", destinationShare: 12,
    displayRank: 1, directionType: "已毕业人员从业方向", dataScope: "专业类", destinationTier: "核心去向", mappingConfidence: "高"
  }];

  it("keeps technical tools inside the professional destination pool by default", () => {
    expect(applyMajorDestinationPriors(skillRanking, economicsPriors)[0]).toMatchObject({
      code: "2-06-05",
      matchedSkills: ["Python"],
      majorDestinations: ["经济分析人员"]
    });
  });

  it("lets an explicit cross-major target bypass the professional constraint", () => {
    expect(applyMajorDestinationPriors(skillRanking, economicsPriors, false)[0].code).toBe("2-02-10");
  });

  it("can rank a professional destination without confirmed skills", () => {
    expect(applyMajorDestinationPriors([], economicsPriors)[0]).toMatchObject({ code: "2-06-05", matchedSkills: [] });
  });
});
