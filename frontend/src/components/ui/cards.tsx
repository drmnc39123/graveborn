'use client';
// KART DİLİ — panellerdeki bütün kartlar bu parçalardan kurulur.
//
// NİYE VAR: her panel kendi kartını sıfırdan yazıyordu ve hepsi "başlık +
// bir satır gri metin"de kalıyordu. Oyuncu bir bölümü seçerken kaç düşman
// olduğunu bile göremiyordu; karakter seçerken silahının NASIL ateş ettiğini
// hiç göremiyordu — "bu hero ateş etmiyor" şikâyeti tam buradan çıkmıştı
// (Litany yörünge silahı: ekranda hiçbir şey fırlatmaz, sadece halkaya
// değeni vurur).
//
// ⚠️ Tüm stiller INLINE (Phantom in-app browser Tailwind arbitrary değerleri
// desteklemiyor). ⚠️ MOR YOK.

import type { CSSProperties, ReactNode } from 'react';
import { C, FONT } from '@/lib/theme';

/** Kartın gövdesi — koyu zemin, ince kenar, hover'da canlanır */
export function Card({
  children, accent = false, dim = false, onClick, disabled = false, style,
}: {
  children: ReactNode;
  /** tamamlanmış / seçili durum — altın kenar */
  accent?: boolean;
  /** kilitli görünüm */
  dim?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const clickable = !!onClick && !disabled;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        position: 'relative',
        borderRadius: 10,
        border: `1px solid ${accent ? `${C.candle}77` : 'rgba(255,255,255,0.10)'}`,
        // Dikey degrade: kartlar düz kutu değil, üstten ışık alan bir yüzey.
        //
        // 🔴 ALT UÇ `rgba(0,0,0,0.30)` İDİ ve KART ZEMİNDEN AYRIŞMIYORDU.
        // Sebep ölçülünce basit: panel çerçevesi (07A) pembe-mor ve üstündeki
        // karartma katmanı 0,44 — yani kartın arkası zaten orta tonda bir
        // mor. %30 siyah onu ancak bir tık koyultuyordu, ekranda kart ile
        // panel aynı yüzey gibi okunuyordu. Kart bir YÜZEY olmalı; oyuncunun
        // "burası ayrı bir şey" demesi kenarlıktan değil ZEMİNDEN gelir.
        background: accent
          ? 'linear-gradient(180deg, rgba(239,167,46,0.13), rgba(8,6,11,0.68))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(8,6,11,0.62))',
        boxShadow: accent
          ? `0 0 0 1px ${C.candle}2a, 0 6px 18px rgba(0,0,0,0.45)`
          : '0 4px 14px rgba(0,0,0,0.42)',
        opacity: dim ? 0.58 : 1,
        cursor: clickable ? 'pointer' : 'default',
        overflow: 'hidden',
        fontFamily: FONT.ui,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Küçük rozet — sayı/etiket. Kartın "bir bakışta" okunan kısmı. */
export function Tag({ children, tone = 'dim', title }: {
  children: ReactNode;
  tone?: 'dim' | 'gold' | 'blood' | 'ok' | 'bad';
  title?: string;
}) {
  const map = {
    dim: { fg: C.boneDim, bg: 'rgba(255,255,255,0.06)', bd: 'rgba(255,255,255,0.10)' },
    gold: { fg: C.candle, bg: 'rgba(239,167,46,0.13)', bd: `${C.candle}44` },
    blood: { fg: '#e4657a', bg: 'rgba(160,18,38,0.18)', bd: 'rgba(160,18,38,0.5)' },
    ok: { fg: C.ok, bg: 'rgba(95,158,74,0.15)', bd: 'rgba(95,158,74,0.42)' },
    bad: { fg: C.bad, bg: 'rgba(200,50,74,0.15)', bd: 'rgba(200,50,74,0.42)' },
  }[tone];
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap',
      fontSize: 10, fontWeight: 900, letterSpacing: 0.6,
      color: map.fg, background: map.bg, border: `1px solid ${map.bd}`,
    }}>
      {children}
    </span>
  );
}

/**
 * Zorluk göstergesi — beş kademe.
 * ⚠️ Ham `hpMul` sayısı ("×5.2 HP") oyuncuya hiçbir şey söylemiyor; kaç nokta
 * yandığı söylüyor. Sayıyı yine de `title` olarak taşıyoruz.
 */
export function Pips({ value, max = 5, title }: { value: number; max?: number; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', gap: 2.5, alignItems: 'center' }}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: 1,
          background: i < value ? C.blood : 'rgba(255,255,255,0.13)',
          boxShadow: i < value ? `0 0 4px ${C.blood}88` : 'none',
        }} />
      ))}
    </span>
  );
}

/**
 * Artı/eksi istatistik çubuğu — sıfır ORTADA.
 * ⚠️ Düz metin ("+15% projectile speed · −12% max health") bir liste, bir
 * karşılaştırma değil. Karakterler ancak yan yana ölçülebildiklerinde seçim
 * sunar; çubuk bunu bir bakışta veriyor.
 */
