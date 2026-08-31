export function getEmailRedirectUrl(origin: string): string {
  return origin.replace(/\/+$/, "");
}
