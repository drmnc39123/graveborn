'use client';
// HAREKET KATMANI — tek ilkel seti, panellerin hepsi buradan besleniyor.
//
// ⚠️ NİYE VAR: ÖLÇÜLDÜ. Tüm uygulamada 6 `animation` ve 6 `transition` vardı;
// altı animasyonun beşi sprite şeridi döngüsüydü (süs). Gerçek arayüz geçişi
// TEK taneydi: panelin 160 ms açılışı. Yani Forge'da 120.000 gold harcanınca
// sayı ANINDA zıplıyordu — oyuncunun tek geri bildirimi, bir şeyin değişmiş
// olmasıydı; DEĞİŞTİĞİNİ görmüyordu.
//
// ⚠️ ERİŞİLEBİLİRLİK BURADA, HER ÇAĞRI YERİNDE DEĞİL. `screenShake` ayarının
// dersi aynen geçerli (`settings.ts`): hareket kapatılabilir olmalı, çünkü
// vestibüler rahatsızlığı olan oyuncu için zorunlu hareket oyunu oynanamaz
// yapar. Kapalıyken **BİLGİ KAYBOLMAZ, yalnız hareket kalkar** — sayaç son
// değeri anında gösterir, kart görünür, hiçbir veri gizlenmez.
//
// ⚠️ İKİ KAYNAK BİRDEN: işletim sisteminin `prefers-reduced-motion` tercihi
// VE oyunun kendi `lowGraphics` ayarı. Birincisi hiç kullanılmıyordu; oyuncu
// sistem genelinde "hareketi azalt" dese bile oyun umursamıyordu.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { loadSettings } from '@/game/settings';

/**
 * Hareket kapalı mı?
 *
 * ⚠️ SSR GÜVENLİ: sunucuda `window` yok → `false` döner ve ilk çizim
 * hareketliymiş gibi kurulur. Bu bilinçli; tersi (varsayılan kapalı) sunucu
 * ile istemci çıktısını ayrıştırıp hydration uyarısı üretirdi.
 */
export function motionOff(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
    return loadSettings().lowGraphics;
  } catch {
    return false;
  }
}

/**
 * SAYAN SAYI — bu katmanın en büyük kaldıracı.
 *
 * Forge'da bir seviye alınca gold anında düşüyordu. Sayının SAYMASI, "bir şey
 * oldu" bilgisini ücretsiz veriyor: oyuncu ne kadar harcadığını okumak zorunda
 * kalmıyor, görüyor.
 *
 * ⚠️ ARTIŞA DA AZALIŞA DA çalışır — ödül de harcama da aynı ilkelden geçsin.
 * ⚠️ İLK DEĞER SAYILMAZ. Panel açılır açılmaz 0'dan 118.874'e koşan bir sayaç,
 *    bilgi değil gürültü olurdu; yalnızca DEĞİŞİM canlandırılıyor.
 * ⚠️ Süre farkla ölçeklenmiyor: 12 gold ile 120.000 gold aynı sürede
 *    tamamlanıyor. Aksi hâlde büyük harcamalar saniyelerce sürer ve panel
 *    kilitlenmiş gibi hissettirirdi.
 */
export function useCountUp(value: number, ms = 420): number {
  const [gosterilen, setGosterilen] = useState(value);
  const oncekiRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onceki = oncekiRef.current;
    oncekiRef.current = value;
    if (onceki === value) return;

    // Hareket kapalı → anında son değer. Bilgi kaybolmuyor.
    if (motionOff() || ms <= 0) { setGosterilen(value); return; }

    const bas = performance.now();
    const fark = value - onceki;
    const adim = (t: number) => {
      const k = Math.min(1, (t - bas) / ms);
      // easeOutCubic — sonda yavaşlayınca "yerine oturdu" hissi veriyor
      const e = 1 - Math.pow(1 - k, 3);
      setGosterilen(onceki + fark * e);
      if (k < 1) rafRef.current = requestAnimationFrame(adim);
    };
    rafRef.current = requestAnimationFrame(adim);

    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [value, ms]);

  return gosterilen;
}

/** Sayan tamsayı — gold gibi kesirsiz gösterilen değerler için */
export function useCountUpInt(value: number, ms = 420): number {
  return Math.round(useCountUp(value, ms));
}

/**
 * ORTAK KEYFRAME'LER.
 *
 * ⚠️ Bileşenin İÇİNDE tanımlı olmak zorunda, ortak bir global CSS dosyasında
 * değil — `Identity.tsx`teki kuralın aynısı: bu ilkeller birbirinden bağımsız
 * yerlerde kullanılıyor ve başka bir bileşenin `<style>`ına güvenmek onları
 * sessizce hareketsiz bırakır. Aynı ada sahip iki tanım zararsız.
 */
const KEYFRAMES = `
@keyframes gb-pop { 0% { transform: scale(0.72); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
@keyframes gb-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes gb-slide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
`;

export function MotionStyles() {
  return <style>{KEYFRAMES}</style>;
}

/**
 * ÖDÜL ANI — "bir şey kazandın" jesti.
 *
 * ⚠️ Keyframe Reliquary sandığında ZATEN vardı ve doğru yapılmıştı; oraya
 * hapsolmuştu. İlk-geçiş ödülü, evrim, nadir loot ve başarım da aynı anı
 * hak ediyor — kopyalamak yerine buraya taşındı.
 */
export function Reveal({ children, delay = 0, style }: {
  children: ReactNode; delay?: number; style?: CSSProperties;
}) {
  const kapali = motionOff();
  return (
    <div style={{
      animation: kapali ? undefined : `gb-pop 0.34s ease-out ${delay}ms both`,
      ...style,
    }}>
      {!kapali && <MotionStyles />}
      {children}
    </div>
  );
}

/**
 * SEKME / BÖLÜM GEÇİŞİ.
 *
 * ⚠️ `keyed` DEĞİŞİNCE yeniden oynar — React'e `key` vermek yerine burada
 * tutuluyor ki çağıran taraf animasyonu düşünmek zorunda kalmasın.
 */
export function Fade({ children, keyed, slide = false, style }: {
  children: ReactNode;
  /** değiştiğinde geçiş yeniden oynar (sekme adı, görünüm id'si…) */
  keyed?: string | number;
  /** hafif yukarı kayma ekle */
  slide?: boolean;
  style?: CSSProperties;
}) {
  const kapali = motionOff();
  return (
    <div key={keyed} style={{
      animation: kapali ? undefined : `${slide ? 'gb-slide' : 'gb-fade'} 180ms ease-out both`,
      ...style,
    }}>
      {!kapali && <MotionStyles />}
      {children}
    </div>
  );
}
