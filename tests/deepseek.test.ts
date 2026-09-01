import { describe, expect, it } from "vitest";

import { buildDeepSeekPayload, limitCareerAnswer } from "@/lib/deepseek";

describe("buildDeepSeekPayload", () => {
  it("enables server-side thinking and reserves tokens for a detailed visible answer", () => {
    const payload = buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "enabled");

    expect(payload).toMatchObject({
      model: "deepseek-v4-flash",
      stream: false,
      max_tokens: 2200,
      thinking: { type: "enabled" }
    });
    expect(payload).not.toHaveProperty("temperature");
  });

  it("can disable thinking only through explicit server configuration", () => {
    expect(buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "disabled")).toMatchObject({
      max_tokens: 2200,
      thinking: { type: "disabled" }
    });
  });

  it("keeps a long model response concise at a sentence boundary", () => {
    const answer = `${"职业建议。".repeat(200)}最后一句。`;
    const limited = limitCareerAnswer(answer, 120);

    expect(limited.length).toBeLessThanOrEqual(120);
    expect(limited.endsWith("。")).toBe(true);
  });

  it("limits detailed answers to 1200 characters at a sentence boundary", () => {
    const limited = limitCareerAnswer("职业建议。".repeat(300) + "最后一句。");

    expect(limited.length).toBe(1200);
    expect(limited.endsWith("。")).toBe(true);
  });
});
