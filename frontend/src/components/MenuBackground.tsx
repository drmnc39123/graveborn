'use client';
// ANA SAYFA ARKA PLANI — oyunun kendi köyü, yavaşça süzülerek.
//
// Neden gerçek harita: ana sayfada başka bir görsel göstermek hem oyuncuya
// yalan söylemek olurdu ("içeride bu var" dediğin şey içeride yok), hem de
// ikinci bir varlık takımının bakımı demekti. Aynı harita, aynı çizim kodu.

import { useEffect, useRef, useState } from 'react';
import { loadMapWorld, type MapWorld } from '@/game/mapWorld';
import { renderMenuBackground } from '@/game/hubRender';
import { preloadAll, preloadWorld, zeminHazirMi } from '@/game/sprites';
import { preloadKit } from '@/components/ui/kit';
import { BEKLEME_ZEMINI, C } from '@/lib/theme';

/** Kamera yolu — kapanmayan bir Lissajous, köyün üstünde tembelce dolaşır */
function cameraAt(world: MapWorld, t: number) {
  const mx = world.w / 2;
  const my = world.h / 2;
  const ax = Math.max(0, world.w / 2 - 420);
  const ay = Math.max(0, world.h / 2 - 320);
  return {
    x: mx + Math.sin(t * 0.035) * ax * 0.75,
    y: my + Math.cos(t * 0.021) * ay * 0.7,
  };
}

export function MenuBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let raf = 0;
    let world: MapWorld | null = null;
    let stopped = false;
    let hazirMi = false;
    const t0 = performance.now();
    let dpr = 1, cssW = 0, cssH = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    preloadAll();
    preloadKit();   // ana sayfadan /play'e geçince paneller çerçeveli açılsın
    loadMapWorld().then((w) => {
      if (stopped) return;
      world = w;
      /**
       * ⭐ ZEMİN GÖRSELLERİ DE ÖNDEN İSTENİYOR — harita gelmesi yetmiyor.
       * Ölçüldü: harita 1604 ms'de hazır, ilk zemin görseli 2172 ms'de
       * BAŞLIYOR. Aradaki 600 ms'de sahne çizilebilir DEĞİL.
       */
      if (w) preloadWorld(w.palette, w.objects.map((o) => o.src));
    }).catch(() => { /* harita yoksa düz zemin kalır — sayfa yine açılır */ });

    // ⚠️ Ana sayfa 60Hz'e ihtiyaç duymuyor. Kamera saniyede birkaç piksel
    // kayıyor; 30Hz hem aynı görünüyor hem de dizüstünde fanı çalıştırmıyor.
    const FRAME = 1 / 30;
    let acc = 0;
    let last = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      acc += dt;
      if (acc < FRAME) return;
      acc = 0;

      if (!world) return;
      /**
       * 🔴 "HAZIR" ARTIK HARİTA GELİNCE DEĞİL, ZEMİN ÇİZİLEBİLİNCE.
       *
       * Eski hâli `loadMapWorld` dönünce bayrağı kaldırıyordu: yükleme
       * göstergesi kayboluyor, tuval açılıyor ve zemin daha YOK. O
       * pencerede `drawTerrain` eksik karoyu düz koyu dikdörtgenle
       * dolduruyor — kullanıcının "siyah görüntüler" dediği şey bu.
       * ⚠️ Kontrol DÖNGÜDE, tek seferlik değil: görseller asenkron geliyor
       * ve hangi karede tamamlanacağı bilinmiyor.
       */
      if (!hazirMi) {
        /**
         * ⚠️ 2,5 SN TAVAN: tek bozuk/yavaş karo yüzünden ana sayfayı hiç
         * açmamak, bir sorunu daha kötüsüyle değiştirmek olurdu. Süre
         * dolarsa sahne olduğu gibi çiziliyor.
         */
        if (!zeminHazirMi(world.palette) && now - t0 < 2500) return;
        hazirMi = true;
        setReady(true);
      }
      const t = now / 1000;
      const cam = cameraAt(world, t);
      renderMenuBackground(ctx, world, cssW, cssH, dpr, t, cam.x, cam.y);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    // ⚠️ ZEMİN DÜZ SİYAH DEĞİL: tuval çizene kadar (JS + hidrasyon, ölçülen
    // ~1,6 sn) ekranda duran şey bu. Gerekçe `BEKLEME_ZEMINI` başlığında.
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: BEKLEME_ZEMINI }}>
      {/* ⚠️ TUVAL YUMUŞAK AÇILIYOR: zemin hazır olduğu an sert bir sıçrama
          yerine 400 ms'lik bir geçiş — bekleme zemininden sahneye. */}
      <canvas ref={ref} style={{
        width: '100%', height: '100%', display: 'block',
        opacity: ready ? 1 : 0, transition: 'opacity 400ms ease-out',
      }} />
      {/* Okunabilirlik perdesi — metin haritanın üstünde kaybolmasın.
          Merkeze doğru koyulaşıyor ki logo ve butonlar otursun. */}
      {/* ⚠️ PERDE DE TUVALLE BİRLİKTE AÇILIYOR. Sabit dursaydı, sahne
          çizilmeden önce KARARTACAK bir şey olmadığı hâlde ekranı
          karartıyordu — yani bekleme zeminini kendi eliyle siyaha
          çeviriyor ve düzeltmeyi görünmez kılıyordu. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          'radial-gradient(120% 90% at 50% 45%, rgba(10,8,6,0.86) 0%, rgba(10,8,6,0.62) 38%, rgba(10,8,6,0.80) 100%)',
        opacity: ready ? 1 : 0, transition: 'opacity 400ms ease-out',
      }} />
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: C.boneFaint, fontSize: 12, letterSpacing: 2,
        }}>
          …
        </div>
      )}
    </div>
  );
}
