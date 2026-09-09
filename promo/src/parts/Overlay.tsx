// KATMANLAR — vinyet, tarama çizgisi, film tanesi, sinema bandı, flaş.
//
// ⚠️ HEPSİ ÖLÇÜLÜ. Piksel sanatın üstüne kalın bir CRT filtresi atmak ilk
// bakışta "havalı" görünüyor ama 1080p'de sprite'ları yiyor: oyunun asıl
// gösterilecek şeyi kayboluyor. Buradaki değerler bilerek zayıf — katman
// tonu taşısın, görüntüyü ezmesin.
//
// ⚠️ MOR YOK — flaşlar bile kemik/kan/mum renginde.

import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';

/** Kenarları karartır — oyunun kendi meşale/vinyetinin devamı gibi. */
export const Vinyet: React.FC<{ guc?: number }> = ({ guc = 0.72 }) => (
  <AbsoluteFill style={{
    background:
      `radial-gradient(120% 90% at 50% 50%, rgba(0,0,0,0) 38%, rgba(0,0,0,${guc * 0.55}) 74%, rgba(0,0,0,${guc}) 100%)`,
    pointerEvents: 'none',
  }} />
);

/** İnce yatay tarama — 3 pikselde bir, %6 opaklık. */
export const Tarama: React.FC<{ opaklik?: number }> = ({ opaklik = 0.06 }) => (
  <AbsoluteFill style={{
    backgroundImage:
      `repeating-linear-gradient(0deg, rgba(0,0,0,${opaklik}) 0px, rgba(0,0,0,${opaklik}) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)`,
    pointerEvents: 'none',
  }} />
);

/**
 * FİLM TANESİ — kare başına yer değiştiren bir doku.
 *
 * ⚠️ `random()` REMOTION'DAN, `Math.random()` DEĞİL. Remotion aynı kareyi
 * birden çok kez (önizleme + render + paralel işçiler) çizebiliyor;
 * `Math.random()` ile tane her çizimde başka yere düşer ve videoda
 * titreşen bir bant olarak görünür. Oyunun `game/` altındaki
 * "Math.random yasak" kuralının aynı sebebi.
 */
export const Tane: React.FC<{ guc?: number }> = ({ guc = 0.05 }) => {
  const f = useCurrentFrame();
  const dx = random(`tane-x-${f}`) * 100;
  const dy = random(`tane-y-${f}`) * 100;
  return (
    <AbsoluteFill style={{
      opacity: guc,
      pointerEvents: 'none',
      mixBlendMode: 'overlay',
      backgroundImage:
        'radial-gradient(rgba(255,255,255,0.9) 0.5px, rgba(0,0,0,0) 0.6px)',
      backgroundSize: '3px 3px',
      backgroundPosition: `${dx}px ${dy}px`,
    }} />
  );
};

/**
 * ALT PERDE — etiketin arkasını karartır.
 *
 * 🔴 ÖLÇÜLDÜ, SÜS DEĞİL: bölüm 3'ün zemini açık kahve ve `boneDim`
 * (#b8ae98) alt satırı onun üstünde okunmuyordu. Metne gölge eklemek
 * yetmedi (gölge kenarı keskinleştirir, kontrastı değil). Perde, oyunun
 * kendi panel yüzeyleriyle aynı mantık: yazının altına zemin koy.
 *
 * ⚠️ ÜST YARIYA HİÇ DOKUNMUYOR — asıl gösterilecek şey oyun.
 */
export const Perde: React.FC<{ guc?: number; yukseklik?: number }> = ({
  guc = 0.9, yukseklik = 46,
}) => (
  <AbsoluteFill style={{
    pointerEvents: 'none',
    background:
      `linear-gradient(0deg, rgba(10,8,6,${guc}) 0%, rgba(10,8,6,${guc * 0.55}) ${yukseklik * 0.45}%, rgba(10,8,6,0) ${yukseklik}%)`,
  }} />
);

/** Üst/alt sinema bandı — sahneyi "çekim" yapan en ucuz ve en etkili şey. */
export const Bant: React.FC<{ yukseklik?: number }> = ({ yukseklik = 74 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: yukseklik, background: C.void }} />
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: yukseklik, background: C.void }} />
  </AbsoluteFill>
);

/**
 * KESME FLAŞI — planın ilk karelerinde kısa bir parlama.
 * ⚠️ 3 KARE. Daha uzunu göz yorar ve 30 fps'te "hata" gibi görünür.
 */
export const Flas: React.FC<{ renk?: string; kare?: number }> = ({
  renk = C.bone, kare = 3,
}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, kare], [0.55, 0], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: renk, opacity: o, pointerEvents: 'none' }} />;
};

/** Karartmadan açılma / karartmaya kapanma. */
export const Karart: React.FC<{ sure: number; ac?: boolean; kare?: number }> = ({
  sure, ac = true, kare = 12,
}) => {
  const f = useCurrentFrame();
  const o = ac
    ? interpolate(f, [0, kare], [1, 0], { extrapolateRight: 'clamp' })
    : interpolate(f, [sure - kare, sure], [0, 1], { extrapolateLeft: 'clamp' });
  return <AbsoluteFill style={{ background: C.void, opacity: o, pointerEvents: 'none' }} />;
};

/**
 * KÖŞE İŞARETLERİ — köşelerde ince kemik çizgiler.
 * Oyunun dokuz-dilim panel çerçevesinin video karşılığı; yeni bir görsel
 * dil icat etmeden "arayüz" hissi veriyor.
 */
export const Koseler: React.FC<{ opaklik?: number }> = ({ opaklik = 0.5 }) => {
  const u = 46, k = 2, m = 56;
  const cizgi = { position: 'absolute', background: C.bone, opacity: opaklik } as const;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ ...cizgi, left: m, top: m, width: u, height: k }} />
      <div style={{ ...cizgi, left: m, top: m, width: k, height: u }} />
      <div style={{ ...cizgi, right: m, top: m, width: u, height: k }} />
      <div style={{ ...cizgi, right: m, top: m, width: k, height: u }} />
      <div style={{ ...cizgi, left: m, bottom: m, width: u, height: k }} />
      <div style={{ ...cizgi, left: m, bottom: m, width: k, height: u }} />
      <div style={{ ...cizgi, right: m, bottom: m, width: u, height: k }} />
      <div style={{ ...cizgi, right: m, bottom: m, width: k, height: u }} />
    </AbsoluteFill>
  );
};

/** Sağ üstte sabit künye — izleyici videoyu ortadan görürse de bilsin. */
export const Kunye: React.FC = () => (
  <div style={{
    position: 'absolute', right: 74, top: 100,
    fontFamily: FONT, fontSize: 19, letterSpacing: 3,
    color: C.boneFaint, textAlign: 'right',
  }}>
    GRAVEBORN<br />
    <span style={{ color: C.candle, fontSize: 15 }}>ON SOLANA</span>
  </div>
);
