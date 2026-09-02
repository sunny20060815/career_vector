type AuthSessionLike = {
  user?: {
    email?: string | null;
    user_metadata?: { phone_last4?: unknown } | null;
  } | null;
} | null;

export function getSessionIdentity(session: AuthSessionLike): string | null {
  const last4 = session?.user?.user_metadata?.phone_last4;
  if (typeof last4 === "string" && /^\d{4}$/.test(last4)) return `手机号 ····${last4}`;
  return session?.user?.email ?? null;
}
