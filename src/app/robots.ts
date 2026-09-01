import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/shared/lib/site'

/**
 * Every authenticated app route is disallowed here rather than left to `noindex`
 * alone: there's genuinely nothing for a crawler to see without a session (Firebase
 * Auth lives client-side, in IndexedDB — see AuthGuard), so blocking the crawl itself
 * saves crawl budget rather than wasting it on empty/loading shells.
 *
 * `/share/report` is disallowed *and* marked `noindex` in its own metadata — belt and
 * braces for URLs that are ephemeral, per-user, and carry zero aggregate SEO value.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/privacy', '/terms', '/login', '/register'],
        disallow: [
          '/api/',
          '/dashboard',
          '/transactions',
          '/goals',
          '/wishlist',
          '/net-worth',
          '/history',
          '/reports',
          '/analytics',
          '/recurring',
          '/master-data',
          '/settings',
          '/scan-history',
          '/onboarding',
          '/forgot-password',
          '/share/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
