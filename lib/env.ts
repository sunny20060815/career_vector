function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value;
}

type BrowserSupabaseEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
};

// Next.js only exposes browser variables when their names are statically referenced.
const browserSupabaseEnvironment: BrowserSupabaseEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
};

export function hasSupabasePublicConfig(source: Record<string, string | undefined> = process.env): boolean {
  return Boolean(source.NEXT_PUBLIC_SUPABASE_URL && source.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getBrowserSupabaseConfig(
  source: BrowserSupabaseEnvironment = browserSupabaseEnvironment
): { url: string; anonKey: string } {
  const url = source.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = source.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("缺少环境变量：NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!anonKey) {
    throw new Error("缺少环境变量：NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { url, anonKey };
}

export function getDeepSeekThinkingMode(value = process.env.DEEPSEEK_THINKING_MODE): "enabled" | "disabled" {
  if (!value || value === "enabled") return "enabled";
  if (value === "disabled") return "disabled";
  throw new Error("DEEPSEEK_THINKING_MODE 只能是 enabled 或 disabled");
}

export function getDeepSeekAnswerTimeoutMs(value = process.env.DEEPSEEK_ANSWER_TIMEOUT_MS): number {
  if (!value) return 90_000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 90_000) {
    throw new Error("DEEPSEEK_ANSWER_TIMEOUT_MS 必须是 1000 到 90000 之间的整数");
  }
  return timeout;
}

export const env = {
  deepseekApiKey: () => required("DEEPSEEK_API_KEY"),
  deepseekAnswerModel: () => process.env.DEEPSEEK_ANSWER_MODEL ?? "deepseek-v4-flash",
  deepseekThinkingMode: () => getDeepSeekThinkingMode(),
  deepseekAnswerTimeoutMs: () => getDeepSeekAnswerTimeoutMs(),
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  resendApiKey: () => required("RESEND_API_KEY"),
  feedbackToEmail: () => process.env.FEEDBACK_TO_EMAIL ?? "32024030101@cueb.edu.cn",
  feedbackFromEmail: () => process.env.FEEDBACK_FROM_EMAIL ?? "职向量 <feedback@zhivector.com>"
};
