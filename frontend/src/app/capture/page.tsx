'use client';
// KARE YAKALAMA TEZGÂHI — tanıtım videosunun dövüş sahneleri buradan çıkıyor.
//
// 🔴 NİYE VAR: X'te paylaşılacak tanıtım videosunda gösterilen oyun
// görüntüsü GERÇEK OYUN olmalı, elle çizilmiş bir sahne değil.
// `HomeAttract` zaten aynı numarayı yapıyor (motor + çizici + yapay
// oyuncu, ana sayfada canlı); burası onun VİDEO için sabit adımlı,
// deterministik ve diske yazan sürümü.
//
// ⚠️ ÜRETİMDE DERLENMİYOR. `testMode.ts` ile aynı kapı: `NODE_ENV`
// production'da bu sayfa boş döner, bundler ölü kodu atar. Sayfa hiçbir
// şey yazmaz/okumaz — ne `Progress`e ne sunucuya dokunur.
//
// ⚠️ SABİT ADIM ŞART. `requestAnimationFrame` süresiyle sürmek, videoyu
// makinenin o anki yüküne göre değiştirirdi: aynı komut iki farklı video
// üretirdi. Burada kare sayısı ve adım sayısı sayılıyor, saat değil.
//
// Kullanım (dev sunucusu + `promo/tools/sink.mjs` açıkken):
//   /capture?scene=fight1&stage=5&seed=7&hero=knight&warm=120&frames=90

import { useEffect, useRef, useState } from 'react';
import { Game } from '@/game/engine';
import { STAGES, TICK, stageById } from '@/game/config';
import { seedFromString } from '@/game/rng';
import { render, resetEffects } from '@/game/render';
import { preloadAll, preloadWorld, zeminHazirMi } from '@/game/sprites';
import { fleeInput, smartPick } from '@/game/simPlayer';
import { loadMapWorld, type MapWorld } from '@/game/mapWorld';
import { renderMenuBackground } from '@/game/hubRender';
import { applyQuality } from '@/game/quality';
import { C, FONT } from '@/lib/theme';

const SINK = 'http://127.0.0.1:7788';

function sayi(p: URLSearchParams, ad: string, yedek: number): number {
  const v = Number(p.get(ad));
  return Number.isFinite(v) && p.get(ad) !== null && p.get(ad) !== '' ? v : yedek;
}

/**
 * ⚠️ WEBP, JPEG DEĞİL — ÖLÇÜLEBİLİR BİR SEBEPLE. Oyun piksel sanat:
 * her kenar keskin ve JPEG tam da keskin kenarda halka (ringing) üretiyor,
 * yani sprite'ların çevresi videoda kirleniyor. PNG temiz ama kare başına
 * ~2 MB → 1.200 karede 2,5 GB. WebP ikisinin arası: keskin kenarı bozmuyor,
 * dosya JPEG boyutunda.
 *
 * ⚠️ Kare gönderimi SIRAYLA bekleniyor — paralel gönderimde yüzlerce açık
 * istek belleği şişiriyor ve yakalama ortasında sekmeyi düşürüyor.
 */
async function kareGonder(canvas: HTMLCanvasElement, scene: string, i: number) {
  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, 'image/webp', 0.94));
  if (!blob) return;
  await fetch(SINK + '/frame?scene=' + encodeURIComponent(scene) + '&i=' + i + '&ext=webp', {
    method: 'POST', body: blob,
  });
}

/**
 * 🔴 MODÜL DÜZEYİNDE, `useRef` DEĞİL — VE BU ÖLÇÜLDÜ.
 *
 * İlk sürümde nöbet `useRef` idi ve temizleyici `iptal = true` yazıyordu.
 * React 18 geliştirme modunda etki ÇALIŞTIRILIP HEMEN TEMİZLENİYOR, sonra
 * yeniden çalıştırılıyor: nöbet ikinci koşuyu engelledi, ama BİRİNCİ
 * koşunun temizleyicisi `iptal`i true yaptı. Sonuç: yakalama döngüsü sıfır
 * kez döndü, sayfa yine de "bitti" dedi ve sürücü `✓ 0/6 kare` yazdı —
 * yani ALET BAŞARILI GÖRÜNÜP HİÇBİR ŞEY ÜRETMEDİ.
 *
 * ⚠️ TEMİZLEYİCİ BİLEREK BOŞ. Bu sayfa tek atımlık bir tezgâh: sekme
 * kapanana kadar yaşıyor, sökülecek bir şey yok.
 */
