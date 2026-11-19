/** Deployments may be reverse-proxied below the lab path. */
export function experimentPhotoUrl(url: string): string {
  if (!url.startsWith("/uploads/experiments/") || typeof window === "undefined") return url;
  const prefix = window.location.pathname.match(/^(.*)\/animals(?:\/|$)/)?.[1] ?? "";
  return `${prefix}${url}`;
}
