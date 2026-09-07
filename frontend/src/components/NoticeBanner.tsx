'use client';
// SUNUCU DUYURUSU — bakım kapısı ve operatör mesajı.
//
// ⚠️ NİYE AYRI BİR ŞERİT: `EventBanner` hafta sonu etkinliğini anlatıyor,
// yani OYUNUN İÇİNDEN bir haber. Bu ise oyunun DIŞINDAN: "kapıyı kapattık",
// "şu saatte bakım var". İkisini tek bileşene sıkıştırmak, birini
// ayarlarken diğerini bozmak demekti — `glass`/`thinGlass` ayrımıyla aynı
// gerekçe.
//
// ══════════════════════════════════════════════════════════════════════
// ⚠️ İKİ KONUM, İKİ FARKLI İŞ — bilerek ayrıldı.
// ══════════════════════════════════════════════════════════════════════
//   `ustBant`  → YALNIZ BAKIM. Navbar'ın altında, geniş ve kaçırılamaz.
//                Bakım "oyun oynanabilir mi" sorusunu cevaplıyor; kenara
//                alınacak bir haber değil, bir KAPI durumu. Bu karar
//                dosyada zaten yazılıydı, taşıma sırasında korundu.
//   `sagKolon` → YALNIZ DUYURU. Minimap ve etkinlik kartının altında,
//                onlarla aynı genişlikte, açılır kapanır. Duyuru süreli bir
//                haber; üst bandı sürekli işgal etmesi için sebep yok.
//
// ⚠️ Bakım AÇIKKEN duyuru da üst bantta gösteriliyor: o an duyuru genelde
// bakımı AÇIKLIYOR (ne zaman biteceği gibi); ayrı bir köşede durması
// bilgiyi ikiye bölerdi.
//
// ⚠️ HATA SESSİZ. Uç düşerse şerit hiç çizilmiyor; köyün üstünde
// "duyuru alınamadı" kutusu hiçbir işe yaramayan bir endişe üretirdi
// (`EventBanner` emsali).
//
// ⚠️ YÜZEY: `thinGlass`, dokuz-dilim çerçeve DEĞİL. İkisi de köyün canlı
// görüntüsünün üstünde duruyor → yüzey dili Katman 1 (bkz. lib/theme.ts),
// kural `fx.test [G]` ile mühürlü. Piksel kimliği İÇERİKTEN geliyor
// (`Icon` + `FONT.title`); kardeş kartlar da tam olarak böyle yapıyor.

import { useEffect, useState } from 'react';
import { fetchFlags } from '@/lib/gameSession';
import { Icon } from '@/components/ui/kit';
import { C, FONT, thinGlass } from '@/lib/theme';

/** İki konumun ORTAK yüzeyi — tek yerde, ikisi ayrı ayarlanıp ayrışmasın */
function yuzey(ton: string, bakim: boolean) {
  return {
    /**
     * ⚠️ ALFA `EventBanner`DAN ALINDI (0,80) ve orada ÖLÇÜLEREK seçildi:
     * en kötü zemin açık taş yol, ikincil metnin kontrastı 0,80'de 5,04
     * (4,5 eşiğinin üstünde) ve arkadaki dünya hâlâ seçiliyor. Aynı sütunda
     * duran kartların farklı alfası kayıtlı bir tutarsızlıktı.
     */
    ...thinGlass(9, 0.80),
    // ⚠️ Ton, cam zeminin ÜSTÜNE ikinci katman olarak biniyor; zemini
    // onunla değiştirmek okunaklılığı geri götürürdü (EventBanner emsali).
    background: `linear-gradient(90deg, ${ton}2e, rgba(0,0,0,0) 70%),`
      + ' linear-gradient(180deg, rgba(43,31,22,0.80), rgba(10,8,6,0.88))',
    border: `1px solid ${bakim ? 'rgba(160,18,38,0.55)' : `${ton}66`}`,
    boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
    fontFamily: FONT.ui,
    boxSizing: 'border-box' as const,
    width: '100%',
  };
}

