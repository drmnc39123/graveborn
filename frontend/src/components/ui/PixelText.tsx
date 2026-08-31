'use client';
// PİKSEL BAŞLIK — bitmap font sayfasından çizilen metin.
//
// 🔴 NİYE VAR: oyunun `GBTitle` ailesi `GBText` ile AYNI DOSYAYA işaret
// ediyordu, yani başlıkla gövde metni birebir aynı yüzdü — tipografik
// hiyerarşi yoktu. Paketin gerçek başlık fontu ise depoda hiç
// kullanılmadan duruyordu (bkz. `lib/pixelFont.ts`).
//
// ⚠️ NİYE CANVAS: bunlar TTF değil, bitmap sayfa. CSS bir PNG atlasından
// metin dizemez; her başlık kendi küçük tuvaline çiziliyor.
//
// ⚠️ ERİŞİLEBİLİRLİK ZORUNLU. Canvas'a çizilen metin ekran okuyucuya
// GÖRÜNMEZ. `role="img"` + `aria-label` ile metin geri veriliyor; bu
// olmadan özellik, arayüzü okuyamayan bir oyuncu için bir GERİLEME olurdu.
//
// ⚠️ HER DURUMDA BİR ŞEY ÇİZİLİR. Sayfa yüklenmediyse, kapsamıyorsa veya
// sunucuda render ediliyorsa TTF'e düşülüyor — başlık ASLA kaybolmaz.
// Bu depoda "eksik varlık sessizce boşluk bırakıyor" hatası defalarca
// çıktı; burada yedek en baştan var.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  pixelCiz, pixelFontHazir, pixelFontYukle, pixelKapsiyor, pixelOlc,
  type FontAilesi, type FontRengi,
} from '@/lib/pixelFont';
import { FONT } from '@/lib/theme';

export interface PixelTextProps {
  children: string;
  /** piksel ölçeği — TAM SAYI (kesirli ölçek piksel ızgarasını bozar) */
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
  const ref = useRef<HTMLCanvasElement | null>(null);
  // ⚠️ `hazirMi` state olarak TUTULUYOR: sayfa asenkron yükleniyor ve
  // yüklendiğinde bileşenin YENİDEN ÇİZİLMESİ gerekiyor. Yalnız ref
  // kullanılsaydı ilk render yedeğe düşer ve orada KALIRDI.
  const [tik, setTik] = useState(0);

  // ⚠️ Büyük harfe çevirme BAŞLIK ailesinde ZORUNLU: sayfada küçük harf
  // hiç yok. Çağıranın hatırlamasına bırakmak, bir gün küçük harfli bir
  // başlıkta metnin yarısının kaybolması demekti.
  const metin = family === 'title' ? children.toUpperCase() : children;
  const olcek = Math.max(1, Math.round(scale));

  useEffect(() => {
    const y = pixelFontHazir(family, color);
    if (y) { setTik((n) => n + 1); return; }
    let iptal = false;
    pixelFontYukle(family, color);
    // Yükleme sözü dışarı verilmiyor; küçük bir yoklama yeterli ve
    // bileşen sayısı az. Sonsuz yoklamayı `iptal` kesiyor.
    const t = window.setInterval(() => {
      if (iptal) return;
      if (pixelFontHazir(family, color)) { window.clearInterval(t); setTik((n) => n + 1); }
    }, 90);
    return () => { iptal = true; window.clearInterval(t); };
  }, [family, color]);

  const y = pixelFontHazir(family, color);
  const kapsiyor = !!y && pixelKapsiyor(y, metin);

  useEffect(() => {
    const c = ref.current;
    if (!c || !y || !kapsiyor) return;
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
  }, [y, kapsiyor, metin, olcek, tracking, tik]);

  if (!y || !kapsiyor) {
    // ── YEDEK: TTF ──
    return (
      <span title={title} style={{
        fontFamily: FONT.title, fontWeight: 700, letterSpacing: 1,
        ...fallbackStyle, ...style,
      }}>
        {metin}
      </span>
    );
  }

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={children}
      title={title}
      style={{ imageRendering: 'pixelated', display: 'block', ...style }}
    />
  );
}
