'use client';
// KAHRAMAN PORTRESİ — küçük bir tuvalde, GERÇEKTEN yürüyen karakter.
//
// 🔴 KULLANICI DÜZELTMESİ: *"Metal Bladekeeper'ın kutusunda K harfi değil
// kendisi olmalı, canlı olarak hareketli bir biçimde."*
//
// İlk sürüm bir HARF gösteriyordu ve gerekçem şuydu: kahraman şeritlerini
// `<img>` ile 46 px'lik bir kutuda doğru kırpamıyordum — çerçeve boyu ve
// içerik oranı karaktere göre değişiyor (`heroes.ts` `crop`/`contentRatio`)
// ve yanlış kırpılmış bir sprite, hiç sprite olmamasından kötü görünüyor.
//
// ⚠️ ÇÖZÜM `<img>` DEĞİL, OYUNUN KENDİ ÇİZİCİSİ. `drawActor` bu işi zaten
// biliyor: kare seçimi, `contentRatio` ölçeklemesi, `anchorY` ayak hizası,
// `crop` penceresi — hepsi orada ve ÖLÇÜLEREK bulunmuş değerler. İkinci bir
// kırpma matematiği yazmak, bu depoda tekrar eden en pahalı hatayı (aynı
// kuralı iki yere yazmak) davet etmek olurdu.
//
// ⚠️ `motionOff` DİNLENİYOR: hareket kapalıysa tek kare çizilip döngü hiç
// kurulmuyor — sürekli dönen bir `rAF`, kapalı animasyon ayarına rağmen
// pil yakardı.
//
// ⚠️ `rAF` GİZLİ SEKMEDE DURUR (bu depoda ölçülmüş tuzak) ve burada SORUN
// DEĞİL: sekme gizliyken gösterilecek bir şey de yok, dönünce kaldığı
// yerden devam ediyor — zaman `performance.now()`tan türüyor, kare
// sayacından değil.

import { useEffect, useRef } from 'react';
import { drawActor, playerArt, preloadAll } from '@/game/sprites';
import { motionOff } from '@/components/ui/motion';

export function HeroPortrait({ hero, size = 56, anim = 'run' }: {
  hero: string;
  size?: number;
  /** hangi animasyon — 'run' canlı durur, 'idle' sakin */
  anim?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    // ⚠️ Görseller asenkron yükleniyor; istenmezse ilk kareler boş kalır
    // ve portre "bozuk" görünür.
    preloadAll(hero);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const art = playerArt(hero);
    /**
     * ⚠️ ÖLÇEK `drawHeight`TEN TÜRÜYOR. `drawActor` karakteri kendi
     * `drawHeight`i kadar çiziyor (koşuda ~44 px); kutuya sığdırmak için
     * tuvali ölçekliyoruz, kırpma matematiğine dokunmuyoruz.
     */
    const k = (size * 0.86) / art.drawHeight;

    const durgun = motionOff();
    let raf = 0;
    const t0 = performance.now();

    const kare = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size * 0.94);   // ayak hizası kutunun dibine yakın
      ctx.scale(k, k);
      // ⚠️ Sağa bakıyor: kart soldan sağa okunuyor, karaktere sırtını
      // dönmüş gibi durmamalı.
      // ⚠️ Durgun modda ZAMAN SABİT: kare ilerlemesin ama çizim denensin.
      const cizdi = drawActor(ctx, art, anim,
        durgun ? 0 : (performance.now() - t0) / 1000, 0, 0, true);
      ctx.restore();
      /**
       * 🔴 DURGUN MODDA DA DÖNGÜ KURULUYOR — BİR KEZ ÇİZENE KADAR.
       *
       * İlk sürüm `motionOff()` ise TEK KARE çizip duruyordu ve o kare
       * görseller daha yüklenmeden geliyordu: `drawActor` `false` dönüyor,
       * tuval boş kalıyor ve BİR DAHA DENENMİYORDU. Portre kalıcı olarak
       * boştu.
       *
       * Tarayıcıda ölçüldü: `prefers-reduced-motion: reduce` açık bir
       * ortamda tuvalde 0 opak piksel; test karesi 120 ms sonra hâlâ
       * duruyordu — yani `clearRect` hiç çağrılmamıştı. Hareketi kısıtlı
       * HER oyuncuda olurdu.
       *
       * ⚠️ Çizim başarılı olunca durgun modda döngü BİTİYOR: sürekli dönen
       * bir `rAF`, kapalı animasyon ayarına rağmen pil yakardı.
       */
      if (durgun && cizdi) return;
      raf = requestAnimationFrame(kare);
    };

    raf = requestAnimationFrame(kare);
    return () => cancelAnimationFrame(raf);
  }, [hero, size, anim]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ display: 'block', width: size, height: size }}
    />
  );
}
