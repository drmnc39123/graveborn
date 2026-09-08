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

const KUTU = 34;

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
@keyframes gb-vigil-capa { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
`}</style>
      <button
        onClick={onOpen}
        title={sahip ? 'The Long Vigil — your road' : 'The Long Vigil — the season card'}
        aria-label="The Long Vigil"
        style={{
          position: 'absolute', zIndex: 6, pointerEvents: 'auto',
          // ⚠️ Minimapın SOLUNA, kutunun kendi kenarından 8 px içeri
          left: k.x - KUTU - 8,
          top: k.y,
          width: KUTU, height: KUTU, padding: 0, cursor: 'pointer',
          borderRadius: 8, boxSizing: 'border-box',
          background: 'rgba(10,8,6,0.82)',
          border: `1px solid ${sahip ? `${C.ok}66` : `${C.candle}88`}`,
          boxShadow: sahip ? 'none' : `0 0 12px ${C.candle}44`,
          display: 'grid', placeItems: 'center',
          animation: !sahip && !hareketKapali
            ? 'gb-vigil-capa 2.4s ease-in-out infinite' : undefined,
        }}
      >
        {/* ⚠️ KAPALI sandık — bkz. dosya başlığı. `imageRendering: pixelated`
            şart: piksel sanatı bulanıklaşınca yanındaki her şeyin yanında
            ucuz durur. */}
        <img
          src="/art/chests/spr_Chest_1_closed.png"
          alt=""
          width={24}
          height={24}
          style={{ imageRendering: 'pixelated', display: 'block' }}
        />
        {/* Alınmamışsa küçük bir işaret: "burada bir şey var" */}
        {!sahip && (
          <span style={{
            position: 'absolute', right: -3, top: -3,
            width: 8, height: 8, borderRadius: '50%',
            background: C.candle, border: `1px solid ${C.void}`,
            boxShadow: `0 0 6px ${C.candle}`,
          }} />
        )}
      </button>

      {/* ⚠️ ETİKET ŞART: simge tek başına ne olduğunu söylemiyor ve bu
          oyunun en pahalı düğmesi. Sandık ikonu "ödül" çağrıştırıyor;
          adı yazmazsak oyuncu tıklayana kadar bilmiyor. */}
      <span style={{
        position: 'absolute', zIndex: 6, pointerEvents: 'none',
        left: k.x - KUTU - 8, top: k.y + KUTU + 2, width: KUTU,
        textAlign: 'center', fontFamily: FONT.ui,
        fontSize: 7.5, fontWeight: 900, letterSpacing: 0.4,
        color: sahip ? C.boneFaint : C.candle,
        textShadow: '0 1px 0 #000',
      }}>VIGIL</span>
    </>
  );
}
