'use client';
// PİKSEL BAŞLIK — bitmap font sayfasından çizilen metin.
//
// 🔴 NİYE VAR: oyunun `GBTitle` ailesi `GBText` ile AYNI DOSYAYA işaret
// ediyordu, yani başlıkla gövde metni birebir aynı yüzdü — tipografik
// hiyerarşi yoktu. Paketin gerçek başlık yüzü ise depoda hiç
// kullanılmadan duruyordu (bkz. `lib/pixelFont.ts`).
//
// ⚠️ NİYE CANVAS: bunlar TTF değil, bitmap sayfa. CSS bir PNG atlasından
// metin dizemez; her başlık kendi küçük tuvaline çiziliyor.
//
// 🔴 ÖLÇEK KULLANILABİLİR ALANA GÖRE SEÇİLİR — ve bu, ilk sürümde
// OLMADIĞI için gerçek bir hataydı. Canvas metni SABİT piksel genişlikte;
// CSS metni gibi sarmıyor, küçülmüyor. Ölçüldü:
//     "THE VILLAGE SETTLES UP"  ölçek 2 → 380 px  (420 px'lik kartın
//                                        içerik alanı 372 px → TAŞIYOR)
//     "HOLLOW KING'S COURT"     ölçek 3 → 495 px  (mobil 360 px → TAŞIYOR)
//     "+1,234,567 GOLD"         ölçek 3 → 363 px  (mobil → TAŞIYOR)
// Bu deponun daha önce tam bu sınıftan yediği hata kayıtlı (`minmax` alt
// sınırı sert taban → paneller 153 px taşıyordu). Artık kapsayıcı
// ÖLÇÜLÜYOR ve sığan EN BÜYÜK TAM SAYI ölçek seçiliyor.
//
// ⚠️ ÖLÇEK TAM SAYI KALMAK ZORUNDA. Kesirli ölçek piksel ızgarasını bozar
// ve fontun bütün amacı kaybolur. Ölçek 1'de bile sığmıyorsa TTF'e
// düşülüyor — o metin sarabiliyor.
//
// ⚠️ ERİŞİLEBİLİRLİK ZORUNLU. Canvas'a çizilen metin ekran okuyucuya
// GÖRÜNMEZ. `role="img"` + `aria-label` ile metin geri veriliyor; bu
// olmadan özellik, arayüzü okuyamayan bir oyuncu için bir GERİLEME olurdu.
//
// ⚠️ HER DURUMDA BİR ŞEY ÇİZİLİR. Sayfa yüklenmediyse, kapsamıyorsa,
// sığmıyorsa veya sunucuda render ediliyorsa TTF'e düşülüyor — başlık
// ASLA kaybolmaz.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  pixelCiz, pixelFontHazir, pixelFontYukle, pixelKapsiyor, pixelOlc,
  type FontAilesi, type FontRengi,
} from '@/lib/pixelFont';
import { FONT } from '@/lib/theme';

export interface PixelTextProps {
  children: string;
  /** istenen EN BÜYÜK piksel ölçeği — sığmazsa kendiliğinden küçülür */
  scale?: number;
  color?: FontRengi;
  family?: FontAilesi;
  /** harfler arası boşluk (kaynak piksel) */
  tracking?: number;
  /** yedek (TTF) yolunda kullanılacak stil */
  fallbackStyle?: CSSProperties;
  style?: CSSProperties;
  title?: string;
}

