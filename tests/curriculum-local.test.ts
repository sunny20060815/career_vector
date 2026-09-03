import { describe, expect, it } from "vitest";

import { localProgramCatalog, localProgramEvidence, localProgramSeriesEvidence } from "@/lib/curriculum-local";

describe("local curriculum fallback", () => {
  it("loads a CUEB program and its representative skills from the bundled indexes", () => {
    const program = localProgramCatalog().find((item) => item.major === "保险学（保险精算）");

    expect(program).toMatchObject({ school: "首都经济贸易大学", cohort: "2023级" });
    expect(program?.programKey).toBeTruthy();
    expect(localProgramEvidence(program?.programKey ?? "").skills.length).toBeGreaterThan(0);
  });

  it("loads comparable cohort versions for one major", () => {
    const program = localProgramCatalog().find((item) => item.cohort === "2025级" && item.major === "经济学（实验班）");
    const versions = localProgramSeriesEvidence(program?.programKey ?? "");

    expect(versions.map((item) => item.program.cohort)).toEqual(expect.arrayContaining(["2023级", "2024级", "2025级"]));
    expect(versions.every((item) => item.skills.length > 0)).toBe(true);
  });
});
