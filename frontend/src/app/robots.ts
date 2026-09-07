import type { MetadataRoute } from 'next';

/**
 * ⚠️ Admin paneli ve /editor BİLEREK listelenmiyor. robots.txt herkese
 * açık bir dosya; oraya "disallow: /gbadmin123" yazmak o yolu gizlemez,
 * İLAN EDER — panelin yolunu değiştirmenin tek amacı zaten görünmemek.
 * İkisi de siteden hiçbir yere bağlı değil, yani zaten taranmıyor —
 * ve asıl koruma `ADMIN_SECRET` (yoksa uçlar 403 döner).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://playgraveborn.com/sitemap.xml',
  };
}
