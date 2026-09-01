import { describe, expect, it } from "vitest";

import { parseFeedbackPayload } from "@/lib/feedback";

describe("parseFeedbackPayload", () => {
  it("normalizes a valid feedback payload", () => {
    expect(parseFeedbackPayload({ category: "data", message: "  这项城市数据似乎不准确，请复核。  " })).toEqual({ category: "data", message: "这项城市数据似乎不准确，请复核。" });
  });

  it("rejects an unknown category", () => {
    expect(() => parseFeedbackPayload({ category: "spam", message: "这是一个足够长的问题描述" })).toThrow("请选择问题类型");
  });

  it("rejects a description that is too short", () => {
    expect(() => parseFeedbackPayload({ category: "bug", message: "打不开" })).toThrow("请至少填写10个字");
  });
});
