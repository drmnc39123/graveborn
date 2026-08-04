'use client';
// OYUNCU KİMLİĞİ — Reliquary'den takılan kozmetiklerin GÖRÜNDÜĞÜ yer.
//
// ⚠️ BU DOSYA OLMADAN RELIQUARY BİR YALAN OLURDU. Projenin kuralı açık:
// çalışmayan bir şeyi satmak oyuncuyu kandırmaktır. Kozmetikler sadece kendi
// panelinde görünseydi, oyuncu 450 gold'u hiç kimsenin görmeyeceği bir şeye
// vermiş olurdu. Prestij, GÖRÜLDÜĞÜ yerde değer kazanır — bu yüzden hem
// kendi kaydında hem leaderboard satırında aynı bileşen çiziliyor.
//
// ⚠️ Sprite'lar CSS `steps()` ile oynatılıyor (Reliquary panelindeki gerekçe:
// leaderboard'da 100 satır olabilir, her biri için rAF döngüsü kurulamaz).

import { cosmeticById } from '@/game/cosmetics';
import type { Progress } from '@/game/progress';
import { pixel } from '@/components/ui/kit';
import { C } from '@/lib/theme';

export interface Identity {
  /** görünen ad — cüzdan kısaltması ya da "You" */
  name: string;
  title?: string;
  plate?: string;
  trophy?: string;
}

/** Progress'ten kimlik çıkar — kendi kaydın için */
export function identityOf(p: Progress, name: string): Identity {
  return {
    name,
    title: p.equipped.title,
    plate: p.equipped.plate,
    trophy: p.equipped.trophy,
  };
}

/** Takılı kupanın 32×N şeridi — animasyonlu, küçük */
export function TrophyMark({ id, size = 22 }: { id?: string; size?: number }) {
  const def = id ? cosmeticById(id) : undefined;
  if (!def?.trophy) return null;
  return (
    <span
      title={def.name}
      style={{
        display: 'inline-block', flexShrink: 0,
        width: size, height: size,
        backgroundImage: `url(${def.trophy.src})`,
        backgroundSize: `${def.trophy.frames * 100}% 100%`,
        backgroundRepeat: 'no-repeat',
        animation: `gb-strip ${(def.trophy.frames / 8).toFixed(2)}s steps(${def.trophy.frames}) infinite`,
        ...pixel,
      }}
    />
  );
}

/**
 * İsim + levha + unvan + kupa, tek satırda.
 *
 * `compact` leaderboard satırı için: unvan isimle aynı satırda, küçük punto.
 * Genişte (profil başlığı) unvan alt satıra düşer ve nefes alır.
 */
export function IdentityLine({ id, compact = false, size = 14 }: {
  id: Identity;
  compact?: boolean;
  size?: number;
}) {
  const plate = id.plate ? cosmeticById(id.plate) : undefined;
  const title = id.title ? cosmeticById(id.title) : undefined;

  // Levha takılıysa isim gradyanla yazılır; yoksa düz kemik rengi.
  const nameStyle = plate?.plate
    ? {
        background: `linear-gradient(90deg, ${plate.plate.from}, ${plate.plate.to})`,
        WebkitBackgroundClip: 'text' as const,
        backgroundClip: 'text' as const,
        color: 'transparent',
      }
    : { color: C.bone };

  return (
    <>
      {/* ⚠️ Keyframe BURADA tanımlı olmalı — bu bileşen Reliquary panelinden
          bağımsız kullanılıyor (Tavern, leaderboard) ve oranın <style>'ına
          güvenmek kupaları sessizce donuk bırakırdı. Aynı ada sahip iki
          tanım zararsız. */}
      <style>{`@keyframes gb-strip { from { background-position-x: 0%; } to { background-position-x: 100%; } }`}</style>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        minWidth: 0, flexWrap: compact ? 'nowrap' : 'wrap',
      }}>
        <TrophyMark id={id.trophy} size={compact ? 18 : 24} />
        <span style={{
          fontSize: size, fontWeight: 900, letterSpacing: 0.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          ...nameStyle,
        }}>{id.name}</span>
        {title && (
          <span style={{
            fontSize: compact ? 10 : 11.5, fontStyle: 'italic',
            color: C.boneFaint, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title.name}</span>
        )}
      </span>
    </>
  );
}
