// BAŞARIMLAR — "yarın niye geleyim" sorusunun ilk yarısı.
//
// ⚠️ HER KOŞUL `Progress`TEN OKUNUR. Bu tek kural bütün tasarımı belirliyor:
// `Progress` sunucu-otoriteli (gold `settleRun`'dan, derinlik kırpılmış
// değerden, kozmetikler sunucunun attığı zardan). Yani başarımlar istemcinin
// bildirdiği hiçbir sayıya dayanmıyor ve sunucuda BİREBİR doğrulanabiliyor.
//
// "5 dakikada 500 kill yap" gibi koşullar bilerek YOK: tek kaynağı istemcinin
// iddiası olurdu ve başarım listesi yalan söylenebilir bir yüzeye dönerdi.
//
// ⚠️ ÖDÜL GOLD DEĞİL. Gold vermek musluğu büyütür ve Faz 2'de dengelenen
// oranı bozar (bkz. wager.ts'teki aynı karar). Ödüller toz ve SATIN
// ALINAMAYAN kozmetikler — ikisi de ekonomiye gold eklemez.

import type { Progress } from './progress';
import { rollableCosmetics } from './cosmetics';
import { STAGES } from './config';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** hedefe ulaşmak için gereken birim */
  goal: number;
  /** ⚠️ SAF ve yalnızca Progress okur — sunucu aynı fonksiyonu çalıştırır */
  read: (p: Progress) => number;
  /** ödül: toz */
  dust: number;
  /** ödül: satın alınamayan kozmetik (cosmetics.ts, source:'earned') */
  cosmetic?: string;
}

/** Bir bölümdeki en derin ödenmiş iniş — `paidDepth`'in döngüsüz hâli */
const deepest = (p: Progress) =>
  Object.values(p.depthPaid ?? {}).reduce((m, v) => Math.max(m, Number(v) || 0), 0);

const clearedCount = (p: Progress) =>
  STAGES.reduce((n, s) => n + (p.cleared[s.id] ? 1 : 0), 0);

const forgeLevels = (p: Progress) =>
  Object.values(p.upgrades ?? {}).reduce((n, v) => n + (Number(v) || 0), 0);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ── İLK ADIMLAR ───────────────────────────────────────────────────
  {
    id: 'a_first_road', name: 'First Road', desc: 'Clear your first stage.',
    goal: 1, read: clearedCount, dust: 20,
  },
  {
    id: 'a_first_step', name: 'One Step Down', desc: 'Clear depth 5 in any Descent.',
    goal: 5, read: deepest, dust: 30,
  },
  {
    id: 'a_forge_10', name: 'Sparks', desc: 'Buy 10 levels at the Forge.',
    goal: 10, read: forgeLevels, dust: 40,
  },

  // ── ORTA OYUN ─────────────────────────────────────────────────────
  {
    id: 'a_depth_20', name: 'Deepdrawn', desc: 'Clear depth 20.',
    goal: 20, read: deepest, dust: 90,
  },
  {
    id: 'a_relics_10', name: 'Collector', desc: 'Hold 10 different relics.',
    goal: 10, read: (p) => p.cosmetics.length, dust: 70,
  },
  {
    id: 'a_stone_5', name: 'Cairn Builder', desc: 'Raise the monument 5 stones.',
    goal: 5, read: (p) => p.ossuary, dust: 80,
  },
  {
    id: 'a_half_campaign', name: 'Halfway Buried', desc: 'Clear 5 stages.',
    goal: 5, read: clearedCount, dust: 120,
  },

  // ── GEÇ OYUN — KAZANILAN KOZMETİKLER ──────────────────────────────
  // ⚠️ Bunların ödülü ÇEKİLİŞTE OLMAYAN kozmetikler. Değerleri tam olarak
  // "satın alınamaz" olmalarından geliyor.
  {
    id: 'a_campaign', name: 'Every Road Walked', desc: 'Clear all ten stages.',
    goal: STAGES.length, read: clearedCount, dust: 200, cosmetic: 't_hollow',
  },
  {
    id: 'a_stone_20', name: 'Monument', desc: 'Raise the monument 20 stones.',
    goal: 20, read: (p) => p.ossuary, dust: 260, cosmetic: 'a_stone',
  },
  {
    id: 'a_depth_40', name: 'Who Counts the Stair', desc: 'Clear depth 40.',
    goal: 40, read: deepest, dust: 400, cosmetic: 't_stair',
  },
  {
    id: 'a_all_relics', name: 'Emptied the Reliquary',
    desc: 'Find every relic the reliquary holds.',
    // ⚠️ Hedef `rollableCosmetics()` — kazanılanlar sayıya girmezse oyuncu
    // asla tamamlayamaz (kendisi bu başarımın ödülü olan bir kozmetiği
    // beklerdi). Döngüsel bir hedef en sinsi tasarım hatalarındandır.
    goal: rollableCosmetics().length,
    read: (p) => p.cosmetics.filter((id) =>
      rollableCosmetics().some((c) => c.id === id)).length,
    dust: 600, cosmetic: 'p_relic',
  },
] as const;

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Bir başarımın durumu — arayüz bunu çizer */
export interface AchievementState {
  def: AchievementDef;
  progress: number;
  done: boolean;
  claimed: boolean;
  /** alınabilir mi (tamamlandı ama henüz alınmadı) */
  claimable: boolean;
}

export function achievementStates(p: Progress): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const progress = Math.max(0, def.read(p));
    const done = progress >= def.goal;
    const claimed = p.achievements.includes(def.id);
    return { def, progress: Math.min(progress, def.goal), done, claimed, claimable: done && !claimed };
  });
}
