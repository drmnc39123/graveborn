'use client';
// KARAKTER SEÇİMİ — Warden's Post'un tepesinde, bölüm seçmeden önce.
//
// Ayrı bir panel yapılmadı: karakteri bölümden ayrı bir yerde seçmek, oyuncuyu
// koşuya başlamadan önce iki ekran arasında gezdirir. Aynı akışta olması doğru.

import { HEROES, heroById, type HeroDef } from '@/game/heroes';
import { weaponById } from '@/game/config';
import { Card, CardSection, DeltaBar, PATTERN_TEXT, Tag } from '@/components/ui/cards';
import { STAT_ICON } from '@/lib/icons';
import { C } from '@/lib/theme';

/**
 * Portre: kaynak kare 288×128 ve karakter ortada küçük duruyor. Kutuyu
 * `overflow:hidden` yapıp görseli ÖLÇÜLMÜŞ içerik kutusuna göre kaydırıp
 * büyütüyoruz — böylece her karakter kutuyu aynı şekilde dolduruyor.
 */
export function Portrait({ hero, size = 56, flip = false, frame = true }: {
  hero: HeroDef; size?: number;
  /** ⚠️ Yüz yüze duruş için: düelloda rakip SOLA bakmalı, yoksa ikisi de
   *  aynı yöne bakıp "karşı karşıya" hissi kaybolur. */
  flip?: boolean;
  /** çerçeve/zemin — büyük vitrin kullanımında kapatılıyor */
  frame?: boolean;
}) {
  const c = hero.crop;
  const scale = size / Math.max(c.w, c.h);
  return (
    <div style={{
      width: size, height: size, flexShrink: 0, overflow: 'hidden',
      position: 'relative', borderRadius: 6,
      background: frame ? 'rgba(0,0,0,0.35)' : 'transparent',
      border: frame ? `1px solid ${C.border}` : 'none',
      transform: flip ? 'scaleX(-1)' : undefined,
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

      <HeroCard hero={cur} />
    </div>
  );
}

/**
 * Seçilen karakterin tam künyesi.
 *
 * ⚠️ Eskiden burada "Starts with Rusted Sickle" yazıyordu ve bitiyordu.
 * Silahın ADI ne yaptığını söylemiyor: oyun testinde Water Priestess için
 * "bu hero ateş etmiyor" şikâyeti geldi — silahı yörüngeydi, gerçekten
 * hiçbir şey fırlatmıyordu. Artık deseni de, nasıl çalıştığı da yazıyor.
 */
function HeroCard({ hero }: { hero: HeroDef }) {
  const w = weaponById(hero.weapon);
  const pat = w ? PATTERN_TEXT[w.pattern] : undefined;
  // İstatistikleri çubuğa dökmek için — motorun okuduğu alanlarla aynı isimler
  const bars: { label: string; key: keyof HeroDef['stats'] }[] = [
    { label: 'Damage', key: 'might' },
    { label: 'Attack speed', key: 'cooldown' },
    { label: 'Move speed', key: 'moveSpeed' },
    { label: 'Max health', key: 'maxHp' },
    { label: 'Area', key: 'area' },
    { label: 'Recovery', key: 'recovery' },
    { label: 'Proj. speed', key: 'projSpeed' },
  ];

  return (
    <Card accent>
      <div style={{ display: 'flex', gap: 11, padding: '11px 12px' }}>
        <Portrait hero={hero} size={72} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: C.bone }}>{hero.name}</span>
            <span style={{ fontSize: 9.5, color: C.blood, fontWeight: 900, letterSpacing: 1.3 }}>
              {hero.title.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 3, lineHeight: 1.5 }}>{hero.blurb}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        {w && (
          <CardSection label="Starting weapon" tone={C.candle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.candle }}>{w.name}</span>
              {pat && <Tag tone="blood">{pat.label}</Tag>}
              <Tag>{w.damage} DMG</Tag>
              <Tag>{w.cooldownSec.toFixed(2)}s</Tag>
            </div>
            {/* ⚠️ ASIL BİLGİ BU SATIR — silahın nasıl çalıştığı */}
            {pat && (
              <div style={{ fontSize: 11, color: C.boneDim, marginTop: 5, lineHeight: 1.5 }}>{pat.how}</div>
            )}
          </CardSection>
        )}

        <CardSection label="Against the baseline">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {bars.map((b) => {
              const v = hero.stats[b.key];
              if (v === undefined || v === 0) return null;
              // ⚠️ `cooldown` TERS ÇALIŞIR: negatif değer daha HIZLI saldırı
              // demek. Ham sayıyı göstermek oyuncuya "eksi = kötü" dedirtirdi.
              const gosterilen = b.key === 'cooldown' ? -v : v;
              return <DeltaBar key={b.key} label={b.label} pct={gosterilen} icon={STAT_ICON[b.key]} />;
            })}
          </div>
        </CardSection>
      </div>
    </Card>
  );
}
