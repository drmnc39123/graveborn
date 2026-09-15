'use client';
// GOOGLE ANALYTICS ETİKETİ — kullanıcının verdiği gtag.js kodunun Next.js hâli.
//
// 🔴 NİYE HAM <script> DEĞİL: App Router'da `layout.tsx` bir SUNUCU bileşeni.
// Satır içi <script> etiketini oraya yapıştırmak hidrasyonda ikinci kez
// çalışma ya da hiç çalışmama riskini taşıyor; `next/script` bunun için var.
//
// 🔴 NİYE İSTEMCİ BİLEŞENİ: hangi sayfanın ölçüleceği ancak tarayıcıda
// bilinebiliyor (`usePathname`, `location.hostname`). Kural `lib/analytics.ts`te.
//
// ⚠️ `afterInteractive`: oyunun ilk karesiyle yarışmasın. Köy ve koşu
// kanvası ağır; etiket sayfa etkileşime hazır olduktan SONRA yükleniyor.
//
// ⚠️ SAYFA DEĞİŞİMİ AYRICA GÖNDERİLMİYOR: GA4'ün "enhanced measurement"
// özelliği tarayıcı geçmişi değişimlerini (istemci tarafı gezinme) kendisi
// sayıyor. Elle `page_view` göndermek her geçişi İKİ KEZ sayardı.

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GA_ID, olculmeli } from '@/lib/analytics';

export function Analytics() {
  const yol = usePathname() ?? '/';
  /**
   * ⚠️ İLK KARAR MOUNT'TAN SONRA: `location` sunucuda yok. Sunucuda
   * çizilseydi etiket, alan adı kontrol edilmeden sayfaya girerdi.
   * `null` = henüz karar verilmedi.
   */
  const [yukle, setYukle] = useState<boolean | null>(null);

  useEffect(() => {
    const karar = olculmeli({
      hostname: window.location.hostname,
      webdriver: navigator.webdriver === true,
      yol,
    });
    // ⚠️ YÜKLENDİKTEN SONRA SÖKÜLMEZ: etiket bir kez girdiyse kalır. İzin
    // listesi dışına çıkılırsa GA'nın RESMİ kapatma bayrağıyla susturuluyor
    // (`ga-disable-<kimlik>`); geri dönülünce yeniden açılıyor.
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !karar;
    setYukle((onceki) => onceki === true || karar);
  }, [yol]);

  if (!yukle) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
