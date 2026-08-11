'use client';
// OYUNCU KİMLİK KARTI — köyün sol üstünde, oyunun "sen kimsin" cümlesi.
//
// ⚠️ NİYE VAR: ana ekran bir navbardan ibaretti. Oyuncu köye giriyor ve
// karşısında kendisine dair TEK bir şey görmüyordu — ne adı, ne rütbesi, ne
// Reliquary'de kazandığı unvan. `Identity.tsx`in kendi kuralı bunu zaten
// söylüyor: *"prestij GÖRÜLDÜĞÜ yerde değer kazanır"*.
//
// ── ÜÇÜNCÜ SÜRÜM: küçük + açılır kapanır ──
// 1) İlk hâli tek bir ince cam dikdörtgendi → "çok basit".
// 2) İkinci hâli tam `Panel` çerçevesiydi → 364×310 piksel, ekranın %43'ü,
//    rıhtımın üstüne biniyordu ve 07A çerçevesi ekranda PEMBE patlıyordu.
//    (Kod tabanı bunu zaten yazmış: *"07A koyu şarap kırmızısı diye
//    seçilmişti ama ekranda düpedüz PEMBE duruyor"*.) Bir HUD çipi için
//    tam panel çerçevesi fazla yüksek sesli — o çerçeve, oyuncunun ÜSTÜNE
//    gittiği paneller için.
// 3) Şimdi: kapalıyken tek satırlık bir şerit, tıklayınca aşağı açılıyor.
//    Doku oyunun dilinden geliyor (yuva çerçeveli portre, altın çubuk,
//    istatistik kutuları) ama çerçeve sahneyi delmiyor.
//
// ⚠️ HİÇBİR YENİ SİSTEM YAZILMADI. Rütbe `ossuary.ts`te ZATEN vardı
// (`ossuaryTier` + `ossuaryTierProgress`), portre `HeroPicker`da, kimlik
// satırı `Identity.tsx`te, yuva/çubuk `kit.tsx`te.
//
// ⚠️ İKİ AYRI EKSEN, BİLEREK:
//   RÜTBE   → Ossuary kademesi. Gold'la alınır, TAVANI YOK, güç vermez.
//             Bu bir PRESTİJ ekseni.
//   DERİNLİK → sunucunun doğruladığı en derin iniş. Bu bir BAŞARI ekseni.
// İkisini tek sayıya indirmek, parayla alınanla oynayarak kazanılanı aynı
// kefeye koymak olurdu.

import { useEffect, useMemo, useState } from 'react';
import { STAGES } from '@/game/config';
import { heroById } from '@/game/heroes';
import { OSSUARY, ossuaryTier, ossuaryTierProgress } from '@/game/ossuary';
import { paidDepth, type Progress } from '@/game/progress';
import { nextPointAt, skillPoints } from '@/game/skills';
import { Portrait } from '@/components/HeroPicker';
import { Bar, Icon, Slot } from '@/components/ui/kit';
import { IdentityLine, identityOf } from '@/components/ui/Identity';
import { useCountUpInt } from '@/components/ui/motion';
import { C, FONT, thinGlass } from '@/lib/theme';

/** Cüzdan adresini kısalt — kart dar, kimlik için 8 hane yeter */
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/**
 * ⚠️ AÇIK/KAPALI TERCİHİ HATIRLANIYOR. Kartı her açılışta yeniden kapatmak,
 * onu her seferinde yeniden açtırmak demek; oyuncu tercihini bir kez
 * söylesin yeter. Ayrı bir sunucu alanı değil — bu bir CİHAZ tercihi,
 * ayarların `localStorage`da durmasıyla aynı gerekçe.
 */
const ANAHTAR = 'graveborn:profilAcik';

