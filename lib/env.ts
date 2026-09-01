function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value;
}

export type ServerEnvironment = Record<string, string | undefined>;
export type DeepSeekThinkingMode = "enabled" | "disabled";

const DEFAULT_DEEPSEEK_ANSWER_TIMEOUT_MS = 50_000;
const MAX_DEEPSEEK_ANSWER_TIMEOUT_MS = 50_000;

function readThinkingMode(source: ServerEnvironment): DeepSeekThinkingMode {
  const value = source.DEEPSEEK_THINKING_MODE ?? "enabled";
  if (value === "enabled" || value === "disabled") return value;
  throw new Error("DEEPSEEK_THINKING_MODE 必须为 enabled 或 disabled");
}

function readAnswerTimeoutMs(source: ServerEnvironment): number {
  const raw = source.DEEPSEEK_ANSWER_TIMEOUT_MS;
  if (!raw) return DEFAULT_DEEPSEEK_ANSWER_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_DEEPSEEK_ANSWER_TIMEOUT_MS) {
    throw new Error("DEEPSEEK_ANSWER_TIMEOUT_MS 必须是 1 到 50000 的整数");
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

export const env = {
  deepseekApiKey: () => required("DEEPSEEK_API_KEY"),
  deepseekAnswerModel: () => process.env.DEEPSEEK_ANSWER_MODEL ?? "deepseek-v4-flash",
  deepseekThinkingMode: (source: ServerEnvironment = process.env) => readThinkingMode(source),
  deepseekAnswerTimeoutMs: (source: ServerEnvironment = process.env) => readAnswerTimeoutMs(source),
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY")
};
