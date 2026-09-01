import { describe, expect, it } from "vitest";

import { localProgramCatalog, localProgramEvidence } from "@/lib/curriculum-local";

describe("local curriculum fallback", () => {
  it("loads a CUEB program and its representative skills from the bundled indexes", () => {
    const program = localProgramCatalog().find((item) => item.major === "保险学（保险精算）");

    expect(program).toMatchObject({ school: "首都经济贸易大学", cohort: "2023级" });
    expect(program?.programKey).toBeTruthy();
    expect(localProgramEvidence(program?.programKey ?? "").skills.length).toBeGreaterThan(0);
  });
});
