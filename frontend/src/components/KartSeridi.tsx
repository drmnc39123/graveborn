'use client';
// KART ŞERİDİ — telefonda sağ kolon kartları YAN YANA, tek tek.
//
// 🔴 KULLANICI İSTEĞİ (2026-09-18): *"mobilde bu çok fazla alan kaplıyor —
// mini map altındaki etkinlik, weekly boss ve Ready for descent kartları.
// Desktop'taki gibi aşağı yukarı değil, mobilde sağa sola kaymalı,
// tıklamalı olsun."* Ölçüldü (375x560 Phantom): üç kart alt alta ~480 px,
// köyün sağ yarısının neredeyse tamamı.
//
// ⚠️ YERLİ KAYDIRMA, KÜTÜPHANE YOK: `scrollSnapType` ile parmak kaydırması
// tarayıcının kendi hareketi — Phantom/iOS WKWebView'da en akıcı yol ve
// dokunma olaylarını köy canvas'ının joystick'inden ayırmak için ekstra kod
// gerekmiyor (şerit canvas'ın ÜSTÜNDE, olay oraya hiç inmiyor).
//
// ⚠️ BOŞ KART SAYILMAZ: EventBanner/BossKarti/NoticeBanner veri yokken
// `null` döndürüyor. Boş slayt gösterilseydi oyuncu boş bir sayfaya
// kaydırırdı; slaytlar DOM'dan sayılıyor ve boşlar gizleniyor.

import { Children, useEffect, useRef, useState } from 'react';
import { C, FONT } from '@/lib/theme';

/** Dokunma hedefi — BuildingDock `KONTROL_DOKUNMA` ile aynı */
const DOKUNMA = 32;

export function KartSeridi({ children }: { children: React.ReactNode }) {
  const serit = useRef<HTMLDivElement>(null);
  /** Dolu slaytların DOM indisleri */
  const [dolu, setDolu] = useState<number[]>([]);
  const [etkin, setEtkin] = useState(0);
  const cocuklar = Children.toArray(children);

  // Dolu slaytları say — kartlar veriyi kendileri çektiği için sonradan dolabilir
  useEffect(() => {
    const el = serit.current;
    if (!el) return;
    const say = () => {
      const d: number[] = [];
      [...el.children].forEach((s, i) => {
        const bos = s.childElementCount === 0;
        (s as HTMLElement).style.display = bos ? 'none' : 'block';
        if (!bos) d.push(i);
      });
      setDolu((eski) => {
        if (eski.join() === d.join()) return eski;
        // 🔴 Ölçüldü: etkinlik kartı sonradan dolunca tarayıcı konumu
        // koruyor ve şerit İKİNCİ kartta açılıyordu. Küme değişince başa dön.
        el.scrollLeft = 0;
        setEtkin(0);
        return d;
      });
    };
    say();
    const mo = new MutationObserver(say);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Hangi slayt görünüyor — kaydırma konumundan
  const kaydirildi = () => {
    const el = serit.current;
    if (!el || el.clientWidth === 0) return;
    setEtkin(Math.round(el.scrollLeft / el.clientWidth));
  };

  const git = (i: number) => {
    const el = serit.current;
    if (!el) return;
    const n = Math.max(0, Math.min(dolu.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    setEtkin(n);
  };

  const cok = dolu.length > 1;
  const oklar = {
    all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
    width: DOKUNMA, height: DOKUNMA, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: FONT.ui, fontSize: 16, fontWeight: 900, color: C.bone,
  } as const;

  return (
    <div>
      <div ref={serit} onScroll={kaydirildi}
        style={{
          display: 'flex', overflowX: 'auto', overflowY: 'hidden',
          scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          // ⚠️ Yatay kaydırma şeritte kalsın, sayfayı/köyü itmesin
          overscrollBehaviorX: 'contain', touchAction: 'pan-x',
          alignItems: 'flex-start',
        }}>
        {cocuklar.map((c, i) => (
          <div key={i} style={{ flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'start' }}>{c}</div>
        ))}
      </div>
      {cok && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 2 }}>
          <button aria-label="Previous card" onClick={() => git(etkin - 1)}
            style={{ ...oklar, opacity: etkin > 0 ? 1 : 0.3 }}>‹</button>
          {dolu.map((_, i) => (
            <button key={i} aria-label={`Card ${i + 1} of ${dolu.length}`} onClick={() => git(i)}
              style={{ ...oklar, width: 20 }}>
              <span style={{
                width: 7, height: 7, borderRadius: 7,
                background: i === etkin ? C.candle : 'rgba(255,255,255,0.28)',
              }} />
            </button>
          ))}
          <button aria-label="Next card" onClick={() => git(etkin + 1)}
            style={{ ...oklar, opacity: etkin < dolu.length - 1 ? 1 : 0.3 }}>›</button>
        </div>
      )}
    </div>
  );
}
