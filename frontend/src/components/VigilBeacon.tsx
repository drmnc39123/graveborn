'use client';
// VIGIL ÇAPASI — minimapın solundaki küçük sandık.
//
// 🔴 NİYE VAR (kullanıcı isteği): *"navbarda ayrıca minimapın solunda küçük
// bir yerde bir loot sandığı şeklinde bir icon koyarak kullanıcıyı oraya da
// yönlendirmeliyiz."*
//
// Kart oyunun tek gerçek paralı paketi ve bugüne kadar bir başka panelin
// (Reliquary) İÇİNDE bir sekmeydi. Navbarda kendi girişi oldu; bu çapa
// ikinci ve daha görünür kapı.
//
// ⚠️ KONUM MİNİMAPIN KUTUSUNDAN TÜRÜYOR (`hudLayout.minimapKutusu`), elle
// yazılmıyor. Sabit bir sayı yazsaydım dar ekranda minimap %70'e düştüğünde
// çapa havada kalırdı — bugün tam bu hatayı sağ kolonda ölçüp düzelttik.
//
// ⚠️ SANDIK KAPALI DURUYOR. Açık sandık "burada bir ödül var, al" der;
// oysa burası bir MAĞAZA kapısı. Kapalı sandık "burada alınacak bir şey
// var" diyor — doğru cümle bu.
//
// ⚠️ ALINMIŞSA NABIZ YOK. Kartı olan oyuncuya sürekli yanıp sönen bir satış
// çapası göstermek, ödemiş oyuncuyu rahatsız etmektir; o durumda çapa
// sessiz bir kısayola dönüşüyor.
//
// ⚠️ Tüm stiller INLINE · MOR YOK · oyuncu metinleri İngilizce.

import { minimapKutusu } from '@/game/hudLayout';
import { motionOff } from '@/components/ui/motion';
import { C, FONT } from '@/lib/theme';

/**
 * ⚠️ ÇAPA BÜYÜTÜLDÜ VE KUTUSU KALDIRILDI (kullanıcı düzeltmesi):
 * *"o koyduğun VIGIL simgesindeki sandık çok küçük ve bir karenin içinde
 * duruyor. Sadece sandığın kendisi dursun, arkası şeffaf olsun ve
 * animasyonlu olsun."*
 *
 * İlk sürüm 34 px'lik bir kutunun içinde 24 px sandık çiziyordu — yani
 * simge alanın yarısını çerçeveye veriyordu ve köyün üstünde bir "düğme"
 * gibi duruyordu. Artık çerçeve yok: yalnız sandık, arkasında yumuşak bir
 * mum ışığı.
 */
const KUTU = 52;

