function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value;
}

export function hasSupabasePublicConfig(source: Record<string, string | undefined> = process.env): boolean {
  return Boolean(source.NEXT_PUBLIC_SUPABASE_URL && source.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const env = {
  deepseekApiKey: () => required("DEEPSEEK_API_KEY"),
  deepseekParseModel: () => process.env.DEEPSEEK_PARSE_MODEL ?? "deepseek-v4-flash",
  deepseekAnswerModel: () => process.env.DEEPSEEK_ANSWER_MODEL ?? "deepseek-v4-pro",
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY")
};
