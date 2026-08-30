import { describe, expect, it } from "vitest";

import { rankOccupations, selectObservedPairs } from "@/lib/ranking";

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
