"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getBrowserSupabaseConfig } from "@/lib/env";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getBrowserSupabaseConfig();

  return createBrowserClient(url, anonKey);
}
