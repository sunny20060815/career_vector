import { describe, expect, it } from "vitest";

import { localAiCooccurrence } from "@/lib/ai-cooccurrence-local";

describe("local AI cooccurrence fallback", () => {
  it("loads the measured AI cooccurrence strength", () => {
    expect(localAiCooccurrence().get("Python")?.cooccurrence).toBeCloseTo(0.540555, 5);
  });
});
