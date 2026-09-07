'use client';
// SİLAH ÖNİZLEMESİ — kartın içinde, silahın NASIL çalıştığını gösteren
// küçük canlı şema.
//
// 🔴 NİYE VAR: level-up kartı oyunun en önemli kararı ama oyuncu onu YALNIZ
// METİN OKUYARAK veriyordu. "Cuts an arc in the direction you face" cümlesi
// doğru ama bir yay ile bir yörüngenin ne kadar farklı oynandığını
// anlatmıyor. Karar 5 saniyede veriliyor; okumaya değil BAKMAYA uygun
// olmalı.
//
// ⭐ ŞEMA GERÇEK SAYILARDAN ÇİZİLİYOR, elle çizilmiş bir gif değil:
// `orbitRadius`, `auraRadius`, `novaCount`, `chainJumps`, `sweepW/H`,
// `groundRadius`, `returnAt`, `mineTriggerR/BlastR` doğrudan `WeaponDef`ten
// geliyor. Yani silah dengelenirken şema da kendiliğinden güncelleniyor —
// yanlış bir şey gösterme ihtimali yok. Bu, oyuncuya yalan söylemeyen tek
// önizleme biçimi.
//
// ⚠️ SİMÜLASYON DEĞİL. Motoru çalıştırmıyor: kart ekranında üç önizleme
// birden duruyor ve motor 500 düşmanla tasarlanmış bir döngü. Burada
// yalnızca zamanın fonksiyonu olan bir çizim var — tahsis yok, çarpışma yok.
//
// ⚠️ `ctx.filter` YOK (perf kuralı) · MOR YOK · tüm stiller inline.

import { useEffect, useRef } from 'react';
import type { WeaponDef } from '@/game/config';
import { C } from '@/lib/theme';

/** Döngü süresi — bir tam gösterim. Kısa olursa okunmuyor, uzun olursa kaçırılıyor. */
const DONGU = 2.2;

/**
 * Dünya birimini küçük tuvale indiren ölçek.
 *
 * ⚠️ TEK ÖLÇEK, desen başına ayrı değil: yörünge yarıçapı ile aura yarıçapı
 * AYNI ölçekle çizilmezse oyuncu ikisini karşılaştıramaz ve şema yalan
 * söyler. Sayı, en büyük yarıçapın kutuya sığmasına göre seçiliyor.
 */
function olcekBul(def: WeaponDef, yariKisa: number): number {
  const enBuyuk = Math.max(
    def.orbitRadius ?? 0, def.auraRadius ?? 0, def.groundRadius ?? 0,
    def.mineBlastR ?? 0, (def.sweepH ?? 0) / 2, 60,
  );
  return (yariKisa * 0.82) / enBuyuk;
}

/**
 * Şemayı çiz. ⚠️ MÜHÜR İÇİN DIŞA AÇIK: her desenin gerçekten bir şey çizdiği
 * ve hiçbirinin boş kutuya düşmediği Node'da ölçülüyor — oynayarak on
 * deseni de görmek pratikte imkânsız.
 */
