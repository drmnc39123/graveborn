'use client';
// ANA SAYFA TANITIM KANVASI — oyunun kendisi, ekran görüntüsü değil.
//
// ⚠️ NİYE VAR: ana sayfa oyunu HİÇ göstermiyordu. Beş bölümün beşi de aynı
// şekildeydi (kicker + başlık + küçük koyu metin kutuları ızgarası) ve
// oyunun nasıl göründüğüne dair tek kare yoktu — arka plandaki köy haritası
// dışında. Bir survivors-like'ın vaadi HAREKETTİR; onu yazıyla anlatmak
// en zayıf anlatım biçimi.
//
// ⚠️ YENİ VARLIK ÜRETİLMEDİ, EKRAN GÖRÜNTÜSÜ DE YOK. Burada dönen şey
// GERÇEK OYUN: `Game` motoru + `render` çizicisi + `simPlayer` yapay
// oyuncusu. Üçü de depoda zaten vardı. Ekran görüntüsü koysaydık bakım
// yükü doğardı (oyun değişince bayatlar) ve dürüstlüğü de tartışmalı olurdu.
//
// ⚠️ SKOR YOK, KAYIT YOK, SUNUCU YOK. Bu bir koşu değil, bir vitrin:
// `onFinish` yok, ilerleme yazılmıyor, mühürle ilgisi yok.

import { useEffect, useRef } from 'react';
import { Game } from '@/game/engine';
import { STAGES, TICK } from '@/game/config';
import { seedFromString } from '@/game/rng';
import { render, resetEffects } from '@/game/render';
import { preloadAll } from '@/game/sprites';
import { fleeInput, smartPick } from '@/game/simPlayer';
import { C } from '@/lib/theme';

/**
 * ⚠️ SABİT GÖRÜŞ ALANI. Oyunun kendi kuralı: pencere boyutu simülasyonu
 * değiştiriyor (doğum halkası) — vitrin de olsa aynı sahneyi göstermek
 * için ölçü sabit tutuluyor, canvas ekrana ölçekleniyor.
 */
const GORUS_W = 960;
const GORUS_H = 300;

