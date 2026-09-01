export function formatOtpSendError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("redirect") && (normalized.includes("allow") || normalized.includes("not allowed"))) {
    return "登录链接发送失败：当前网站地址未加入 Supabase 的 Redirect URLs。请添加 https://www.zhivector.com 后保存。";
  }

  if (normalized.includes("60 seconds")) {
    return "登录链接发送过于频繁，请等待 60 秒后再试。";
  }

  return `登录链接发送失败：${message}`;
}
