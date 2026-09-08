// PAYLASIM SAYFASI — /s/<kod>
//
// ⚠️ NIYE AYRI SAYFA: ana sayfa herkes icin ayni gorseli gosterir ve
// paylasimin KISISEL olan tarafi kaybolur. Burasi paylasanin kendi
// rakamlariyla bir kart ciziyor ve tiklayan oyuna DAVET KODUYLA giriyor.
//
// ⚠️ SUNUCU BILESENI: OG etiketleri X'in ve Telegram'in sunuculari
// tarafindan okunuyor; onlar JavaScript CALISTIRMAZ. Istemci tarafinda
// uretilen bir baslik, paylasimda hic gorunmezdi.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BRAND } from '@/lib/theme';

/**
 * ⚠️ HER ISTEKTE TAZE. Oyuncunun derinligi degisiyor; onbellege alinmis
 * bir kart, aylar once ki rakami gosterip paylasimi yalanci yapardi.
 */
export const dynamic = 'force-dynamic';

interface Kart {
  name: string; hero: string; depth: number; stage: number;
  cleared: number; ossuary: number; title: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

async function kartVerisi(code: string): Promise<Kart | null> {
  if (!API) return null;
  try {
    const r = await fetch(`${API}/referral/card/${encodeURIComponent(code)}`, {
      cache: 'no-store',
      // ⚠️ Zaman asimi: X'in tarayicisi bekleyen bir sayfayi terk eder ve
      // kart hic cizilmez. Yavas bir yanit, yanitsizliktan beter.
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return (await r.json()) as Kart;
  } catch { return null; }
}

export async function generateMetadata(
  { params }: { params: { code: string } },
): Promise<Metadata> {
  const k = await kartVerisi(params.code);
  const baslik = k
    ? `${k.name} reached depth ${k.depth} in ${BRAND.name}`
    : `${BRAND.name} — ${BRAND.tagline}`;
  const aciklama = k
    ? `Depth ${k.depth} · ${k.cleared} stages cleared. Survive the endless horde, die, rise again stronger. Join with code ${params.code.toUpperCase()}.`
    : 'Survive the endless horde. Die. Rise again stronger. On Solana.';
  /**
   * ⚠️ GORSEL MUTLAK URL OLMAK ZORUNDA. Goreli bir yol X ve Telegram
   * tarafindan cozulmez — `layout.tsx` bunu `metadataBase` ile zaten
   * yaziyor ve o notu tekrarlamak yerine ondan yararlaniyoruz.
   */
  const gorsel = `/s/${params.code}/opengraph-image`;
  return {
    title: baslik,
    description: aciklama,
    openGraph: {
      type: 'website', siteName: BRAND.name, title: baslik, description: aciklama,
      images: [{ url: gorsel, width: 1200, height: 630, alt: baslik }],
    },
    twitter: { card: 'summary_large_image', title: baslik, description: aciklama, images: [gorsel] },
  };
}

/**
 * ⚠️ INSAN ZIYARETCI OYUNA GIDER, kartta oyalanmaz. Kart X icin var;
 * tiklayan kisi icin degerli olan sey oyunun kendisi. Kod adrese
 * yaziliyor ki giris ekraninda hazir dursun.
 */
export default function PaylasimSayfasi({ params }: { params: { code: string } }) {
  redirect(`/?ref=${encodeURIComponent(params.code.toUpperCase())}`);
}
