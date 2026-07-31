'use client';
// FRANUKA UI KİTİ — tek 9-slice primitifi, tüm arayüz onun üstüne kuruluyor.
//
// NEDEN TEK PRİMİTİF: `public/art/ui/kit/` altındaki HER varlık 16px ızgarada.
// Paneller 48×48 (3×3 karo), geniş butonlar 48×16 (3×1), slot/ikon/onay
// kutusu 16×16. Yani hepsi `border-image ... 16 fill` ile kesiliyor; ayrı ayrı
// kırpma, atlas metadata'sı veya görsel editör gerekmiyor.
//
// ÖLÇEK: `scale` kaç kat büyütüleceği. borderWidth = slice × scale olduğu için
// 3 → 48px kenar. `image-rendering: pixelated` şart, yoksa piksel sanat bulanır.
//
// LİSANS: Franuka RPG UI pack — ticari kullanım serbest, ANCAK Credits'te
// franuka.itch.io bağlantısı ZORUNLU. (ATTRIBUTION.md)

import { useState, type CSSProperties, type ReactNode } from 'react';
import { C, FONT } from '@/lib/theme';

const KIT = '/art/ui/kit';

/** Piksel sanat için ortak kural — her 9-slice ve <img> bunu kullanır */
export const pixel: CSSProperties = { imageRendering: 'pixelated' };

/**
 * Dört yandan 9-slice. SADECE kare varlıklar için (48×48 paneller):
 * 16+16 kenar + 16 orta = 48, yani gerçekten bir orta karo var.
 */
export function nineSlice(src: string, slice = 16, scale = 3): CSSProperties {
  return {
    borderStyle: 'solid',
    borderWidth: slice * scale,
    borderImageSource: `url("${src}")`,
    borderImageSlice: `${slice} fill`,
    borderImageRepeat: 'repeat',
    ...pixel,
  };
}

/**
 * SADECE YATAY dilimleme — 48×16 butonlar, çubuklar ve 48×32 flamalar için.
 *
 * NEDEN: bu varlıklar DİKEYDE orta karo İÇERMEZ (16 üst + 16 alt = 16px'lik
 * görselin tamamı). Dört yandan dilimlersen üst ve alt kenarlıklar üst üste
 * biner, içerik kutusu taşar ve metin butonun DIŞINA düşer. (Bu hataya bir kez
 * düşüldü; ekranda buton gibi görünen boş çubukların altında yazı kaldı.)
 *
 * Doğrusu: yükseklik SABİT (varlık yüksekliği × scale), yatayda orta karo
 * tekrarlar. Böylece piksel oranı hiç bozulmaz.
 */
export function sliceH(src: string, slice = 16, scale = 3): CSSProperties {
  return {
    borderStyle: 'solid',
    borderWidth: `0 ${slice * scale}px`,
    borderImageSource: `url("${src}")`,
    borderImageSlice: `0 ${slice} fill`,
    borderImageRepeat: 'repeat',
    boxSizing: 'border-box',
    ...pixel,
  };
}

// ── PANEL ─────────────────────────────────────────────────────────────
// 13 çerçeve var. Paletimiz gotik korku olduğu için seçim DAR:
//   07A → koyu şarap kırmızısı + sarmaşık köşe  ← VARSAYILAN, mezarlık teması
//   01B → soğuk mavi-gri (ikincil, "buz" tonu)
//   08A → düz gri (nötr, dikkat dağıtmaması gereken yerler)
// 01C/02A/04A/04B parlak turuncu-pembe bez — temaya ZIT, kullanma.

export type PanelStyle = '01A' | '01B' | '01C' | '02A' | '02B' | '03A'
  | '04A' | '04B' | '04C' | '05A' | '06A' | '07A' | '08A';

export function Panel({
  children, variant = '07A', scale = 3, pad = 14, style, onClick,
}: {
  children?: ReactNode;
  variant?: PanelStyle;
  scale?: number;
  /** kenarlığın İÇİNDEKİ boşluk */
  pad?: number;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div onClick={onClick} style={{ ...nineSlice(`${KIT}/Background-boxes/BGbox_${variant}.png`, 16, scale), ...style }}>
      <div style={{ padding: pad, fontFamily: FONT.ui }}>{children}</div>
    </div>
  );
}