export function PixelText({
  children, scale = 2, color = 'white', family = 'title',
  tracking = 1, fallbackStyle, style, title,
}: PixelTextProps) {
  const sarmalRef = useRef<HTMLSpanElement | null>(null);
  const ref = useRef<HTMLCanvasElement | null>(null);
  // ⚠️ Sayfa ASENKRON yükleniyor; yüklendiğinde bileşenin YENİDEN
  // ÇİZİLMESİ gerekiyor. Yalnız ref kullanılsaydı ilk render yedeğe
  // düşer ve orada KALIRDI.
  const [, setTik] = useState(0);
  /** kapsayıcının ölçülen genişliği — 0 = henüz ölçülmedi */
  const [alan, setAlan] = useState(0);

  // ⚠️ Büyük harfe çevirme BAŞLIK ailesinde ZORUNLU: sayfada küçük harf
  // hiç yok. Çağıranın hatırlamasına bırakmak, bir gün küçük harfli bir
  // başlıkta metnin yarısının kaybolması demekti.
  const metin = family === 'title' ? children.toUpperCase() : children;

  useEffect(() => {
    if (pixelFontHazir(family, color)) { setTik((n) => n + 1); return; }
    let iptal = false;
    pixelFontYukle(family, color);
    const t = window.setInterval(() => {
      if (iptal) return;
      if (pixelFontHazir(family, color)) { window.clearInterval(t); setTik((n) => n + 1); }
    }, 90);
    return () => { iptal = true; window.clearInterval(t); };
  }, [family, color]);

  // ── KAPSAYICIYI ÖLÇ — ÜÇ SİNYAL, HİÇBİRİNE TEK BAŞINA GÜVENİLMİYOR ──
  //
  // 🔴 `ResizeObserver` TEK SİNYAL OLARAK KULLANILAMAZ. Doğrulama sırasında
  // ölçüldü: bu projenin önizleme tarayıcısında RO **hiç tetiklenmiyor** —
  // elle kurulan bağımsız bir gözlemci bile, spec gereği `observe()` anında
  // gelmesi gereken ilk çağrıyı almadı. Gerçek tarayıcılarda RO çalışır ama
  // bir ölçüm aletinin sessizce ölmesi bu depoda defalarca yaşandı; tek
  // bacaklı bir ölçüm, sessizce yanlış ölçeğe kilitlenmek demekti.
  //
  // 1) HER RENDER'DA layout ölçümü — asıl bacak. Tek `getBoundingClientRect`
  //    çağrısı; değer değişmediğinde `setAlan` React tarafından yutuluyor,
  //    yani sonsuz döngü yok. Canvas'ın kendi boyu sarmalayıcıyı
  //    etkilemiyor (`width:100%`), o yüzden geri besleme de yok.
  // 2) Pencere yeniden boyutlanması — telefon döndürme, masaüstü sürükleme.
  // 3) `ResizeObserver` — yalnız KAPSAYICI değişiyorsa (panel açılış
  //    animasyonu); varsa ek fayda, yoksa 1 ve 2 işi görüyor.
  useLayoutEffect(() => {
    const el = sarmalRef.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    if (w > 0 && Math.abs(w - alan) > 0.5) setAlan(w);
  });

  useEffect(() => {
    const el = sarmalRef.current;
    if (!el) return;
    const olc = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setAlan((o) => (Math.abs(w - o) > 0.5 ? w : o));
    };
    window.addEventListener('resize', olc);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(olc);
      ro.observe(el);
    }
    return () => { window.removeEventListener('resize', olc); ro?.disconnect(); };
  }, []);

  const y = pixelFontHazir(family, color);
  const kapsiyor = !!y && pixelKapsiyor(y, metin);

  /**
   * Sığan en büyük TAM SAYI ölçek.
   * ⚠️ Alan henüz ölçülmediyse (0) istenen ölçek kullanılıyor — ilk kare
   * bir tık geniş olabilir ama layout ölçümü (yukarıdaki 1. bacak) daha
   * boyanmadan düzeltir. Alternatifi (ölçülene kadar hiç çizmemek) başlığı
   * bir an tamamen yok etmekti.
   */
  let olcek = Math.max(1, Math.round(scale));
  if (y && kapsiyor && alan > 0) {
    while (olcek > 1 && pixelOlc(y, metin, olcek, tracking).w > alan) olcek -= 1;
  }
  /** Ölçek 1'de bile sığmıyor → TTF (o sarabiliyor) */
  const sigiyor = !y || !kapsiyor || alan <= 0
    || pixelOlc(y, metin, olcek, tracking).w <= alan;

  useEffect(() => {
    const c = ref.current;
    if (!c || !y || !kapsiyor || !sigiyor) return;
    const o = pixelOlc(y, metin, olcek, tracking);
    // ⚠️ Aygıt piksel oranı YOK ve bu bilinçli: kaynak zaten piksel sanat,
    // tam sayı ölçekle basılıyor. DPR ile çarpmak kesirli ölçek üretir.
    c.width = Math.max(1, o.w);
    c.height = Math.max(1, o.h);
    const g = c.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    pixelCiz(g, y, metin, 0, 0, olcek, tracking);
  }, [y, kapsiyor, sigiyor, metin, olcek, tracking]);

  // ⚠️ SARMALAYICI HER İKİ YOLDA DA VAR ve genişliği doldurur — ölçüm
  // buradan geliyor. Yalnız canvas yolunda olsaydı, yedeğe düşen bir
  // başlık bir daha ASLA ölçülemez ve geri dönemezdi.
  return (
    <span ref={sarmalRef} style={{ display: 'block', width: '100%', minWidth: 0 }}>
      {(!y || !kapsiyor || !sigiyor) ? (
        <span title={title} style={{
          fontFamily: FONT.title, fontWeight: 700, letterSpacing: 1,
          display: 'inline-block', maxWidth: '100%',
          ...fallbackStyle, ...style,
        }}>
          {metin}
        </span>
      ) : (
        <canvas
          ref={ref}
          role="img"
          aria-label={children}
          title={title}
          style={{
            imageRendering: 'pixelated', display: 'block',
            margin: '0 auto', maxWidth: '100%',
            ...style,
          }}
        />
      )}
    </span>
  );
}