export function HomeAttract() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    /**
     * ⚠️ HAREKET KAPALIYKEN TEK KARE — "hiç çizme" YANLIŞTI ve ölçümle
     * görüldü: `prefers-reduced-motion` açık bir tarayıcıda geriye
     * "LIVE — THE ACTUAL GAME" etiketli BOŞ SİYAH KUTU kalıyordu, yani
     * bölümü hiç koymamaktan kötü bir sonuç.
     *
     * Doğru karşılama animasyonu kesmek, İÇERİĞİ kesmek değil: sahne
     * kuruluyor, bir kare çiziliyor ve orada duruyor. Hareket istemeyen
     * oyuncu da oyunun neye benzediğini görüyor.
     */
    const azHareket = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let atildi = false;
    let gorunur = true;

    resetEffects();
    preloadAll();

    const g = new Game(seedFromString('attract'), STAGES[0], {}, 'descent', undefined, 8);
    g.setViewport(GORUS_W, GORUS_H);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(GORUS_W * dpr);
    canvas.height = Math.round(GORUS_H * dpr);

    /**
     * ⚠️ EKRAN DIŞINDAYKEN DURUYOR. Ana sayfa uzun; kaydırınca görünmeyen
     * bir sahneyi çevirmek boşa CPU (ve telefonda boşa pil) demek.
     * ⚠️ `rAF` zaten gizli SEKMEDE durur ama aynı sayfada AŞAĞI kaydırmak
     * onu durdurmaz — bu ayrı bir kontrol.
     */
    const io = new IntersectionObserver(
      ([e]) => { gorunur = e.isIntersecting; },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    // ⚠️ SAHNEYİ KUR: sıfırıncı karede ekranda hiçbir şey yok (düşman
    // doğmamış, silah ateşlememiş). Birkaç saniye ilerletmeden çizmek
    // boş bir zemin göstermek olurdu.
    const isin = () => {
      // ⚠️ 25 SANİYE — ölçüldü. 6 saniyede sahne seyrek kalıyordu (birkaç
      // mermi, dağınık düşman) ve vitrin "oyun boş" izlenimi veriyordu.
      // 25 sn'de sürü toplanıyor, silahlar seviye atlıyor.
      for (let i = 0; i < Math.round(25 / TICK); i++) {
        g.hp = g.stats.maxHp;
        if (g.phase === 'levelup') g.choose(smartPick(g));
        if (g.phase !== 'running') break;
        g.setInput(...fleeInput(g));
        g.step();
      }
    };

    if (azHareket) {
      isin();
      /**
       * ⚠️ AYNI KAREYİ BİRKAÇ KEZ ÇİZ — ÖLÇÜLDÜ. Tek çizimde ekranda
       * hasar sayıları ve mermi izleri vardı ama DÜŞMAN SPRITE'LARI YOKTU:
       * `preloadAll()` asenkron ve promise döndürmüyor, yani ilk karede
       * görseller henüz gelmemiş oluyor (`drawActor` görsel hazır değilse
       * sessizce atlıyor). Animasyonlu yolda bu kendi kendine düzeliyor,
       * donuk yolda DONUP KALIYORDU.
       * ⚠️ SİMÜLASYON İLERLEMİYOR — `g.step()` yok. Sahne birebir aynı
       * kalıyor, sadece geç gelen görseller yerine oturuyor. Hareket
       * istemeyen oyuncu için hâlâ hareketsiz.
       */
      const ciz = () => render(ctx, g, GORUS_W, GORUS_H, dpr, TICK, null, []);
      ciz();
      const zamanlar = [300, 900, 1800].map((ms) => window.setTimeout(ciz, ms));
      return () => {
        for (const t of zamanlar) window.clearTimeout(t);
        io.disconnect();
        resetEffects();
      };
    }

    isin();
    let son = performance.now();
    const dongu = (now: number) => {
      if (atildi) return;
      raf = requestAnimationFrame(dongu);
      const dt = Math.min((now - son) / 1000, 0.1);
      son = now;
      if (!gorunur) return;

      // ⚠️ ÖLÜMSÜZ VE SONSUZ: vitrinin bitmesi ya da ölmesi anlamsız.
      // Motor ölçekleri değişmiyor — sadece can dolduruluyor.
      g.hp = g.stats.maxHp;
      if (g.phase === 'levelup') g.choose(smartPick(g));
      if (g.phase === 'running') {
        g.setInput(...fleeInput(g));
        // ⚠️ Sabit adım — motorun kuralı. `dt` ile sürmek simülasyonu
        // makineye göre değiştirirdi.
        let n = 0;
        for (let acc = dt; acc >= TICK && n < 3; acc -= TICK, n += 1) g.step();
      }
      render(ctx, g, GORUS_W, GORUS_H, dpr, dt, null, []);
    };
    raf = requestAnimationFrame(dongu);

    return () => {
      atildi = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      resetEffects();
    };
  }, []);

  return (
    <div style={{
      width: 'min(94vw, 880px)', margin: '0 auto',
      border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
      background: C.void, position: 'relative',
    }}>
      {/* ⚠️ `aspectRatio` ile ölçekleniyor: canvas iç ölçüsü SABİT
          (960×300), CSS ölçüsü kaba göre. Böylece dar ekranda da aynı
          sahne görünür, sadece küçülür. */}
      <canvas ref={canvasRef}
        style={{ display: 'block', width: '100%', aspectRatio: `${GORUS_W} / ${GORUS_H}` }} />
      {/* ⚠️ ETİKET ŞART: bu bir tanıtım videosu değil, oyunun kendisi —
          ve oyuncu bunu bilmeli. "Gerçek oyun" demeden gösterilen hareketli
          bir sahne, render edilmiş bir fragman sanılır. */}
      <div style={{
        position: 'absolute', left: 10, bottom: 8,
        fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: C.boneFaint,
      }}>
        LIVE — THE ACTUAL GAME, PLAYING ITSELF
      </div>
    </div>
  );
}