/** Küçük istatistik kutusu — `RecordsPanel`deki `Stat` ile aynı kalıp */
function Kutu({ ikon, etiket, deger, baslik, vurgu = false }: {
  ikon: 'skull' | 'star' | 'tome';
  etiket: string;
  deger: string;
  baslik?: string;
  vurgu?: boolean;
}) {
  return (
    <div title={baslik} style={{
      flex: '1 1 0', minWidth: 0, padding: '4px 5px', borderRadius: 5,
      background: 'rgba(0,0,0,0.34)',
      border: `1px solid ${vurgu ? `${C.candle}44` : 'rgba(255,255,255,0.08)'}`,
      textAlign: 'center',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        fontSize: 7.5, fontWeight: 900, letterSpacing: 0.8, color: C.boneFaint,
      }}>
        <Icon name={ikon} scale={1} dim />
        <span>{etiket}</span>
      </div>
      <div style={{
        fontSize: 12, fontWeight: 900, marginTop: 1,
        color: vurgu ? C.candle : C.bone, fontVariantNumeric: 'tabular-nums',
      }}>
        {deger}
      </div>
    </div>
  );
}

export function ProfileCard({ progress, wallet, onOpen }: {
  progress: Progress;
  /** cüzdan adresi — demo modunda boş */
  wallet?: string | null;
  /** genişletilmiş kısımdaki bağlantı — kayıtlar paneli */
  onOpen?: () => void;
}) {
  const hero = heroById(progress.hero);
  const [acik, setAcik] = useState(false);

  // ⚠️ İlk çizimde `localStorage` OKUNMUYOR — sunucu ile istemci çıktısı
  // ayrışır ve hydration uyarısı üretirdi. Tercih montajdan sonra uygulanıyor.
  useEffect(() => {
    try { setAcik(localStorage.getItem(ANAHTAR) === '1'); } catch { /* yoksay */ }
  }, []);
  const degistir = () => {
    setAcik((v) => {
      try { localStorage.setItem(ANAHTAR, v ? '0' : '1'); } catch { /* yoksay */ }
      return !v;
    });
  };

  const olcum = useMemo(() => {
    // ⚠️ `paidDepth` KULLANILIYOR, iddia edilen derinlik değil: sunucunun
    // ödeme yaptığı derinlik. Skill puanlarıyla aynı kaynak — kartta başka
    // bir sayı göstermek, oyuncuya iki farklı "en derin"i öğretirdi.
    const enDerin = Math.max(0, ...STAGES.map((s) => paidDepth(progress, s.id)));
    return {
      enDerin,
      temizlenen: STAGES.filter((s) => progress.cleared[s.id]).length,
      puan: skillPoints(enDerin),
      sonraki: nextPointAt(enDerin),
    };
  }, [progress]);

  const rutbe = ossuaryTier(progress.ossuary);
  const ilerleme = ossuaryTierProgress(progress.ossuary);
  /**
   * ⚠️ ÇUBUK TEK BAŞINA HİÇBİR ŞEY SÖYLEMİYORDU. Ekranda 16 px'lik ince bir
   * turuncu çizgi olarak duruyor ve %70 doluluğu okunmuyordu — yani kartın
   * en anlamlı bilgisi görünmez bir süstü. Kalan seviye ve BİR SONRAKİ
   * RÜTBENİN ADI yazılınca çubuk bir ilerleme anlatısına dönüşüyor.
   */
  const kalan = OSSUARY.tierEvery - (Math.max(0, Math.floor(progress.ossuary)) % OSSUARY.tierEvery);
  const sonrakiRutbe = ossuaryTier(progress.ossuary + kalan);
  const derinlik = useCountUpInt(olcum.enDerin);

  const ad = wallet ? short(wallet) : 'You';
  const kimlik = identityOf(progress, ad);

  return (
    // ⚠️ İNCE CAM, TAM PANEL ÇERÇEVESİ DEĞİL — ChatPanel ile aynı köşe dili.
    // Panel çerçevesi oyuncunun ÜSTÜNE GİTTİĞİ yerler için; sürekli ekranda
    // duran bir çip sahneyi delmemeli.
    // ⚠️ GENİŞLİĞİ KART BELİRLEMİYOR — sarmalayıcı belirliyor (`play/page.tsx`).
    // Sebep ölçüldü: rıhtım ORTALI, sol kenarı görüntü genişliğine bağlı ve
    // kartın kullanabileceği boşluk her ekranda farklı. Kart sabit 214 px
    // olduğunda 1134 px'de navbar'ın üstüne biniyordu. Boşluk orada ölçülüp
    // buraya genişlik olarak veriliyor; kart ona uyuyor.
    <div style={{ ...thinGlass(9), width: '100%', overflow: 'hidden', fontFamily: FONT.ui }}>
      {/* ── ŞERİT: her zaman görünür ── */}
      <button
        onClick={degistir}
        style={{
          all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '6px 8px',
        }}
      >
        {/* ⚠️ Portre YUVA ÇERÇEVESİNDE — oyunun envanter dili. Düz 1px
            kenarlıklı bir kutu "web" duruyordu. `Slot scale={2}` = 32 px. */}
        <Slot type="Empty" variant="02" scale={2}>
          <Portrait hero={hero} size={26} frame={false} />
        </Slot>

        <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
          {/* Reliquary'den takılan unvan/levha/kupa BURADA görünüyor */}
          <IdentityLine id={kimlik} compact size={12} />
          <div style={{
            fontSize: 8.5, fontWeight: 900, letterSpacing: 1, color: C.candle,
            marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {rutbe.toUpperCase()}
          </div>
        </div>

        {/* Açılır işareti — kartın açılabildiğini SÖYLEYEN tek şey bu */}
        {/* ⚠️ Açılır işareti EKRANDA NEREDEYSE GÖRÜNMÜYORDU (9 px, sönük).
            Kartın açılabildiğini söyleyen TEK şey bu; görünmezse özellik de
            yok demektir. Büyütüldü ve kendi kutusuna alındı. */}
        <span style={{
          flexShrink: 0, width: 16, height: 16, borderRadius: 4,
          display: 'grid', placeItems: 'center',
          fontSize: 8, color: C.candle, background: 'rgba(239,167,46,0.12)',
          border: `1px solid ${C.candle}33`,
          transform: acik ? 'rotate(180deg)' : 'none',
          transition: 'transform 140ms ease-out',
        }}>
          ▼
        </span>
      </button>

      {/* ── AÇILAN KISIM ── */}
      {acik && (
        <div style={{ padding: '0 8px 8px' }}>
          {/* ⚠️ `tone="gold"` — varsayılan dolgu YEŞİLDİ (Bar08 ölçüldü:
              rgb(102,157,78)) ve oyunun paletinde yeşil yok.
              ⚠️ `scale={2}`: scale 1'de çubuk 16 px ve Franuka'nın oluk
              detayı kayboluyor; ekranda ince bir çizgi olarak okunuyordu. */}
          <Bar pct={ilerleme} variant="01" tone="gold" scale={2} />
          <div style={{
            marginTop: 3, fontSize: 8.5, color: C.boneFaint,
            display: 'flex', justifyContent: 'space-between', gap: 6,
          }}>
            <span>{kalan} to <b style={{ color: C.boneDim }}>{sonrakiRutbe.toUpperCase()}</b></span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {OSSUARY.tierEvery - kalan}/{OSSUARY.tierEvery}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <Kutu ikon="skull" etiket="DEPTH" deger={String(derinlik)} vurgu
              baslik="Deepest descent the server has paid for" />
            <Kutu ikon="star" etiket="STAGES"
              deger={`${olcum.temizlenen}/${STAGES.length}`}
              baslik="Stages cleared" />
            {/* ⚠️ Puan kutusu yalnızca VARSA. Sıfırken "0" göstermek, yeni
                oyuncuya kazanmadığı bir şeyi hatırlatmaktan başka işe
                yaramaz — ve dar sırada yer yer. */}
            {olcum.puan > 0 && (
              <Kutu ikon="tome" etiket="PATHS" deger={String(olcum.puan)}
                baslik={olcum.sonraki ? `Next point at depth ${olcum.sonraki}` : 'All points earned'} />
            )}
          </div>

          {onOpen && (
            <button
              onClick={onOpen}
              style={{
                all: 'unset', cursor: 'pointer', display: 'block', width: '100%',
                marginTop: 6, textAlign: 'center',
                fontSize: 9, fontWeight: 900, letterSpacing: 1, color: C.boneFaint,
              }}
            >
              FULL RECORD
            </button>
          )}
        </div>
      )}
    </div>
  );
}
