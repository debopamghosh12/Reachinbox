// Vercel Routing Middleware: proxies the backend's paths to BACKEND_URL (the
// Railway URL), so the browser only ever talks to the Vercel domain. Cookies
// are then first-party and there is no CORS at all.
//
// Why not plain rewrites in vercel.json: their destinations can't read
// environment variables, and BACKEND_URL differs per deployment.
// Runs before vercel.json's SPA fallback; other paths never reach this.
import { rewrite } from "@vercel/functions";

// Edge runtime: env vars are on process.env (not typed without @types/node).
declare const process: { env: Record<string, string | undefined> };

export const config = {
  matcher: ["/api/:path*", "/auth/:path*", "/admin/:path*", "/health"],
};

export default function middleware(request: Request): Response {
  const backend = process.env.BACKEND_URL;
  if (!backend) {
    return Response.json({ error: "Misconfigured", message: "BACKEND_URL is not set on Vercel" }, { status: 500 });
  }
  const { pathname, search } = new URL(request.url);
  // Path and query unchanged; method, headers (cookies) and body are proxied as-is.
  return rewrite(new URL(`${pathname}${search}`, backend));
}
