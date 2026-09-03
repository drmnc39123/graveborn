import type { MetadataRoute } from 'next';

// ⚠️ Yalnız oyuncuya açık iki yüzey. /admin ve /editor buraya GİRMEZ.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://playgraveborn.com/', changeFrequency: 'daily', priority: 1 },
    { url: 'https://playgraveborn.com/play', changeFrequency: 'daily', priority: 0.8 },
  ];
}
