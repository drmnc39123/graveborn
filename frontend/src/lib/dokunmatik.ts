'use client';
// DOKUNMATİK Mİ — tek kaynak.
//
// 🔴 NİYE ORTAK MODÜL: aynı algılama ÜÇ yerde ayrı ayrı yazılmıştı
// (`HubCanvas`, `GameCanvas`, koşu ipucu) ve üçü aynı şeyi söylemiyordu.
// Biri yalnız `(pointer: coarse)` okuyordu ve ÖLÇÜLDÜ: mobil görünümde
// sorgu `true` dönerken arayüz masaüstü davranışını gösteriyordu — sorgu
// mount anında okunuyor, sonradan `change` olayı güvenilir gelmiyor.
//
// ⚠️ ÜÇ KAYNAK, TEK KAYNAĞA DÖNME:
//   1. `(pointer: coarse)` — masaüstü/dokunmatik ayrımı
//   2. `maxTouchPoints` — cihaz öykünmesinde ve gerçek telefonda mount'ta hazır
//   3. İLK `touchstart` — kanıtın kendisi; parmak değdiyse tartışma biter
//
// ⚠️ SUNUCUDA `false`: `window` yok ve ilk çizim sunucuda yapılıyor. Yanlış
// tarafa düşmek yerine masaüstü varsayılıp istemcide düzeltiliyor
// (hydration uyuşmazlığı olmasın diye durum efektte set ediliyor).

import { useEffect, useState } from 'react';

/** Parmakla kullanılabilir dokunma hedefi — altına inme (WCAG 2.5.8 ≥ 24, oyun içi 32) */
export const DOKUNMA_HEDEFI = 32;

/** Anlık okuma — kanca kullanamayan yerler için (olay işleyicisi vb.) */
export function dokunmatikMi(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  return mq || (navigator.maxTouchPoints ?? 0) > 0;
}

/** Bileşenler için: ilk dokunuşta da kendiliğinden `true` olur */
export function useDokunmatik(): boolean {
  const [kaba, setKaba] = useState(false);
  useEffect(() => {
    const olc = () => { if (dokunmatikMi()) setKaba(true); };
    olc();
    // ⚠️ Bir kez: parmak değdiyse geri dönüş yok
    const dokunma = () => setKaba(true);
    window.addEventListener('touchstart', dokunma, { once: true, passive: true });
    const mq = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)') : null;
    mq?.addEventListener('change', olc);
    return () => {
      window.removeEventListener('touchstart', dokunma);
      mq?.removeEventListener('change', olc);
    };
  }, []);
  return kaba;
}