let baslatildi = false;

export default function CapturePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [durum, setDurum] = useState('hazırlanıyor…');
  const [bitti, setBitti] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (baslatildi) return;
    baslatildi = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const p = new URLSearchParams(window.location.search);
    const scene = p.get('scene') || 'scene';
    const kind = p.get('kind') || 'run';
    const fps = sayi(p, 'fps', 30);
    const frames = sayi(p, 'frames', 90);
    const vw = sayi(p, 'vw', 960);
    const vh = sayi(p, 'vh', 540);
    const scale = sayi(p, 'scale', 2);

    // ⚠️ EN YÜKSEK KADEME ZORLANIYOR. Kayıt makinesinin kendi ayarı
    // videoya sızmamalı: ULTRA LOW'da yakalanan bir sahne oyunu
    // olduğundan çirkin gösterirdi.
    applyQuality('ultra');

    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);

    const bekle = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

    (async () => {
      if (kind === 'music') {
        /**
         * 🔴 MÜZİK DE OYUNDAN ÇIKIYOR — dışarıdan lisanslı bir parça değil.
         * `game/music.ts` prosedürel: dosyasız, re minör, sahneye göre
         * katman açan bir zamanlayıcı. Tanıtım videosuna başka bir müzik
         * koymak, oyunun sesini duymamış bir video üretirdi.
         *
         * ⚠️ OFFLINE RENDER YAPILAMIYOR: `music.ts` gerçek zamanlı
         * `setTimeout` ile besleniyor ve `OfflineAudioContext` ile
         * çalışmıyor. O yüzden GERÇEK ZAMANDA kaydediliyor — 73 saniye
         * sürüyor ve bu kabul edilebilir.
         *
         * 🔴 ÇIKIŞ NASIL YAKALANIYOR: `music.ts` kendi zincirini doğrudan
         * `ctx.destination`a bağlıyor ve dışarıya bir ana düğüm vermiyor.
         * `destination`ın çıkışı okunamaz. Bu yüzden `AudioNode.connect`
         * sarılıyor: `destination`a yapılan HER bağlantı bir
         * `MediaStreamDestination`a da yapılıyor. Oyun kodunda tek satır
         * değişiklik gerekmiyor — tanıtım aracı oyuna dokunmamalı.
         */
        const sn = sayi(p, 'secs', 73);
        const { sesBaglami, setSoundEnabled, setVolume } = await import('@/game/sfx');
        const { muzikBaslat, muzikSahne, muzikYogunluk, muzikAcik, muzikDurdur } =
          await import('@/game/music');

        setSoundEnabled(true);
        setVolume(1);
        const ctx = sesBaglami();
        if (!ctx) { setDurum('HATA: ses bağlamı yok'); return; }
        await ctx.resume().catch(() => {});

        const kayitHedefi = ctx.createMediaStreamDestination();
        const eskiConnect = AudioNode.prototype.connect;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AudioNode.prototype as any).connect = function (this: AudioNode, hedef: any, ...rest: any[]) {
          const r = eskiConnect.call(this, hedef, ...rest);
          // ⚠️ `any`: `connect` aşırı yüklü (AudioNode | AudioParam) ve
          // TypeScript sarmalayıcıda hangi imzayı kullandığımızı bilemiyor.
          if (hedef === ctx.destination) (eskiConnect as any).call(this, kayitHedefi);
          return r;
        };

        const kayit = new MediaRecorder(kayitHedefi.stream, {
          mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192_000,
        });
        const parcalar: Blob[] = [];
        kayit.ondataavailable = (e) => { if (e.data.size) parcalar.push(e.data); };

        muzikAcik(true);
        muzikBaslat('village');
        kayit.start();

        /**
         * ZAMAN ÇİZELGESİ — videonun kurgusuyla ELLE eşleştirildi
         * (`Trailer.tsx` sahne süreleri, 30 fps). Saniyeler kare
         * sayılarından hesaplandı, göz kararı değil.
         */
        const cizelge: [number, 'village' | 'combat' | 'boss', number][] = [
          [0.0, 'combat', 0.85],   // açılış vuruşları
          [2.7, 'boss', 1.0],      // başlık
          [5.5, 'combat', 0.6],    // koşu
          [9.3, 'combat', 0.95],   // build
          [12.7, 'combat', 0.75],  // kahramanlar
          [19.8, 'boss', 1.0],     // boss
          [23.9, 'combat', 0.9],   // descent
          [27.8, 'village', 0.3],  // söz
          [30.6, 'village', 0.5],  // köy
          [34.5, 'village', 0.65], // paneller
          [51.7, 'combat', 0.9],   // the pit
          [54.2, 'village', 0.55], // dörtlü
          [57.1, 'combat', 0.85],  // beta
          [61.2, 'boss', 0.95],    // token
          [66.3, 'village', 0.35], // kapanış
        ];
        let sahneAdi: string = 'village';
        for (const [t, s, y] of cizelge) {
          setTimeout(() => {
            if (s !== sahneAdi) { muzikSahne(s); sahneAdi = s; }
            muzikYogunluk(y);
          }, t * 1000);
        }

        for (let i = 0; i < sn; i++) {
          await bekle(1000);
          setDurum('müzik kaydediliyor… ' + (i + 1) + '/' + sn + 'sn');
        }

        const bitti = new Promise<Blob>((ok) => {
          kayit.onstop = () => ok(new Blob(parcalar, { type: 'audio/webm' }));
        });
        kayit.stop();
        muzikDurdur();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AudioNode.prototype as any).connect = eskiConnect;

        const blob = await bitti;
        await fetch(SINK + '/audio?scene=' + encodeURIComponent(scene), {
          method: 'POST', body: blob,
        });
        setDurum('bitti — ' + Math.round(blob.size / 1024) + ' KB ses');
        setBitti(true);
        return;
      }

      if (kind === 'village') {
        setDurum('köy haritası yükleniyor…');
        const world: MapWorld | null = await loadMapWorld();
        if (!world) { setDurum('HATA: harita yok'); return; }
        preloadAll();
        preloadWorld(world.palette, world.objects.map((o) => o.src));
        // ⚠️ ZEMİN GERÇEKTEN GELSİN. `zeminHazirMi` tam da bu tuzak için
        // yazılmıştı: hazır olmadan çizince karolar siyah kutu kalıyor.
        for (let i = 0; i < 60 && !zeminHazirMi(world.palette, 0.98); i++) await bekle(150);
        await bekle(1500);

        const x0 = sayi(p, 'x0', world.w / 2 - 300);
        const y0 = sayi(p, 'y0', world.h / 2 - 200);
        const x1 = sayi(p, 'x1', world.w / 2 + 300);
        const y1 = sayi(p, 'y1', world.h / 2 + 120);
        const t0 = sayi(p, 't0', 10);

        for (let i = 0; i < frames; i++) {
          const u = frames <= 1 ? 0 : i / (frames - 1);
          // ⚠️ Yumuşak giriş/çıkış — düz doğrusal kaydırma videoda ucuz durur.
          const e = u * u * (3 - 2 * u);
          renderMenuBackground(
            ctx, world, vw, vh, scale, t0 + i / fps,
            x0 + (x1 - x0) * e, y0 + (y1 - y0) * e,
          );
          await kareGonder(canvas, scene, i);
          if (i % 15 === 0) setDurum('köy ' + i + '/' + frames);
        }
        await fetch(SINK + '/done?scene=' + scene);
        setDurum('bitti — ' + frames + ' kare');
        setBitti(true);
        return;
      }

      // ── DÖVÜŞ SAHNESİ ───────────────────────────────────────────────
      const stageId = sayi(p, 'stage', 1);
      const hero = p.get('hero') || 'knight';
      const seed = p.get('seed') || 'promo';
      const warm = sayi(p, 'warm', 60);
      const until = p.get('until') || '';
      const mode = (p.get('mode') || 'campaign') as 'campaign' | 'descent';
      const startDepth = sayi(p, 'depth', 1);

      setDurum('görseller yükleniyor…');
      preloadAll(hero);
      await bekle(3000);

      resetEffects();
      const def = stageById(stageId) ?? STAGES[0];
      const g = new Game(seedFromString(seed), def, {}, mode, hero, startDepth);
      g.setViewport(vw, vh);

      /** Bir simülasyon adımı — yapay oyuncu, ölümsüzlük, kart seçimi. */
      const adim = () => {
        g.hp = g.stats.maxHp;               // ⚠️ vitrin ölmez
        if (g.phase === 'levelup') g.choose(smartPick(g));
        if (g.phase !== 'running') return false;
        g.setInput(...fleeInput(g));
        g.step();
        return true;
      };

      setDurum('sahne kuruluyor…');
      // ⚠️ Isınma render'sız: sadece simülasyon. Sürü toplansın, silahlar
      // seviye atlasın — sıfırıncı karede ekranda hiçbir şey yok.
      const isinmaAdimi = Math.round(warm / TICK);
      for (let i = 0; i < isinmaAdimi; i++) if (!adim()) break;

      if (until === 'boss') {
        // ⚠️ TAVAN ŞART: boss gelmezse sayfa sonsuza kadar dönerdi.
        let n = 0;
        while (n < 900000 && !g.enemies.some((e) => e.boss)) {
          if (!adim()) break;
          n += 1;
          if (n % 60000 === 0) setDurum('boss aranıyor… ' + Math.round(n * TICK) + 'sn');
        }

        /**
         * 🔴 BOSS'UN DOĞMASI, BOSS'UN GÖRÜNMESİ DEĞİLDİR — ÖLÇÜLDÜ.
         *
         * İlk boss çekiminde 150 karenin hiçbirinde boss YOKTU. Sebep
         * `spawnBoss`ta yazılı: boss, oyuncunun etrafındaki doğum
         * halkasında (`viewW/2 + ringMargin`) yani EKRANIN HEMEN DIŞINDA
         * beliriyor ve yürüyerek yaklaşıyor. Kare 60'ta ekranda yalnızca
         * onun darbe telgrafı (gri halka) görünüyordu — sahne "boss
         * dövüşü" değil "boş oda" olmuştu.
         *
         * Bu yüzden doğum değil, YAKINLIK bekleniyor: boss görüş alanının
         * içine girene kadar sürülüyor.
         */
        const yakinlik = Math.min(vw, vh) * 0.42;
        let m = 0;
        const yakinMi = () => g.enemies.some((e) =>
          e.boss && Math.hypot(e.x - g.px, e.y - g.py) < yakinlik);
        while (m < 6000 && !yakinMi()) { if (!adim()) break; m += 1; }
      }

      const adimSayisi = Math.max(1, Math.round((1 / fps) / TICK));
      for (let i = 0; i < frames; i++) {
        for (let k = 0; k < adimSayisi; k++) adim();
        render(ctx, g, vw, vh, scale, 1 / fps, null, []);
        await kareGonder(canvas, scene, i);
        if (i % 15 === 0) setDurum(scene + ' ' + i + '/' + frames);
      }
      await fetch(SINK + '/done?scene=' + scene);
      setDurum('bitti — ' + frames + ' kare');
      setBitti(true);
    })().catch((e) => setDurum('HATA: ' + String(e)));

    // ⚠️ Temizleyici YOK — yukarıdaki başlıkta yazan sebeple.
  }, []);

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div style={{
      minHeight: '100vh', background: C.void, color: C.bone,
      fontFamily: FONT.ui, padding: 12,
    }}>
      {/* ⚠️ `id` ile işaretli: yakalama betiği bitişi buradan anlıyor. */}
      <div id="capture-status" data-done={bitti ? '1' : '0'}
        style={{ marginBottom: 8, fontSize: 13 }}>{durum}</div>
      <canvas ref={canvasRef} style={{ width: 960, imageRendering: 'pixelated' }} />
    </div>
  );
}
