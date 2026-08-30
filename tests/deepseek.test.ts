import { describe, expect, it } from "vitest";

import { buildDeepSeekPayload, limitCareerAnswer } from "@/lib/deepseek";

describe("buildDeepSeekPayload", () => {
  it("disables reasoning mode so a short advisory answer has room for visible output", () => {
    expect(buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }])).toMatchObject({
      model: "deepseek-v4-flash",
      stream: false,
      max_tokens: 700,
      thinking: { type: "disabled" }
    });
  });

  it("keeps a long model response concise at a sentence boundary", () => {
    const answer = `${"职业建议。".repeat(200)}最后一句。`;
    const limited = limitCareerAnswer(answer, 120);

    expect(limited.length).toBeLessThanOrEqual(120);
    expect(limited.endsWith("。")).toBe(true);
  });
});
