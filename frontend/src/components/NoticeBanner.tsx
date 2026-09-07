'use client';
// SUNUCU DUYURUSU — bakım kapısı ve operatör mesajı.
//
// ⚠️ NİYE AYRI BİR ŞERİT: `EventBanner` hafta sonu etkinliğini anlatıyor,
// yani OYUNUN İÇİNDEN bir haber. Bu ise oyunun DIŞINDAN: "kapıyı kapattık",
// "şu saatte bakım var". İkisini tek bileşene sıkıştırmak, birini
// ayarlarken diğerini bozmak demekti — `glass`/`thinGlass` ayrımıyla aynı
// gerekçe.
//
// ⚠️ HATA SESSİZ. Uç düşerse şerit hiç çizilmiyor; köyün üstünde
// "duyuru alınamadı" kutusu hiçbir işe yaramayan bir endişe üretirdi
// (`EventBanner` emsali).
//
// ⚠️ BAKIM AÇIKKEN OYUNCU SEBEBİNİ GÖRMELİ. Yeni koşu 503 dönüyor; sebebi
// yazmayan bir hata mesajı oyuncuya "oyun bozuldu" dedirtir.
//
// ══════════════════════════════════════════════════════════════════════
// ⚠️ YÜZEY: `thinGlass` KALIYOR, dokuz-dilim çerçeveye ÇEVRİLMEDİ.
// ══════════════════════════════════════════════════════════════════════
// Şerit köyün canlı görüntüsünün ÜSTÜNDE duruyor → yüzey dili Katman 1
// (bkz. lib/theme.ts) ve kural `fx.test [G]` ile mühürlü. Dokuz-dilim bir
// çerçeve buraya opak bir kutu koyar, arkadaki dünyayı kapatırdı.
//
// Piksel kimliği İÇERİKTEN geliyor — köyün üstündeki kardeşleri de tam
// olarak böyle yapıyor: `ProfileCard` (Bar·Icon·Slot), `BuildingDock`
// (Icon·PixelButton), `EventBanner` (Icon) hepsi cam zemin + piksel öğe.
// Bu dosyada hiç piksel öğe YOKTU; sönük durmasının sebebi buydu.

import { useEffect, useState } from 'react';
import { fetchFlags } from '@/lib/gameSession';
import { Icon } from '@/components/ui/kit';
import { C, FONT, thinGlass } from '@/lib/theme';

export function NoticeBanner() {
  const [f, setF] = useState<{ maintenance: boolean; notice: string | null } | null>(null);

  useEffect(() => {
    let atildi = false;
    const oku = () => {
      fetchFlags()
        .then((v) => { if (!atildi) setF(v); })
        .catch(() => { /* sessiz — bkz. başlık */ });
    };
    oku();
    /**
     * ⚠️ 60 SANİYEDE BİR TEKRAR OKUNUYOR. Bakım oyuncu sayfadayken
     * AÇILABİLİR; tek sefer okusaydık o oyuncu kapının kapandığını hiç
     * görmez, yalnız koşu başlatmaya çalışınca çıplak bir hata alırdı.
     * ⚠️ `setInterval` bilerek: gizli sekmede `rAF` durur ama `setInterval`
     * çalışır (bu depoda ölçülmüş bir tuzak) — sekmeye dönen oyuncu güncel
     * durumu görsün.
     */
    const id = setInterval(oku, 60_000);
    return () => { atildi = true; clearInterval(id); };
  }, []);

  if (!f || (!f.maintenance && !f.notice)) return null;

  const bakim = f.maintenance;
  /** bakım = kan kırmızısı, duyuru = mum altını */
  const ton = bakim ? C.badText : C.candle;

  return (
    <div style={{
      /**
       * ⚠️ ALFA `EventBanner`DAN ALINDI (0,80) ve orada ÖLÇÜLEREK seçildi:
       * en kötü zemin açık taş yol, ikincil metnin kontrastı 0,80'de 5,04
       * (4,5 eşiğinin üstünde) ve arkadaki dünya hâlâ seçiliyor. Aynı
       * sütunda duran iki kartın farklı alfası, aynı ekranda iki ayrı oyun
       * demekti — kayıtlı bir tutarsızlık.
       */
      ...thinGlass(9, 0.80),
      // ⚠️ Ton, cam zeminin ÜSTÜNE ikinci katman olarak biniyor; zemini
      // onunla değiştirmek okunaklılığı geri götürürdü (EventBanner emsali).
      background: `linear-gradient(90deg, ${ton}2e, rgba(0,0,0,0) 70%),`
        + ' linear-gradient(180deg, rgba(43,31,22,0.80), rgba(10,8,6,0.88))',
      border: `1px solid ${bakim ? 'rgba(160,18,38,0.55)' : `${C.candle}66`}`,
      boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
      padding: '7px 10px',
      fontFamily: FONT.ui,
      boxSizing: 'border-box',
      width: '100%',
    }}>
      {/* ── ÜST SATIR: piksel ikon + başlık ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        {/* ⚠️ Piksel ikon: kimliği taşıyan öğe bu. `alert` bakımın kapalı
            kapısını, `star` operatör duyurusunu anlatıyor. */}
        <Icon name={bakim ? 'alert' : 'star'} scale={1} />
        <span style={{
          // ⚠️ BAŞLIK PİKSEL BAŞLIK FONTUYLA — arayüzün her yerindeki başlık
          // dili bu (`FONT.title`); gövde metni `FONT.ui` kalıyor.
          fontFamily: FONT.title, fontWeight: 900, fontSize: 10.5, letterSpacing: 1.8,
          color: ton, textShadow: `0 1px 0 ${C.void}`,
        }}>
          {bakim ? 'MAINTENANCE — NO NEW RUNS' : 'NOTICE'}
        </span>
        <Icon name={bakim ? 'alert' : 'star'} scale={1} />
      </div>

      {f.notice && (
        <>
          {/* İnce piksel ayraç — başlığı gövdeden ayırır.
              ⚠️ `<Divider>` KULLANILMADI: en küçük hâli bile 16 px yüksek ve
              bu şeridi iki katına çıkarıyordu. Köyün üstünde yer kazanmak,
              dünyayı kapatmamak demek. */}
          <div style={{
            height: 1, margin: '6px 0 5px',
            background: `linear-gradient(90deg, rgba(0,0,0,0), ${ton}55, rgba(0,0,0,0))`,
          }} />
          <div style={{
            fontSize: 11.5, color: C.boneDim, textAlign: 'center', lineHeight: 1.6,
            // ⚠️ Uzun duyuru SARMALI: tek satıra zorlansaydı operatörün
            // yazdığı her uzun cümle şeridin dışına taşardı.
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {f.notice}
          </div>
        </>
      )}

      {/* ⚠️ SÜREN KOŞUNUN ÖDENECEĞİ AÇIKÇA YAZILI: oyuncu bakım yazısını
          görünce oynadığı koşunun çöpe gideceğini sanıp bırakabilir. */}
      {bakim && (
        <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 4, textAlign: 'center' }}>
          A run already in progress still finishes and still pays.
        </div>
      )}
    </div>
  );
}
