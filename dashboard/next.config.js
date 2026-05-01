/** @type {import('next').NextConfig} */
//
// Rewrites (development + production via `next start`) let the browser hit
// /api/* and /ws/* on the SAME host the dashboard runs on, and Next.js
// proxies them to the FastAPI backend. The point of single-host serving:
//
//   1. ngrok / production tunnel only needs to expose port 3000 — one URL
//      drives the whole demo. No CORS, no second tunnel for /ws.
//   2. The browser uses RELATIVE URLs (e.g. fetch("/api/workers")), so
//      whatever domain the dashboard is reached on (localhost, ngrok,
//      App Platform), the API + WS traffic follow it.
//
// API_PROXY_TARGET defaults to localhost:8000 (the api dev server). Set
// it to the App Platform internal URL (or any reachable backend) when
// deploying behind a custom proxy. The /ws/:path* rewrite lets the
// upgrade pass through; ngrok forwards the WebSocket upgrade transparently.
const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // NEXT_PUBLIC_* vars are auto-exposed client-side; listing them here makes
  // the required set explicit for operators reading the config.
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${API_PROXY_TARGET}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