// ── BUTON ─────────────────────────────────────────────────────────────
// Franuka'da 3 durum var: Normal / Selected / Pressed. Disabled YOK —
// onu doygunluğu düşürüp saydamlaştırarak kendimiz üretiyoruz (standart yol).

export type ButtonStyle = '01A' | '01B' | '01C' | '01D' | '01E'
  | '02A' | '02B' | '02C' | '02D' | '02E' | '03A' | '03B' | '03C' | '03D' | '03E';

export function PixelButton({
  children, onClick, variant = '01A', scale = 2, disabled = false, active = false,
  style, title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonStyle;
  scale?: number;
  disabled?: boolean;
  /** seçili/aktif görünüm (Selected dokusu) */
  active?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const [down, setDown] = useState(false);
  const [hover, setHover] = useState(false);

  const state = disabled ? 'Normal' : down ? 'Pressed' : (active || hover) ? 'Selected' : 'Normal';
  const src = `${KIT}/Buttons/Button_${variant}_${state}.png`;
  // 48×16 → YÜKSEKLİK SABİT (16·scale), yatayda orta karo tekrarlar.
  const h = 16 * scale;
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => { setDown(false); setHover(false); }}
      onPointerEnter={() => setHover(true)}
      style={{
        ...sliceH(src, 16, scale),
        height: h,
        minWidth: 48 * scale,
        padding: 0,
        background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        filter: disabled ? 'grayscale(0.7)' : 'none',
        fontFamily: FONT.ui,
        color: disabled ? C.boneFaint : C.bone,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // Pressed dokusu zaten bir piksel aşağı çizilmiş; metni de birlikte indir
        transform: down && !disabled ? 'translateY(1px)' : 'none',
        ...style,
      }}
    >
      <span style={{
        display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        lineHeight: 1, textShadow: '0 1px 0 rgba(0,0,0,0.55)',
      }}>
        {children}
      </span>
    </button>
  );
}

// ── BANNER (başlık şeridi) ────────────────────────────────────────────

