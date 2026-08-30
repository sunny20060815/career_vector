import { describe, expect, it } from "vitest";

import { getBrowserSupabaseConfig, hasSupabasePublicConfig } from "@/lib/env";

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
