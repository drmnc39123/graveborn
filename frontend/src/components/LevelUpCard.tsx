'use client';
// LEVEL-UP KARTI — koşunun en önemli kararı.
//
// NİYE VAR: eski hâli düz bir butondu. Slot çerçevesinin içinde silah resmi
// değil "1/2/3" rakamı duruyordu; veri modelinde `icon` alanı BİLE YOKTU.
// Oyuncu her seviyede körlemesine seçiyordu: ne kazandığını, silahın nasıl
// ateş ettiğini, evrime yaklaşıp yaklaşmadığını hiçbir yerde göremiyordu.
//
// ⚠️ Tüm stiller INLINE · MOR YOK · oyuncu metinleri İngilizce.

import { EVOLUTIONS, PASSIVES, WEAPONS, EVOLVED, weaponById,
  weaponCooldownAt, weaponCountAt, weaponDamageAt } from '@/game/config';
import { passiveIcon, weaponArt } from '@/game/combatArt';
import { Card, PATTERN_TEXT, Tag } from '@/components/ui/cards';
import { Slot } from '@/components/ui/kit';
import { C, FONT } from '@/lib/theme';

export interface OfferView {
  id: string; name: string; desc: string; kind: string; level?: number;
}

/** 16×16 pixel ikon — bulanıklaşmamalı */
function Icon({ src, size = 26 }: { src: string; size?: number }) {
  return (
    <img src={src} alt="" width={size} height={size}
      style={{ imageRendering: 'pixelated', display: 'block' }} />
  );
}

/**
 * Bu seçim evrime yaklaştırıyor mu?
 * ⚠️ Oyuncunun bilmesi gereken en değerli bilgi bu: evrim silah MAX + pasif
 * MAX + boss sandığı istiyor. Nerede olduğunu göstermezsek oyuncu tesadüfen
 * bulmayı bekliyoruz demektir.
 */
function evolutionHint(id: string, kind: string, level: number | undefined,
  weapons: { id: string; level: number }[], passives: { id: string; level: number }[]) {
  if (!kind.startsWith('weapon')) return null;
  const evo = EVOLUTIONS.find((e) => e.weapon === id);
  if (!evo) return null;

  const def = weaponById(id);
  const gerekenPasif = PASSIVES.find((p) => p.id === evo.passive);
  const sahipPasif = passives.find((p) => p.id === evo.passive);
  const evolvedDef = EVOLVED.find((w) => w.id === evo.to);
  if (!def || !gerekenPasif || !evolvedDef) return null;

  const silahMax = (level ?? 0) + 1 >= def.maxLevel;   // bu seçimden SONRA
  const pasifMax = (sahipPasif?.level ?? 0) >= gerekenPasif.maxLevel;

  if (silahMax && pasifMax) {
    return { tone: 'blood' as const, text: `EVOLUTION READY · ${evolvedDef.name}` };
  }
  if (silahMax) {
    return { tone: 'dim' as const, text: `Needs ${gerekenPasif.name} (${sahipPasif?.level ?? 0}/${gerekenPasif.maxLevel})` };
  }
  return { tone: 'dim' as const, text: `Evolves into ${evolvedDef.name} at max` };
}

export function LevelUpCard({ offer, index, onPick, weapons, passives }: {
  offer: OfferView;
  index: number;
  onPick: (id: string) => void;
  weapons: { id: string; level: number }[];
  passives: { id: string; level: number }[];
}) {
  const silah = offer.kind.startsWith('weapon');
  const yeni = offer.kind.endsWith('new');
  const def = silah ? weaponById(offer.id) : undefined;
  const pat = def ? PATTERN_TEXT[def.pattern] : undefined;
  const icon = silah ? weaponArt(offer.id).icon : passiveIcon(offer.id);

  const lv = offer.level ?? 0;
  const sonraki = lv + 1;

  // "Lv 3 → 4 ne kazandırır" — saf fonksiyonlar config.ts'te, motorla AYNI
  const deltas: { label: string; text: string }[] = [];
  if (def && !yeni) {
    const d0 = weaponDamageAt(def, lv), d1 = weaponDamageAt(def, sonraki);
    if (d1 > d0) deltas.push({ label: 'DAMAGE', text: `+${Math.round(((d1 / d0) - 1) * 100)}%` });
    const c0 = weaponCooldownAt(def, lv), c1 = weaponCooldownAt(def, sonraki);
    if (c1 < c0) deltas.push({ label: 'ATTACK SPEED', text: `+${Math.round(((c0 / c1) - 1) * 100)}%` });
    const n0 = weaponCountAt(def, lv), n1 = weaponCountAt(def, sonraki);
    if (n1 > n0) deltas.push({ label: 'PROJECTILES', text: `+${n1 - n0}` });
  }

  const evo = evolutionHint(offer.id, offer.kind, offer.level, weapons, passives);

  return (
    <Card accent={silah && yeni} onClick={() => onPick(offer.id)}
      style={{ cursor: 'pointer', width: '100%' }}>
      <div style={{ display: 'flex', gap: 11, padding: '11px 12px', alignItems: 'flex-start' }}>
        {/* Slot çerçevesi + GERÇEK ikon (eskiden içinde tuş numarası vardı) */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Slot type={silah ? 'Weapon' : 'Ring'} variant="02" scale={2}>
            <Icon src={icon} />
          </Slot>
          {/* Tuş ipucu köşeye taşındı — ikonun yerini işgal etmesin */}
          <span style={{
            position: 'absolute', right: -4, bottom: -4,
            width: 16, height: 16, borderRadius: 4,
            display: 'grid', placeItems: 'center',
            fontSize: 9.5, fontWeight: 900, fontFamily: FONT.ui,
            color: C.void, background: C.candle,
          }}>{index + 1}</span>
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, fontSize: 14.5, color: C.bone }}>{offer.name}</span>
            {yeni
              ? <Tag tone={silah ? 'gold' : 'ok'}>NEW</Tag>
              : <Tag tone="dim">LV {lv} → {sonraki}</Tag>}
            {pat && <Tag tone="dim">{pat.label}</Tag>}
          </div>

          {/* ⚠️ Silahın ADI ne yaptığını söylemiyor — deseni söylüyor.
              "bu hero ateş etmiyor" şikâyeti tam bu bilgi eksikliğindendi. */}
          <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 3, lineHeight: 1.45 }}>
            {yeni && pat ? pat.how : offer.desc}
          </div>

          {deltas.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
              {deltas.map((d) => (
                <Tag key={d.label} tone="ok">{d.label} {d.text}</Tag>
              ))}
            </div>
          )}

          {evo && (
            <div style={{ marginTop: 7 }}>
              <Tag tone={evo.tone}>{evo.text}</Tag>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
