import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/shared/lib/site'

/**
 * Only real, publicly indexable destinations — deliberately excludes:
 *  - `/` itself: a pure redirect to `/login`, no content of its own to index
 *    (Google's own guidance: list the destination, not a URL that just redirects).
 *  - Every authenticated `(main)/*` route: gated behind login, nothing for a crawler
 *    to see without a session, covered by `robots.ts` instead.
 *  - `/forgot-password`, `/onboarding`: utility flow pages, zero organic search value.
 *  - `/share/report`: dynamic, per-user, marked `noindex` in its own metadata.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-09-01')

  const routes: {
    path: string
    priority: number
    changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>
  }[] = [
    { path: '/login', priority: 1, changeFrequency: 'monthly' },
    { path: '/register', priority: 1, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.4, changeFrequency: 'yearly' },
  ]

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
