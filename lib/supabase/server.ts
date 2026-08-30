import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr/dist/main/types";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values: CookieToSet[]) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot persist refreshed cookies.
        }
      }
    }
  });
}
