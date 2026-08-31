type AuthSessionLike = { user?: { email?: string | null } | null } | null;

export function getSessionEmail(session: AuthSessionLike): string | null {
  return session?.user?.email ?? null;
}