export function Banner({ children, variant = '01A', scale = 2.5, style }: {
  children: ReactNode;
  variant?: string;
  scale?: number;
  style?: CSSProperties;
}) {
  // 48×32 → yükseklik sabit (32·scale), yatayda tekrarlar (bkz. sliceH notu)
  return (
    <div style={{
      ...sliceH(`${KIT}/Title-banners/BannerMedium_${variant}.png`, 16, scale),
      height: 32 * scale,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      <div style={{
        fontFamily: FONT.title, fontWeight: 900, letterSpacing: 1.5, lineHeight: 1,
        color: C.bone, textAlign: 'center', whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,0.6)',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── AYIRAÇ ────────────────────────────────────────────────────────────

export function Divider({ variant = '03', scale = 2 }: { variant?: string; scale?: number }) {
  return (
    <div style={{
      height: 16 * scale,
      backgroundImage: `url("${KIT}/Dividers/Divider_${variant}.png")`,
      backgroundSize: `auto ${16 * scale}px`,
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'center',
      ...pixel,
    }} />
  );
}

// ── CAN KÜRESİ ────────────────────────────────────────────────────────
// Diablo tarzı: dolgu alttan yukarı kırpılır, üstüne çerçeve biner.

export function Orb({ pct, kind = 'HP', size = 96 }: {
  /** 0..1 */
  pct: number;
  kind?: 'HP' | 'MP' | 'Energy';
  size?: number;
}) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* dolgu — alttan yukarı doluyor */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: `${p * 100}%`, overflow: 'hidden',
      }}>
        <img
          src={`${KIT}/Resource-orbs/Orb_${kind}.png`}
          alt=""
          style={{ position: 'absolute', bottom: 0, width: size, height: size, ...pixel }}
        />
      </div>
      {/* çerçeve — dolgunun üstünde */}
      <img
        src={`${KIT}/Resource-orbs/Orb_Frame_${kind}.png`}
        alt=""
        style={{ position: 'absolute', inset: 0, width: size, height: size, ...pixel }}
      />
    </div>
  );
}

// ── ÇUBUK (XP / ilerleme) ─────────────────────────────────────────────
// Franuka 8 kademe hazır dolgu veriyor; biz kutuyu taban alıp en dolu
// kademeyi kırparak PÜRÜZSÜZ dolum yapıyoruz (kademeli görünüm istemiyoruz).

export function Bar({ pct, variant = '01', height = 16, scale = 2 }: {
  pct: number;
  variant?: '01' | '02' | '03';
  height?: number;
  scale?: number;
}) {
  const p = Math.max(0, Math.min(1, pct));
  const h = height * scale;
  return (
    <div style={{ position: 'relative', width: '100%', height: h }}>
      {/* boş oluk — altta */}
      <div style={{
        position: 'absolute', inset: 0,
        ...sliceH(`${KIT}/Sliders---Bars/Slider${variant}_Box.png`, 16, scale),
      }} />
      {/* dolgu — oluğun İÇİNE oturur. Box `fill` ile ortasını da boyadığı için
          dolguyu üstte ve biraz içeride çiziyoruz, yoksa oluk dolguyu örter. */}
      <div style={{
        position: 'absolute', top: scale, bottom: scale, left: scale * 2, right: scale * 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${p * 100}%`, overflow: 'hidden',
          transition: 'width 120ms linear',
        }}>
          <div style={{
            height: '100%', width: `${100 / Math.max(p, 0.0001)}%`,
            backgroundImage: `url("${KIT}/Sliders---Bars/Slider${variant}_Bar08.png")`,
            backgroundSize: '100% 100%',
            ...pixel,
          }} />
        </div>
      </div>
    </div>
  );
}

// ── SLOT (silah / pasif kutusu) ───────────────────────────────────────

export type SlotType = 'Empty' | 'Weapon' | 'Shield' | 'Armor' | 'Headgear'
  | 'Gloves' | 'Footwear' | 'Necklace' | 'Ring' | 'Potion' | 'Consumable';

export function Slot({ type = 'Empty', variant = '02', size = 48, children, title }: {
  type?: SlotType;
  variant?: '01' | '02' | '03';
  size?: number;
  children?: ReactNode;
  title?: string;
}) {
  return (
    <div title={title} style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
      backgroundImage: `url("${KIT}/-tem-slots/Slot_${variant}_${type}.png")`,
      backgroundSize: '100% 100%',
      ...pixel,
    }}>
      {children && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontFamily: FONT.ui, fontSize: 11, fontWeight: 900, color: C.bone,
          textShadow: '0 1px 0 #000',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── SEKME ─────────────────────────────────────────────────────────────

export function Tab({ children, active = false, onClick, variant = '01', size = 44 }: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  variant?: string;
  size?: number;
}) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, padding: 0, border: 'none', cursor: 'pointer',
      background: `url("${KIT}/Spellbook---Tabs/Tab${variant}_Bottom_${active ? 'Selected' : 'Normal'}.png") center/100% 100% no-repeat`,
      fontFamily: FONT.ui, fontSize: 11, fontWeight: 900,
      color: active ? C.candle : C.boneDim,
      ...pixel,
    }}>
      {children}
    </button>
  );
}

// ── SOĞUMA HALKASI ────────────────────────────────────────────────────
// `ui/borders/` altındaki 1024px radial'lar lisansı DOĞRULANMAMIŞ pakette.
// O yüzden halkayı conic-gradient ile çiziyoruz: sıfır dosya, sıfır risk.

export function CooldownRing({ pct, size = 48, children }: {
  /** 0 = hazır, 1 = tam soğumada */
  pct: number;
  size?: number;
  children?: ReactNode;
}) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {children}
      {p > 0 && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `conic-gradient(rgba(6,5,4,0.72) ${p * 360}deg, transparent 0deg)`,
        }} />
      )}
    </div>
  );
}
