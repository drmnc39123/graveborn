import type { MetadataRoute } from 'next';

/**
 * ⚠️ /admin ve /editor BİLEREK listelenmiyor. robots.txt herkese açık bir
 * dosya; oraya "disallow: /admin" yazmak o yolu gizlemez, İLAN EDER.
 * İkisi de siteden hiçbir yere bağlı değil, yani zaten taranmıyor —
 * ve asıl koruma `ADMIN_SECRET` (yoksa uçlar 403 döner).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://playgraveborn.com/sitemap.xml',
  };
}
