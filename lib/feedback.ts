export const feedbackCategories = {
  bug: "功能异常",
  data: "数据问题",
  suggestion: "产品建议",
  other: "其他问题"
} as const;

export type FeedbackCategory = keyof typeof feedbackCategories;

export function parseFeedbackPayload(value: unknown): { category: FeedbackCategory; message: string } {
  if (!value || typeof value !== "object") throw new Error("反馈内容格式不正确");
  const payload = value as Record<string, unknown>;
  const category = payload.category;
  const message = typeof payload.message === "string" ? payload.message.trim() : "";

  if (typeof category !== "string" || !(category in feedbackCategories)) throw new Error("请选择问题类型");
  if (message.length < 10) throw new Error("请至少填写10个字，便于我们定位问题");
  if (message.length > 3000) throw new Error("反馈内容不能超过3000字");

  return { category: category as FeedbackCategory, message };
}