export function VigilBeacon({ ekranW, navbarH, navbarSol, sahip, onOpen }: {
  ekranW: number;
  navbarH: number;
  navbarSol: number;
  /** oyuncuda kart var mı — varsa çapa sessizleşir */
  sahip: boolean;
  onOpen: () => void;
}) {
  // ⚠️ Ölçü gelmeden çizme: `ekranW` 0 iken kutu ekranın dışında hesaplanır
  // ve çapa bir kare boyunca yanlış yerde parlar.
  if (ekranW <= 0) return null;

  const k = minimapKutusu(ekranW, navbarH, navbarSol);
  const hareketKapali = motionOff();

  return (
    <>
      <style>{`
@keyframes gb-pack-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes gb-pack-halo { 0%,100% { opacity: 0.35; transform: scale(0.92); } 50% { opacity: 0.75; transform: scale(1.06); } }
@keyframes gb-pack-spark { 0% { opacity: 0; transform: translate(0,0) scale(0.6); } 35% { opacity: 1; } 100% { opacity: 0; transform: translate(4px,-11px) scale(1); } }
`}</style>
      <button
        onClick={onOpen}
        title={sahip ? 'The Starter Pack — already yours' : 'The Starter Pack — gold, a hero and six relics'}
        aria-label="The Starter Pack"
        style={{
          /**
           * ⚠️ ÇERÇEVE YOK, ZEMİN YOK. `all: unset` ile tarayıcının düğme
           * görünümü de siliniyor — aksi hâlde Chrome kendi arka planını ve
           * kenarlığını koyuyor ve "şeffaf olsun" isteği yarım kalıyordu.
           */
          all: 'unset',
          position: 'absolute', zIndex: 6, pointerEvents: 'auto', cursor: 'pointer',
          left: k.x - KUTU - 6,
          top: k.y,
          width: KUTU, height: KUTU,
          display: 'grid', placeItems: 'center',
        }}
      >
        {/* ── HALE ── sandığın ARKASINDA, yumuşak mum ışığı.
            ⚠️ Kutu değil radyal gradyan: kenarı olmadığı için köyün
            üstünde bir arayüz parçası gibi durmuyor, ışık gibi duruyor. */}
        <span style={{
          position: 'absolute', inset: -4, borderRadius: '50%', pointerEvents: 'none',
          background: sahip
            ? `radial-gradient(circle, ${C.ok}33 0%, transparent 68%)`
            : `radial-gradient(circle, ${C.candle}55 0%, ${C.candle}18 45%, transparent 70%)`,
          animation: !sahip && !hareketKapali
            ? 'gb-pack-halo 2.6s ease-in-out infinite' : undefined,
        }} />

        {/* ⚠️ SANDIK KAPALI duruyor: açık sandık "burada bir ödül var, al"
            der; burası bir MAĞAZA kapısı. Kapalı sandık "burada alınacak
            bir şey var" diyor — doğru cümle bu.
            ⚠️ `imageRendering: pixelated` şart: 32 px'lik bir sprite 44'e
            büyütülünce bulanıklaşırsa yanındaki her şeyin yanında ucuz
            durur. */}
        <img
          src="/art/chests/spr_Chest_1_closed.png"
          alt=""
          width={44}
          height={44}
          style={{
            imageRendering: 'pixelated', display: 'block', position: 'relative',
            filter: sahip ? 'grayscale(0.5) brightness(0.85)' : `drop-shadow(0 0 6px ${C.candle}aa)`,
            animation: !hareketKapali ? 'gb-pack-bob 2.4s ease-in-out infinite' : undefined,
          }}
        />

        {/* ── KIVILCIMLAR ── alınmamışken; alınmışsa çapa sessizleşiyor.
            ⚠️ Kartı olan oyuncuya sürekli yanıp sönen bir satış çapası
            göstermek, ödemiş oyuncuyu rahatsız etmektir. */}
        {!sahip && !hareketKapali && [0, 1, 2].map((i) => (
          <span key={i} style={{
            position: 'absolute', pointerEvents: 'none',
            left: `${30 + i * 18}%`, top: '58%',
            width: 3, height: 3, borderRadius: '50%',
            background: C.candle, boxShadow: `0 0 5px ${C.candle}`,
            animation: `gb-pack-spark 2.2s ease-out ${i * 0.55}s infinite`,
          }} />
        ))}
      </button>

      {/* ⚠️ ETİKET ŞART: simge tek başına ne olduğunu söylemiyor ve bu
          oyunun en pahalı düğmesi. Sandık "ödül" çağrıştırıyor; adı
          yazmazsak oyuncu tıklayana kadar bilmiyor.
          ⚠️ AD DEĞİŞTİ (kullanıcı): "VIGIL" oyuncuya hiçbir şey
          söylemiyordu — kartın ne olduğunu anlatan bir ad gerekiyordu. */}
      <span style={{
        position: 'absolute', zIndex: 6, pointerEvents: 'none',
        left: k.x - KUTU - 6, top: k.y + KUTU - 4, width: KUTU,
        textAlign: 'center', fontFamily: FONT.ui,
        fontSize: 7.5, fontWeight: 900, letterSpacing: 0.6,
        color: sahip ? C.boneFaint : C.candle,
        textShadow: '0 1px 0 #000, 0 0 6px #000',
      }}>STARTER</span>
    </>
  );
}
