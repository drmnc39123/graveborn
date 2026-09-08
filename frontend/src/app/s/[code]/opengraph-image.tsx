// DINAMIK PAYLASIM GORSELI — 1200x630.
//
// ⚠️ NODE CALISMA ZAMANI, edge DEGIL: Railway'de kendi Node sunucumuz
// var, edge yok. Varsayilana birakilirsa derleme gecer ama gorsel
// URETIMDE cizilmez ve kart bos gorunur.
//
// ⚠️ ELDE YAZILMIS STIL, Tailwind DEGIL: `next/og` satori kullaniyor ve
// yalniz duz flexbox + inline stil anliyor. Depo kurali zaten inline
// stil diyor; burada ayrica ZORUNLU.
//
// ⚠️ HARICI FONT YUKLENMIYOR. Oyunun piksel fontu bir dosya ve kart
// cizimi sirasinda onu getirmek her paylasimda ek bir istek + hata
// noktasi demek. Kartin isi okunmak; sistem fontu okunur.

import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'GRAVEBORN';

interface Kart {
  name: string; depth: number; cleared: number; ossuary: number;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export default async function Gorsel({ params }: { params: { code: string } }) {
  let k: Kart | null = null;
  try {
    if (API) {
      const r = await fetch(`${API}/referral/card/${encodeURIComponent(params.code)}`, {
        cache: 'no-store', signal: AbortSignal.timeout(3500),
      });
      if (r.ok) k = (await r.json()) as Kart;
    }
  } catch { /* veri yoksa kart yine cizilir — bkz. asagi */ }

  const kod = params.code.toUpperCase();

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: 64,
        // ⚠️ MOR YOK — depo kurali. Palet oyunun kendi renkleri.
        background: 'linear-gradient(160deg, #14100f 0%, #1d1614 55%, #0d0b0a 100%)',
        color: '#e3d8c0', fontFamily: 'sans-serif',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, letterSpacing: 10, color: '#8a97a3' }}>GRAVEBORN</div>
            <div style={{ fontSize: 22, color: '#6f6558', marginTop: 6 }}>Rise Again</div>
          </div>
          <div style={{
            display: 'flex', fontSize: 26, letterSpacing: 6, color: '#efa72e',
            border: '2px solid rgba(239,167,46,0.45)', borderRadius: 10, padding: '10px 20px',
          }}>{kod}</div>
        </div>

        {/* ⚠️ VERI GELMEZSE KART YINE CIZILIR. Bos bir gorsel, paylasimi
            olu bir baglantiya cevirirdi; oyunun adi ve daveti her hâlde
            gorunmeli. */}
        {k ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 34, color: '#8a97a3' }}>{k.name} went down to</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 4 }}>
              <div style={{ fontSize: 168, lineHeight: 1, color: '#efa72e', fontWeight: 700 }}>
                {k.depth}
              </div>
              <div style={{ fontSize: 40, color: '#6f6558', marginLeft: 18, marginBottom: 26 }}>
                depth
              </div>
            </div>
            <div style={{ display: 'flex', fontSize: 30, color: '#6f6558', marginTop: 12 }}>
              {k.cleared} stages cleared · monument {k.ossuary}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 74, color: '#e3d8c0', lineHeight: 1.15 }}>
              Survive the endless horde.
            </div>
            <div style={{ fontSize: 74, color: '#a01226', lineHeight: 1.15 }}>
              Die. Rise again stronger.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 28, color: '#6f6558' }}>playgraveborn.com</div>
          <div style={{ fontSize: 28, color: '#8a97a3' }}>How far do you get?</div>
        </div>
      </div>
    ),
    size,
  );
}
