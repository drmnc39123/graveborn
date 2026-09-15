'use client';
// HUD KISAYOLU — köyün üstünde duran küçük kare ikon düğmesi.
//
// 🔴 NİYE VAR (kullanıcı): *"Guild butonundan bir tane daha yapalım ve chatin
// yanına koyalım… Friends de aynı şekilde… bunlar küçük ikon tarzında olsun."*
//
// ⚠️ YENİ BİR DÜĞME DİLİ İCAT EDİLMEDİ: rıhtımdaki codex "?" düğmesinin
// (`BuildingDock.tsx`) birebir kopyası — `all:'unset'`, `border-box`, düz
// rgba zemin, `C.ice` kenar. `border-box` şart: `dock.test` bu dersi
// ölçerek öğrendi (kenarlık kutuya dahil değilse düğme 2 px büyük çıkıyor).
//
// ⚠️ İNCE CAM (`thinGlass`) DEĞİL, DÜZ ZEMİN: düğme zaten `thinGlass` olan
// sohbet kutusunun İÇİNDE. İç içe `backdrop-filter` pahalı ve bulanık;
// tuval üstü yüzey kuralı (`fx.test` [G]) yalnız `glass(`ı yasaklıyor.
//
// ⚠️ GLİF PİKSEL SANAT, EMOJİ DEĞİL (bkz. `lib/hudGlif.ts`). Renk paletten.

import { C } from '@/lib/theme';
import { glifPikselleri, type GlifAdi } from '@/lib/hudGlif';

/** Bir glifi tek bir SVG yolu olarak çizer — piksel başına bir `<rect>` değil. */
function Glif({ ad, renk, yukseklik }: { ad: GlifAdi; renk: string; yukseklik: number }) {
  const { w, h, px } = glifPikselleri(ad);
  const d = px.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
  return (
    <svg
      width={(w / h) * yukseklik} height={yukseklik}
      viewBox={`0 0 ${w} ${h}`}
      // ⚠️ Keskin kenar: piksel sanat yumuşatılırsa bulanık bir leke olur.
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d={d} fill={renk} />
    </svg>
  );
}

export function HudKisayol({
  glif, etiket, onClick, renk = C.candle, aktif = false, nokta = 0, boyut = 26,
}: {
  glif: GlifAdi;
  /** Ekran okuyucu ve üzerine gelince görünen ad — oyuncu metni İngilizce */
  etiket: string;
  onClick: () => void;
  renk?: string;
  aktif?: boolean;
  /**
   * Köşe noktası sayacı.
   * ⚠️ SIFIRSA ÇİZİLMEZ — deponun kuralı: "0" rozeti gösteren bir düğme,
   * oyuncuya yapacak bir şey varmış gibi yalan söyler.
   */
  nokta?: number;
  boyut?: number;
}) {
  return (
    <button
      onClick={(e) => {
        // ⚠️ Tıklama sohbet kutusuna, oradan köye taşmasın.
        e.stopPropagation();
        onClick();
      }}
      title={etiket}
      aria-label={etiket}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flexShrink: 0,
        position: 'relative',
        width: boyut, height: boyut, borderRadius: 5,
        display: 'grid', placeItems: 'center',
        background: aktif ? 'rgba(138,151,163,0.22)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${aktif ? `${C.ice}66` : 'rgba(255,255,255,0.12)'}`,
      }}
    >
      <Glif ad={glif} renk={renk} yukseklik={Math.round(boyut * 0.58)} />
      {nokta > 0 && (
        // `BuildRail` evrim-hazır noktasıyla aynı desen.
        <span style={{
          position: 'absolute', right: -3, top: -3,
          width: 9, height: 9, borderRadius: '50%',
          background: C.candle, boxShadow: `0 0 7px ${C.candle}`,
          border: `1px solid ${C.void}`,
        }} />
      )}
    </button>
  );
}
