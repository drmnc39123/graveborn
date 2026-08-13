'use client';
// ANA SAYFA ARKA PLANI — oyunun kendi köyü, yavaşça süzülerek.
//
// Neden gerçek harita: ana sayfada başka bir görsel göstermek hem oyuncuya
// yalan söylemek olurdu ("içeride bu var" dediğin şey içeride yok), hem de
// ikinci bir varlık takımının bakımı demekti. Aynı harita, aynı çizim kodu.

import { useEffect, useRef, useState } from 'react';
import { loadMapWorld, type MapWorld } from '@/game/mapWorld';
import { renderMenuBackground } from '@/game/hubRender';
import { preloadAll } from '@/game/sprites';
import { preloadKit } from '@/components/ui/kit';
import { C } from '@/lib/theme';

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
      setReady(true);
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: C.void }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      {/* Okunabilirlik perdesi — metin haritanın üstünde kaybolmasın.
          Merkeze doğru koyulaşıyor ki logo ve butonlar otursun. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          'radial-gradient(120% 90% at 50% 45%, rgba(10,8,6,0.86) 0%, rgba(10,8,6,0.62) 38%, rgba(10,8,6,0.80) 100%)',
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