export function NoticeBanner({ konum = 'ustBant' }: { konum?: 'ustBant' | 'sagKolon' }) {
  const [f, setF] = useState<{ maintenance: boolean; notice: string | null } | null>(null);
  /**
   * ⚠️ AÇIK BAŞLIYOR: duyurunun işi OKUNMAK. Kapalı başlasaydı oyuncuların
   * çoğu tek satırlık başlığı görüp geçerdi ve duyuru yazılmamış sayılırdı.
   * Kapatan kapalı kalır — 60 saniyelik tazeleme bu durumu sıfırlamıyor.
   */
  const [acik, setAcik] = useState(true);

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

  if (!f) return null;
  const bakim = f.maintenance;

  // ── ÜST BANT: yalnız bakım ──
  if (konum === 'ustBant') {
    if (!bakim) return null;
    return (
      <div style={{ ...yuzey(C.badText, true), padding: '7px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Icon name="alert" scale={1} />
          <span style={{
            // ⚠️ Başlık piksel başlık fontuyla; gövde `FONT.ui` kalıyor.
            fontFamily: FONT.title, fontWeight: 900, fontSize: 10.5, letterSpacing: 1.8,
            color: C.badText, textShadow: `0 1px 0 ${C.void}`,
          }}>
            MAINTENANCE — NO NEW RUNS
          </span>
          <Icon name="alert" scale={1} />
        </div>
        {f.notice && (
          <div style={{
            marginTop: 5, fontSize: 11.5, color: C.boneDim, textAlign: 'center',
            lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {f.notice}
          </div>
        )}
        {/* ⚠️ SÜREN KOŞUNUN ÖDENECEĞİ AÇIKÇA YAZILI: oyuncu bakım yazısını
            görünce oynadığı koşunun çöpe gideceğini sanıp bırakabilir. */}
        <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 4, textAlign: 'center' }}>
          A run already in progress still finishes and still pays.
        </div>
      </div>
    );
  }

  // ── SAĞ KOLON: yalnız duyuru, açılır kapanır ──
  // Bakım varken burada çizilmiyor — duyuru o an üst bantta, bakımın yanında.
  if (bakim || !f.notice) return null;

  return (
    <button
      onClick={() => setAcik((v) => !v)}
      aria-expanded={acik}
      style={{
        all: 'unset', cursor: 'pointer', display: 'block',
        ...yuzey(C.candle, false),
        padding: '6px 8px',
      }}
    >
      {/* ── ÜST SATIR: piksel ikon · başlık · açılış oku ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon name="star" scale={1} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: FONT.title, fontWeight: 900, fontSize: 9.5, letterSpacing: 1.4,
          color: C.candle, textShadow: `0 1px 0 ${C.void}`,
        }}>
          NOTICE
        </span>
        {/* ⚠️ OK, "burada okunacak bir şey daha var" demenin en ucuz yolu —
            `EventBanner` emsali. Olmasaydı kart tıklanabilir görünmezdi. */}
        <span style={{
          marginLeft: 'auto', flexShrink: 0, fontSize: 9, color: C.boneFaint, lineHeight: 1,
          transform: acik ? 'rotate(180deg)' : 'none',
        }}>▾</span>
      </div>

      <div style={{
        marginTop: 4, fontSize: 10.5, color: C.boneDim, lineHeight: 1.45,
        /**
         * ⚠️ KAPALIYKEN TEK SATIR, açıkken tam metin — `EventBanner` ile aynı
         * kural. Dar sütunda 300 karakterlik bir duyuru, kartı köyün yarısı
         * kadar uzatırdı; kalıcı olarak kısaltılmış hâli ise bilgi değil
         * gürültü olurdu. İkisinin ortası: bir satır göster, isteyen açsın.
         */
        ...(acik
          ? { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }
          : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }),
      }}>
        {f.notice}
      </div>
    </button>
  );
}
