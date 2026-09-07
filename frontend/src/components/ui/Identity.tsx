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
import { ossuaryTier } from '@/game/ossuary';
import type { Progress } from '@/game/progress';
import { pixel } from '@/components/ui/kit';
import { C } from '@/lib/theme';

export interface Identity {
  /** görünen ad — cüzdan kısaltması ya da "You" */
  name: string;
  title?: string;
  plate?: string;
  trophy?: string;
  /**
   * ⚠️ ANIT SEVİYESİ — rütbe ADI burada türetilir (`ossuaryTier`), sunucudan
   * metin olarak gelmez: aynı kuralın iki yerde yazılması bu depoda defalarca
   * ayrışmayla sonuçlandı.
   *
   * 0 ise HİÇ ÇİZİLMEZ. `ossuaryTier(0)` "Unmarked Grave" döner ve her satıra
   * basılsaydı tabloyu anlamsız bir tekrarla doldururdu; rütbenin işi
   * ayırt etmek.
   */
  ossuary?: number;
}

/** Progress'ten kimlik çıkar — kendi kaydın için */
export function identityOf(p: Progress, name: string): Identity {
  return {
    name,
    title: p.equipped.title,
    plate: p.equipped.plate,
    trophy: p.equipped.trophy,
    ossuary: p.ossuary,
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
        {/* ⚠️ ANIT RÜTBESİ — Ossuary'nin SATTIĞI TEK ŞEY BU ve uzun süre
            hiçbir yerde görünmüyordu (ölçüldü 2026-09-07: leaderboard satırı
            seviyeyi taşımıyordu bile). Sonsuz gold sinkinin karşılığı
            başkalarının gördüğü bir rütbe; görünmediği sürece sink ölür. */}
        {!!id.ossuary && id.ossuary > 0 && (
          <span
            title={`Monument level ${id.ossuary}`}
            style={{
              fontSize: compact ? 8.5 : 9.5, fontWeight: 900, letterSpacing: 1,
              color: C.ice, border: `1px solid ${C.ice}44`, background: `${C.ice}12`,
              padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >{ossuaryTier(id.ossuary).toUpperCase()}</span>
        )}
      </span>
    </>
  );
}
