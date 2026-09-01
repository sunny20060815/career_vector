import { describe, expect, it } from "vitest";

import { localAiCooccurrence } from "@/lib/ai-cooccurrence-local";

describe("local AI cooccurrence fallback", () => {
  it("loads the exact Python AI cooccurrence relation from the bundled index", () => {
    expect(localAiCooccurrence().get("Python")).toEqual({
      cooccurrence: expect.closeTo(0.540555149586132),
      share: expect.closeTo(0.1924663935015455)
    });
  });
});
