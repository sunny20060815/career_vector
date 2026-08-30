import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr/dist/main/types";
import { NextResponse, type NextRequest } from "next/server";

import { env, hasSupabasePublicConfig } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  if (!hasSupabasePublicConfig()) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const client = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values: CookieToSet[]) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  await client.auth.getClaims();
  return response;
}
