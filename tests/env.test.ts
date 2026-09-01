import { describe, expect, it } from "vitest";

import { getBrowserSupabaseConfig, getDeepSeekAnswerTimeoutMs, getDeepSeekThinkingMode, hasSupabasePublicConfig } from "@/lib/env";

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
