'use client';
// KARAKTER SEÇİMİ — Warden's Post'un tepesinde, bölüm seçmeden önce.
//
// Ayrı bir panel yapılmadı: karakteri bölümden ayrı bir yerde seçmek, oyuncuyu
// koşuya başlamadan önce iki ekran arasında gezdirir. Aynı akışta olması doğru.

import { HEROES, heroById, type HeroDef } from '@/game/heroes';
import { weaponById } from '@/game/config';
import { C, FONT, glass } from '@/lib/theme';

/**
 * Portre: kaynak kare 288×128 ve karakter ortada küçük duruyor. Kutuyu
 * `overflow:hidden` yapıp görseli ÖLÇÜLMÜŞ içerik kutusuna göre kaydırıp
 * büyütüyoruz — böylece her karakter kutuyu aynı şekilde dolduruyor.
 */
function Portrait({ hero, size = 56 }: { hero: HeroDef; size?: number }) {
  const c = hero.crop;
  const scale = size / Math.max(c.w, c.h);
  return (
    <div style={{
      width: size, height: size, flexShrink: 0, overflow: 'hidden',
      position: 'relative', borderRadius: 6,
      background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border}`,
    }}>
      <img
        src={`/art/heroes/${hero.dir}/${hero.idle.replace('{i}', '1')}`}
        alt={hero.name}
        style={{
          position: 'absolute',
          left: (size - c.w * scale) / 2 - c.x * scale,
          top: (size - c.h * scale) / 2 - c.y * scale,
          width: 288 * scale, height: 128 * scale,
          maxWidth: 'none', imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}

export function HeroPicker({ selected, onSelect }: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const cur = heroById(selected);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.8, color: C.boneFaint, marginBottom: 7 }}>
        WHO WALKS IN
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
        {HEROES.map((h) => {
          const on = h.id === cur.id;
          return (
            <button key={h.id} onClick={() => onSelect(h.id)} title={h.name}
              style={{
                all: 'unset', cursor: 'pointer', padding: 3, borderRadius: 8,
                border: `2px solid ${on ? C.candle : 'transparent'}`,
                background: on ? 'rgba(239,167,46,0.12)' : 'transparent',
              }}>
              <Portrait hero={h} size={54} />
            </button>
          );
        })}
      </div>

      {/* Seçilenin ne vaat ettiği AÇIK yazsın — portreye bakıp tahmin
          ettirmek seçim ekranını süse çevirir. */}
      <div style={{ ...glass(10), padding: '10px 12px', fontFamily: FONT.ui }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: C.bone }}>{cur.name}</span>
          <span style={{ fontSize: 10.5, color: C.blood, fontWeight: 900, letterSpacing: 1.2 }}>
            {cur.title.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 3, lineHeight: 1.5 }}>{cur.blurb}</div>
        <div style={{ fontSize: 11, color: C.candle, marginTop: 6 }}>
          Starts with <b>{weaponById(cur.weapon)?.name ?? cur.weapon}</b>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 10.5 }}>
          <span style={{ color: C.ok }}>{cur.pros.join(' · ')}</span>
          {cur.cons.length > 0 && <span style={{ color: C.bad }}>{cur.cons.join(' · ')}</span>}
        </div>
      </div>
    </div>
  );
}
