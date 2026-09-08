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
import { Yonlendir } from './Yonlendir';
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
 * 🔴 SUNUCU YONLENDIRMESI YAPILMIYOR — OLCUMLE KARAR VERILDI.
 *
 * Ilk surum `redirect()` kullaniyordu ve uretimde olculdu: yanit
 * **HTTP 307** donuyordu. Govdede OG etiketleri vardi ama tarayicilar
 * yonlendirmeyi TAKIP EDER ve o zaman hedefin (ana sayfanin) genel
 * kartini gosterirler — yani paylasimin KISISEL olan tarafi, tam da onu
 * kurdugumuz yerde kaybolurdu. "Belki calisir" buyumenin en onemli
 * yuzeyinde kabul edilebilir bir cevap degil.
 *
 * Simdi: sayfa 200 doner ve etiketleri servis eder (tarayicinin gordugu),
 * insan ziyaretci ise istemci tarafinda oyuna gonderilir (tarayici
 * JavaScript CALISTIRMAZ, o yuzden karti gorur ve orada kalir).
 */
export default function PaylasimSayfasi({ params }: { params: { code: string } }) {
  const kod = params.code.toUpperCase();
  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24,
      background: '#14100f', color: '#e3d8c0', textAlign: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 13, letterSpacing: 8, color: '#8a97a3' }}>GRAVEBORN</div>
      <div style={{ fontSize: 22, color: '#e3d8c0' }}>You were invited.</div>
      <div style={{ fontSize: 14, color: '#6f6558' }}>
        Code <strong style={{ color: '#efa72e', letterSpacing: 3 }}>{kod}</strong>
      </div>
      {/* ⚠️ Baglanti JS calismasa da isliyor — yonlendirme bir kolaylik,
          tek yol degil. Betigi engelleyen bir tarayici davetiyeyi olu bir
          sayfaya cevirmemeli. */}
      <a href={`/?ref=${encodeURIComponent(kod)}`}
        style={{
          marginTop: 6, padding: '10px 22px', borderRadius: 8,
          border: '1px solid rgba(239,167,46,0.45)', color: '#efa72e',
          textDecoration: 'none', fontSize: 15, fontWeight: 700,
        }}>Enter the village</a>
      <Yonlendir kod={kod} />
    </main>
  );
}
