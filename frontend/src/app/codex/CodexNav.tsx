'use client';
// WHITEPAPER GEZINMESI — yapiskan kenar cubugu, okunan bolumu isaretler.
//
// ⚠️ SAYFA BUNSUZ DA OKUNUR. Butun metin sunucudan geliyor; burasi yalniz
// gezinmeyi kolaylastiriyor. JavaScript kapali bir tarayicida whitepaper
// eksiksiz duruyor, sadece kenar cubugu vurgulanmiyor.
//
// ⚠️ `IntersectionObserver` KULLANILIYOR, kaydirma dinleyicisi DEGIL:
// `scroll` her karede tetiklenir ve uzun bir belgede ana is parcacigini
// mesgul eder. Gozlemci ise yalniz bir bolum girip ciktiginda konusur.
//
// ⚠️ Telefonda kenar cubugu YOK: 1080 px'lik duzende iki sutun sigmiyor ve
// dar ekranda daraltilmis bir gezinme, metnin onunde duran bir engele
// donusuyordu. Orada belge basitce yukaridan asagi okunuyor.

import { useEffect, useState } from 'react';
import { C, FONT } from '@/lib/theme';

export function CodexNav({ bolumler }: {
  bolumler: readonly { id: string; kicker: string }[];
}) {
  const [aktif, setAktif] = useState<string>(bolumler[0]?.id ?? '');
  const [genis, setGenis] = useState(false);

  // ⚠️ Genislik MONTAJDAN SONRA okunuyor: sunucuda `window` yok ve ilk
  // cizimde okumak hydration uyusmazligi uretirdi.
  useEffect(() => {
    const olc = () => setGenis(window.innerWidth >= 900);
    olc();
    window.addEventListener('resize', olc);
    return () => window.removeEventListener('resize', olc);
  }, []);

  useEffect(() => {
    if (!genis) return;
    const hedefler = bolumler
      .map((b) => document.getElementById(b.id))
      .filter((el): el is HTMLElement => !!el);
    if (hedefler.length === 0) return;

    /**
     * ⚠️ `rootMargin` UST TARAFA DOGRU DARALTILIYOR: olmadan, ekranin
     * altinda yeni beliren bir bolum "aktif" sayilir ve isaret okunan
     * yerin ONUNDE kosar. Bant ekranin ust ucte birine sabitleniyor.
     */
    const gozlemci = new IntersectionObserver(
      (girisler) => {
        for (const g of girisler) {
          if (g.isIntersecting) setAktif(g.target.id);
        }
      },
      { rootMargin: '0px 0px -66% 0px', threshold: 0 },
    );
    for (const el of hedefler) gozlemci.observe(el);
    return () => gozlemci.disconnect();
  }, [bolumler, genis]);

  if (!genis) return null;

  return (
    <nav style={{
      position: 'sticky', top: 24, flexShrink: 0, width: 168,
      paddingTop: 34, fontFamily: FONT.ui,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 900, letterSpacing: 2, color: C.boneFaint, marginBottom: 10,
      }}>CONTENTS</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {bolumler.map((b) => {
          const on = b.id === aktif;
          return (
            <li key={b.id} style={{ marginBottom: 2 }}>
              {/* ⚠️ GERCEK BIR `<a href="#...">`: JavaScript kapaliyken de
                  calisir ve baglanti kopyalanabilir. Bir `onClick`
                  dinleyicisi ikisini de kaybettirirdi. */}
              <a href={`#${b.id}`} style={{
                display: 'block', padding: '5px 9px', borderRadius: 5,
                fontSize: 10, fontWeight: 900, letterSpacing: 1,
                textDecoration: 'none',
                color: on ? C.bone : C.boneFaint,
                background: on ? 'rgba(138,151,163,0.18)' : 'transparent',
                borderLeft: `2px solid ${on ? C.candle : 'transparent'}`,
              }}>{b.kicker}</a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
