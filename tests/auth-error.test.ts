import { describe, expect, it } from "vitest";

import { formatOtpSendError } from "@/lib/auth-error";

describe("formatOtpSendError", () => {
  it("explains when the production redirect URL is not allowed", () => {
    expect(formatOtpSendError("Redirect URL is not allowed")).toBe(
      "验证码发送失败：当前网站地址未加入 Supabase 的 Redirect URLs。请添加 https://www.zhivector.com 后保存。"
    );
  });

  it("explains the short resend cooldown", () => {
    expect(formatOtpSendError("For security purposes, you can only request this after 60 seconds.")).toBe(
      "验证码发送过于频繁，请等待 60 秒后再试。"
    );
  });
});