export function DeltaBar({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(-1, Math.min(1, pct / 0.35)); // ±%35 = tam çubuk
  const iyi = pct >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: '0 0 108px', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, color: C.boneFaint }}>
        {label.toUpperCase()}
      </span>
      <span style={{ position: 'relative', flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }}>
        {/* orta çizgi — sıfır noktası görünür olmalı */}
        <span style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 10, background: 'rgba(255,255,255,0.22)' }} />
        <span style={{
          position: 'absolute', top: 0, height: 6, borderRadius: 3,
          left: iyi ? '50%' : `${50 + clamped * 50}%`,
          width: `${Math.abs(clamped) * 50}%`,
          background: iyi ? C.ok : C.bad,
          boxShadow: `0 0 6px ${iyi ? C.ok : C.bad}66`,
        }} />
      </span>
      <span style={{
        flex: '0 0 44px', textAlign: 'right', fontSize: 10.5, fontWeight: 900,
        color: iyi ? C.ok : C.bad,
      }}>
        {iyi ? '+' : '−'}{Math.abs(Math.round(pct * 100))}%
      </span>
    </div>
  );
}

/** Kart içinde ayrılmış alt bölüm — "başlık + içerik" */
export function CardSection({ label, children, tone = C.boneFaint }: {
  label: string;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div style={{
      margin: '9px 0 0', padding: '8px 10px', borderRadius: 7,
      background: 'rgba(0,0,0,0.26)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.4, color: tone, marginBottom: 5 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

/**
 * SİLAH DESENİ AÇIKLAMALARI — oyuncunun en çok ihtiyaç duyduğu bilgi.
 *
 * ⚠️ Silahın adı ve hasarı ne yaptığını SÖYLEMİYOR. Water Priestess'e yörünge
 * silahı verildiğinde oyun testinde "bu hero ateş etmiyor" şikâyeti geldi:
 * silah gerçekten hiçbir şey fırlatmıyor, sadece etrafındaki halkaya değeni
 * vuruyor. Bu bir hata değil tasarımdı — ama hiçbir yerde yazmıyordu.
 */
export const PATTERN_TEXT: Record<string, { label: string; how: string }> = {
  aimed: { label: 'SEEKING', how: 'Fires at whatever stands nearest.' },
  sweep: { label: 'SWEEP', how: 'Cuts an arc in the direction you face — aim with your feet.' },
  orbit: { label: 'ORBIT', how: 'Circles you. Fires nothing — it only hurts what touches the ring.' },
  aura: { label: 'AURA', how: 'Constant damage to everything close enough to touch you.' },
  nova: { label: 'NOVA', how: 'Bursts outward in every direction at once.' },
  ground: { label: 'GROUND', how: 'Leaves a burning patch where it lands. It does not follow you.' },
  boomerang: { label: 'RETURNING', how: 'Thrown ahead, then comes back — it hurts on both trips.' },
  chain: { label: 'CHAIN', how: 'Leaps from one enemy to the next. Never the same one twice.' },
};

/** `bone_archer` → `Bone Archer` — düşman id'lerinin okunabilir hâli */
export function prettyId(id: string): string {
  return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * PANEL BAŞLIĞI — köyün her kapısına kendi kimliğini veren tek yer.
 *
 * ⚠️ NİYE ORTAK BİR BİLEŞEN: ölçüldü, 8 panelin başlığı BİREBİR AYNIYDI —
 * aynı 11 px kicker, aynı `C.blood`, aynı 24 px başlık, sekiz kopya. Paneller
 * "hepsi aynı kutu" hissini tam olarak buradan alıyordu. Kopyaları teker teker
 * renklendirmek de çözüm değildi: dokuzuncu panel eklendiğinde biri unutulur.
 *
 * ⚠️ KİMLİK ÇERÇEVEDE DEĞİL BAŞLIKTA. Her panele farklı bir `BGbox` varyantı
 * vermek denenmedi ve verilmemeli: varyantların orta renkleri ölçüldü
 * (turuncu 255,174,112 · teal 79,164,184 · şarap 143,77,87 …) ve yan yana
 * gelince tek bir oyun gibi durmuyorlar. Sanat yönü ortak kalır, kimliği
 * VURGU RENGİ taşır — hepsi zaten paletin içinden (mor yok).
 */
export function PanelHead({ kicker, title, sub, accent = C.blood, right }: {
  /** küçük üst satır — mekânın adı */
  kicker: string;
  /** büyük satır — mekânın ne işe yaradığı */
  title: ReactNode;
  /** isteğe bağlı açıklama */
  sub?: ReactNode;
  /** mekânın vurgu rengi — paletten */
  accent?: string;
  /** sağa hizalı ek (sayaç, rozet…) */
  right?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: accent }}>
          {kicker}
        </div>
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      <h2 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 900, color: C.bone, lineHeight: 1.15 }}>
        {title}
      </h2>
      {sub && (
        <p style={{ margin: '5px 0 0', fontSize: 12, color: C.boneFaint, lineHeight: 1.5 }}>{sub}</p>
      )}
      {/* Vurgu çizgisi — kimliği taşıyan asıl işaret.
          ⚠️ Franuka'nın `Dividers/` varlıkları (48×16) DENENMEDİ: hepsi kendi
          rengini taşıyor ve panel başına renklendirilemiyorlar; `filter` ile
          boyamak piksel sanatı bulandırıyor. Düz bir gradyan çizgi hem
          renklenebiliyor hem ızgarayı bozmuyor. */}
      <div style={{
        marginTop: 8, height: 2, borderRadius: 2,
        background: `linear-gradient(90deg, ${accent}, ${accent}22 70%, transparent)`,
      }} />
    </div>
  );
}
