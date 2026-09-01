import { describe, expect, it } from "vitest";

import {
  CAREER_ADVISOR_SYSTEM_PROMPT,
  buildCareerAdvisorMessages,
  buildDeepSeekPayload,
  limitCareerAnswer
} from "@/lib/deepseek";

describe("buildDeepSeekPayload", () => {
  it("enables server-side thinking and reserves tokens for a detailed visible answer", () => {
    const payload = buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "enabled");

    expect(payload).toMatchObject({
      model: "deepseek-v4-flash",
      stream: false,
      max_tokens: 6000,
      thinking: { type: "enabled" }
    });
    expect(payload).not.toHaveProperty("temperature");
  });

  it("can disable thinking only through explicit server configuration", () => {
    expect(buildDeepSeekPayload("deepseek-v4-flash", [{ role: "user", content: "测试" }], "disabled")).toMatchObject({
      max_tokens: 6000,
      thinking: { type: "disabled" }
    });
  });

  it("keeps a long model response concise at a sentence boundary", () => {
    const answer = `${"职业建议。".repeat(200)}最后一句。`;
    const limited = limitCareerAnswer(answer, 120);

    expect(limited.length).toBeLessThanOrEqual(120);
    expect(limited.endsWith("。")).toBe(true);
  });

  it("preserves a complete detailed answer up to 4200 characters at a sentence boundary", () => {
    const limited = limitCareerAnswer("职业建议。".repeat(1000) + "最后一句。");

    expect(limited.length).toBe(4200);
    expect(limited.endsWith("。")).toBe(true);
  });

  it("passes curriculum, occupation catalog, AI exposure and AI cooccurrence evidence to the model", () => {
    const messages = buildCareerAdvisorMessages("我会 Python", {
      curriculum: { major: "经济学（实验班）" },
      occupationDetails: [{ subclassName: "工程技术人员" }],
      aiExposureDetails: [{ aiGroup: "高AI渗透率", demandShare2025: 0.2 }],
      aiCooccurrenceSource: "local_csv"
    });

    expect(CAREER_ADVISOR_SYSTEM_PROMPT).toContain("AI 技能共现");
    expect(messages.at(-1)?.content).toContain("\"curriculum\"");
    expect(messages.at(-1)?.content).toContain("\"occupationDetails\"");
    expect(messages.at(-1)?.content).toContain("\"aiExposureDetails\"");
    expect(messages.at(-1)?.content).toContain("\"aiCooccurrenceSource\"");
  });
});
