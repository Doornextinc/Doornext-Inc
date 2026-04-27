import type { MetadataRoute } from 'next'

/**
 * Prevent search engines from indexing the admin panel.
 * This is defence-in-depth — the admin panel is also protected by auth,
 * but we don't want it appearing in search results at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
