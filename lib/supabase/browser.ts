"use client";

import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

export function createBrowserSupabaseClient() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