export function cizSema(ctx: CanvasRenderingContext2D, w: number, h: number, def: WeaponDef, t: number) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.36, cy = h / 2;              // oyuncu solda: hareket sağa doğru okunur
  const k = olcekBul(def, Math.min(w, h) / 2);
  const p = (t % DONGU) / DONGU;                // 0..1 döngü konumu

  // ── OYUNCU ──
  ctx.fillStyle = C.bone;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  // ── HEDEF (deseni anlamlı kılan sabit düşman) ──
  const hx = w * 0.82, hy = cy;
  const hedefCiz = (x: number, y: number, vurdu: boolean) => {
    ctx.fillStyle = vurdu ? C.badText : 'rgba(227,216,192,0.34)';
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  };

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.candle;
  ctx.fillStyle = C.candle;

  switch (def.pattern) {
    case 'aimed':
    case 'homing': {
      // Mermi oyuncudan hedefe gider. `homing` düz gitmez, yayla döner —
      // `seekRate`in oyuncuya anlattığı tek şey bu.
      const x = cx + (hx - cx) * p;
      const y = def.pattern === 'homing'
        ? cy - Math.sin(p * Math.PI) * h * 0.26
        : cy;
      hedefCiz(hx, hy, p > 0.92);
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'boomerang': {
      // ⚠️ `returnAt` gerçek değerden: dönüşün NE ZAMAN başladığı silahın
      // kimliği. Yarıda dönen bir bumerang ile sonda dönen bambaşka oynanır.
      const donus = def.returnAt ?? 0.5;
      const ileri = p < donus ? p / donus : 1 - (p - donus) / (1 - donus);
      hedefCiz(hx, hy, ileri > 0.9);
      ctx.beginPath();
      ctx.arc(cx + (hx - cx) * ileri, cy, 2.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'orbit': {
      const r = (def.orbitRadius ?? 40) * k;
      const adet = Math.max(1, (def.countLevels?.length ?? 0) > 0 ? 2 : 1);
      ctx.strokeStyle = 'rgba(239,167,46,0.30)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.candle;
      for (let i = 0; i < adet; i++) {
        const a = p * Math.PI * 2 + (i / adet) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'aura': {
      // Nefes alan halka: sürekli hasarın "hep açık" hissi
      const r = (def.auraRadius ?? 50) * k * (0.9 + Math.sin(p * Math.PI * 2) * 0.1);
      ctx.strokeStyle = 'rgba(239,167,46,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(239,167,46,0.10)';
      ctx.fill();
      /**
       * ⚠️ İKİ DÜŞMAN — biri halkanın İÇİNDE, biri DIŞINDA. Aura'nın tek
       * kuralı bu: "yeterince yakın olan her şey". Düşmansız bir halka
       * yalnız bir daire; menzilin ne demek olduğunu göstermiyordu.
       * (Mühür bu eksiği yakaladı: kutu iki çizimle seyrek kalıyordu.)
       */
      hedefCiz(cx + r * 0.55, cy - h * 0.16, true);
      hedefCiz(cx + r + w * 0.14, cy + h * 0.18, false);
      break;
    }
    case 'nova': {
      const adet = def.novaCount ?? 8;   // gerçek mermi sayısı
      const mesafe = Math.min(w, h) * 0.42 * p;
      for (let i = 0; i < adet; i++) {
        const a = (i / adet) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * mesafe, cy + Math.sin(a) * mesafe, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'sweep': {
      // Önde beliren yay — oyuncunun BAKTIĞI yön, ayakla nişan alma hissi
      const gorunur = p < 0.45;
      if (gorunur) {
        const a = p / 0.45;
        /**
         * ⚠️ YAY GERÇEKTEN SAVRULUYOR. İlk hâlde yalnız saydamlık değişiyordu
         * ve mühür bunu yakaladı: altı zaman örneğinden yalnız İKİ farklı kare
         * çıkıyordu. Sabit duran bir yay "savurma"yı anlatmaz — hareketin
         * kendisi bu silahın tek kimliği.
         */
        const merkez = -0.55 + a * 1.1;          // yukarıdan aşağı savur
        const yari = (def.sweepW ?? 46) * k * 0.9;
        ctx.strokeStyle = `rgba(239,167,46,${0.9 - a * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, yari, merkez - 0.45, merkez + 0.45);
        ctx.stroke();
        ctx.lineWidth = 1.5;
      }
      hedefCiz(hx, hy, gorunur && p > 0.1);
      break;
    }
    case 'ground': {
      // ⚠️ Yere DÜŞER ve oyuncuyla HAREKET ETMEZ — kartın metni de bunu
      // söylüyor, şema onu gözle doğruluyor.
      const dusuyor = p < 0.25;
      const gx = cx + (hx - cx) * Math.min(1, p / 0.25);
      const r = (def.groundRadius ?? 40) * k;
      if (!dusuyor) {
        const nabiz = 0.85 + Math.sin(p * Math.PI * 6) * 0.15;
        ctx.fillStyle = 'rgba(239,167,46,0.16)';
        ctx.beginPath();
        ctx.arc(hx, cy, r * nabiz, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239,167,46,0.5)';
        ctx.stroke();
        /**
         * ⚠️ ALANIN İÇİNDE DURAN DÜŞMAN, `groundTickSec` ritminde yanıp
         * sönüyor: "kalıcı alan tekrar tekrar vurur" cümlesinin gözle
         * görülür hâli. Oyuncunun ALTINDA değil, düştüğü yerde duruyor —
         * metnin "seni takip etmez" iddiasını da doğruluyor.
         */
        const tik = def.groundTickSec ?? 0.5;
        hedefCiz(hx, cy, Math.sin((p * DONGU / tik) * Math.PI) > 0);
      } else {
        ctx.fillStyle = C.candle;
        ctx.beginPath();
        ctx.arc(gx, cy - Math.sin((p / 0.25) * Math.PI) * h * 0.3, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'mine': {
      // Kurulma → bekleme → patlama. Üç evre de gerçek alanlardan.
      const kuruldu = p > 0.25;
      const patlama = p > 0.72;
      const tetik = (def.mineTriggerR ?? 28) * k;
      const blast = (def.mineBlastR ?? 55) * k;
      ctx.strokeStyle = kuruldu ? 'rgba(239,167,46,0.45)' : 'rgba(227,216,192,0.22)';
      ctx.beginPath();
      ctx.arc(hx, cy, tetik, 0, Math.PI * 2);
      ctx.stroke();
      if (patlama) {
        const a = (p - 0.72) / 0.28;
        ctx.strokeStyle = `rgba(228,101,122,${1 - a})`;
        ctx.beginPath();
        ctx.arc(hx, cy, blast * a, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = kuruldu && Math.sin(p * Math.PI * 14) > 0 ? C.badText : C.candle;
      ctx.beginPath();
      ctx.arc(hx, cy, 2.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'chain': {
      // ⚠️ `chainJumps` gerçek değerden: kaç düşmana sıçradığı bu silahın
      // TEK ayırt edici sayısı.
      const siciri = Math.max(1, def.chainJumps ?? 2);
      const noktalar = [{ x: cx, y: cy }];
      for (let i = 0; i <= siciri; i++) {
        noktalar.push({
          x: cx + (w * 0.5) * ((i + 1) / (siciri + 1)) + w * 0.08,
          y: cy + (i % 2 === 0 ? -1 : 1) * h * 0.24,
        });
      }
      /**
       * ⚠️ YILDIRIM SEGMENT SEGMENT AKIYOR, kademeli atlamıyor. İlk hâlde
       * yalnız "yandı/yanmadı" iki hâli vardı ve mühür bunu yakaladı
       * (6 örnekte 2 kare). Sıçramanın SIRAYLA olduğu, bu silahın metninde
       * yazan tek kural — gözle de öyle görünmeli.
       */
      const ilerleme = p * siciri;
      for (let i = 0; i < noktalar.length - 1; i++) {
        const yerel = ilerleme - i;            // 0..1 bu segmentte nerede
        if (yerel <= 0) { hedefCiz(noktalar[i + 1].x, noktalar[i + 1].y, false); continue; }
        const oran = Math.min(1, yerel);
        const ux = noktalar[i].x + (noktalar[i + 1].x - noktalar[i].x) * oran;
        const uy = noktalar[i].y + (noktalar[i + 1].y - noktalar[i].y) * oran;
        hedefCiz(noktalar[i + 1].x, noktalar[i + 1].y, oran >= 1);
        ctx.strokeStyle = `rgba(239,167,46,${Math.max(0.25, 1 - yerel * 0.45)})`;
        ctx.beginPath();
        ctx.moveTo(noktalar[i].x, noktalar[i].y);
        ctx.lineTo(ux, uy);
        ctx.stroke();
        if (oran < 1) {                        // ucundaki kıvılcım
          ctx.fillStyle = C.candle;
          ctx.beginPath();
          ctx.arc(ux, uy, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    default:
      break;
  }
}

export function WeaponPreview({ def, height = 52 }: { def: WeaponDef; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    /**
     * ⚠️ devicePixelRatio ÖLÇEKLEMESİ ŞART: piksel sanatı bir oyunda bulanık
     * bir şema, elle çizilmiş her şeyin yanında ucuz durur.
     */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 140;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const t0 = performance.now();
    const kare = () => {
      cizSema(ctx, w, height, def, (performance.now() - t0) / 1000);
      raf = requestAnimationFrame(kare);
    };
    /**
     * ⚠️ `rAF` GİZLİ SEKMEDE DURUR — bu depoda ölçülmüş bir tuzak. Burada
     * SORUN DEĞİL: sekme gizliyken gösterilecek bir şey de yok, dönünce
     * kaldığı yerden devam ediyor (zaman `performance.now()`tan türüyor,
     * kare sayacından değil).
     */
    raf = requestAnimationFrame(kare);
    return () => cancelAnimationFrame(raf);
  }, [def, height]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        display: 'block', width: '100%', height,
        borderRadius: 5,
        background: 'rgba(0,0,0,0.30)',
        border: `1px solid ${C.border}`,
      }}
    />
  );
}
