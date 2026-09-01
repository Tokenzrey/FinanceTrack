/**
 * Canonical site URL — the single source every SEO surface reads from
 * (`metadataBase`, sitemap/robots absolute URLs, OpenGraph, JSON-LD).
 *
 * Prefers an explicit `NEXT_PUBLIC_APP_URL` (set this to your real domain in
 * production). Falls back to Vercel's own deployment URL when deployed there without
 * one set, so sitemap/robots/OG still resolve to something correct out of the box —
 * then to localhost for local dev.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
).replace(/\/$/, '')
