import { describe, expect, it } from "vitest";

import { env, getBrowserSupabaseConfig, hasSupabasePublicConfig } from "@/lib/env";

describe("hasSupabasePublicConfig", () => {
  it("returns false when the browser Supabase variables are absent", () => {
    expect(hasSupabasePublicConfig({})).toBe(false);
  });

  it("requires both URL and anonymous key", () => {
    expect(hasSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toBe(false);
    expect(hasSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "key" })).toBe(true);
  });

  it("returns browser configuration from statically named public variables", () => {
    expect(
      getBrowserSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key"
      })
    ).toEqual({ url: "https://example.supabase.co", anonKey: "public-key" });
  });

  it("uses thinking and timeout defaults when optional values are absent", () => {
    expect(env.deepseekThinkingMode({})).toBe("enabled");
    expect(env.deepseekAnswerTimeoutMs({})).toBe(50_000);
  });

  it("accepts an explicit mode and bounded timeout", () => {
    expect(env.deepseekThinkingMode({ DEEPSEEK_THINKING_MODE: "disabled" })).toBe("disabled");
    expect(env.deepseekAnswerTimeoutMs({ DEEPSEEK_ANSWER_TIMEOUT_MS: "49000" })).toBe(49_000);
  });

  it("rejects unsupported mode and unsafe timeout", () => {
    expect(() => env.deepseekThinkingMode({ DEEPSEEK_THINKING_MODE: "auto" })).toThrow("DEEPSEEK_THINKING_MODE");
    expect(() => env.deepseekAnswerTimeoutMs({ DEEPSEEK_ANSWER_TIMEOUT_MS: "0" })).toThrow("DEEPSEEK_ANSWER_TIMEOUT_MS");
    expect(() => env.deepseekAnswerTimeoutMs({ DEEPSEEK_ANSWER_TIMEOUT_MS: "60000" })).toThrow("DEEPSEEK_ANSWER_TIMEOUT_MS");
  });
});

describe("DeepSeek runtime configuration", () => {
  it("uses deep thinking and a 90 second budget by default", () => {
    expect(getDeepSeekThinkingMode(undefined)).toBe("enabled");
    expect(getDeepSeekAnswerTimeoutMs(undefined)).toBe(90_000);
  });

  it("rejects invalid thinking and timeout values", () => {
    expect(() => getDeepSeekThinkingMode("sometimes")).toThrow(/enabled/);
    expect(() => getDeepSeekAnswerTimeoutMs("90001")).toThrow(/90000/);
  });
});
