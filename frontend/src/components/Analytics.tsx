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
//
// ⭐ ÇEREZ ONAYI (Consent Mode v2, kullanıcı kararı 2026-09-16) — kurallar
// `lib/analytics.ts` başlığında. Bant bu bileşende çünkü seçimin etiketi
// ANINDA güncellemesi gerekiyor.

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  GA_ID, ONAY_ANAHTARI, ONAY_SIFIRLA_OLAYI, bantGosterilmeli, olculmeli, onayKomutlari, secimOku,
  type OnaySecimi,
} from '@/lib/analytics';
import { C, FONT, thinGlass } from '@/lib/theme';

const seciliOku = (): OnaySecimi | null => {
  try { return secimOku(localStorage.getItem(ONAY_ANAHTARI)); } catch { return null; }
};

export function Analytics() {
  const yol = usePathname() ?? '/';
  /**
   * ⚠️ İLK KARAR MOUNT'TAN SONRA: `location` sunucuda yok. Sunucuda
   * çizilseydi etiket, alan adı kontrol edilmeden sayfaya girerdi.
   * `null` = henüz karar verilmedi.
   */
  const [yukle, setYukle] = useState<boolean | null>(null);
  /**
   * Etiket ilk yüklendiğindeki seçim — onay komutları betiğe O AN gömülüyor.
   * ⚠️ `undefined` = henüz okunmadı; betik okunmadan ÇİZİLMEZ (yoksa ilk
   * görüntü saklı seçimi bilmeden giderdi).
   */
  const [ilkSecim, setIlkSecim] = useState<OnaySecimi | null | undefined>(undefined);
  const [bant, setBant] = useState(false);

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
    const secim = seciliOku();
    setIlkSecim((onceki) => (onceki === undefined ? secim : onceki));
    setBant(bantGosterilmeli({ hostname: window.location.hostname, yol, secim }));
    setYukle((onceki) => onceki === true || karar);
  }, [yol]);

  // "Cookie settings" bağlantısı → seçimi sil, bandı yeniden aç
  useEffect(() => {
    const sifirla = () => {
      try { localStorage.removeItem(ONAY_ANAHTARI); } catch { /* yoksay */ }
      setBant(bantGosterilmeli({ hostname: window.location.hostname, yol: window.location.pathname, secim: null }));
    };
    window.addEventListener(ONAY_SIFIRLA_OLAYI, sifirla);
    return () => window.removeEventListener(ONAY_SIFIRLA_OLAYI, sifirla);
  }, []);

  const sec = (secim: OnaySecimi) => {
    try { localStorage.setItem(ONAY_ANAHTARI, secim); } catch { /* yoksay */ }
    // ⚠️ Etiket yüklüyse ANINDA güncelle — sayfa yenilenmeden çerez açılsın/kapansın
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    g?.('consent', 'update', { analytics_storage: secim });
    setBant(false);
  };

  return (
    <>
      {yukle && ilkSecim !== undefined && (
        <>
          {/* ⚠️ ONAY KOMUTLARI `config`TEN ÖNCE — ilk sayfa görüntüsü onaysız
              çerezle gitmesin. Mühür sırayı ölçüyor. */}
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
${onayKomutlari(ilkSecim)}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
        </>
      )}
      {bant && <CerezBandi onSec={sec} />}
    </>
  );
}

/**
 * ONAY BANDI — ekranın altında, seçim yapılana kadar.
 * ⚠️ İKİ DÜĞME EŞİT AĞIRLIKTA ve aynı boyda: "Decline"ı soluk bir bağlantıya
 * çevirmek (karanlık desen) AB'de geçerli onay sayılmıyor.
 */
function CerezBandi({ onSec }: { onSec: (s: OnaySecimi) => void }) {
  const dugme = (vurgu: boolean) => ({
    all: 'unset' as const, boxSizing: 'border-box' as const, cursor: 'pointer',
    padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 900, letterSpacing: 0.8,
    textAlign: 'center' as const, flex: '1 1 0', minWidth: 96,
    color: vurgu ? C.void : C.bone,
    background: vurgu ? C.candle : 'rgba(255,255,255,0.06)',
    border: `1px solid ${vurgu ? C.candle : C.border}`,
  });
  return (
    <div role="dialog" aria-label="Cookie consent" style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 60,
      margin: '0 auto', maxWidth: 520, boxSizing: 'border-box',
      // İnce cam: /play'de köy tuvalinin ÜSTÜNDE duruyor (fx.test [G] yüzey kuralı).
      // 0,88 alfa: açık taş yol üstünde okunaklı (EventBanner 0,80 ölçümü).
      ...thinGlass(12, 0.88), padding: '12px 14px', fontFamily: FONT.ui,
    }}>
      <div style={{ fontSize: 12, color: C.boneDim, lineHeight: 1.55, marginBottom: 10 }}>
        We use <b style={{ color: C.bone }}>Google Analytics cookies</b> to count visits and see how
        GRAVEBORN is played. No advertising cookies. You can change this later from{' '}
        <b style={{ color: C.bone }}>Cookie settings</b> on the home page.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onSec('denied')} style={dugme(false)}>DECLINE</button>
        <button onClick={() => onSec('granted')} style={dugme(true)}>ACCEPT</button>
      </div>
    </div>
  );
}
