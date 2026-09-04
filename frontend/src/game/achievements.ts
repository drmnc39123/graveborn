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

// ── 2026-09-04'te eklenen okuyucular ──────────────────────────────────
// ⚠️ HEPSİ SAF ve YALNIZCA Progress okuyor — dosya başlığındaki kural.
// Özellikle `kills`: pet bağlama zaten onu kullanıyor, yani sunucu
// tarafında doğrulanmış bir sayaç. İstemcinin bildirdiği bir "bu koşuda
// 500 öldürdüm" değeri olsaydı liste yalan söylenebilir bir yüzeye
// dönerdi.
const totalKills = (p: Progress) =>
  Object.values(p.kills ?? {}).reduce((n, v) => n + (Number(v) || 0), 0);

const petCount = (p: Progress) =>
  Object.values(p.pets ?? {}).filter((v) => (Number(v) || 0) > 0).length;

const bestPetLevel = (p: Progress) =>
  Object.values(p.petLevels ?? {}).reduce((m, v) => Math.max(m, Number(v) || 0), 0);

const fusedCount = (p: Progress) => (p.petFused ?? []).length;

const streakDays = (p: Progress) => Math.max(0, Number(p.streak?.days) || 0);

/**
 * Derinlik 10'u GEÇİLMİŞ farklı bölüm sayısı.
 *
 * ⚠️ NİYE VAR: diğer bütün derinlik başarımları TEK bir hattı ödüllendiriyor
 * ve oyuncuyu en kârlı merdivende kalmaya itiyor. Bu, ENİNE oynamayı
 * ödüllendiren tek koşul — "bir bölümde çok derine" değil, "beş ayrı
 * bölümde makul derine".
 */
const ladders = (p: Progress) =>
  Object.values(p.depthPaid ?? {}).filter((v) => (Number(v) || 0) >= 10).length;

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
    // ⚠️ METİN SAYIDAN TÜRETİLİYOR. Sabit "ten stages" yazıyordu ve
    // kampanya 10'dan 23 bölüme çıktığında sessizce YALAN oldu: hedef
    // `STAGES.length` ile büyümüştü, cümle büyümemişti.
    id: 'a_campaign', name: 'Every Road Walked',
    desc: `Clear all ${STAGES.length} stages.`,
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

  // ══════════════════════════════════════════════════════════════════
  // 2026-09-04 — LİSTE 11'DEN 29'A ÇIKARILDI
  //
  // ⚠️ NİYE: 11 başarım, 23 bölümlük bir oyun için inceydi ve hepsi ÜÇ
  // sisteme bakıyordu (bölüm · derinlik · kozmetik). Pet bağlama, günlük
  // seri, öldürme sayaçları ve Forge'un geç kademeleri hiç ödüllenmiyordu
  // — yani oyuncunun saatlerini geçirdiği yerlerin çoğu bu listede
  // GÖRÜNMÜYORDU.
  //
  // ⚠️ Ödül yine GOLD DEĞİL: toz + satın alınamaz kozmetik. Faz 2'de
  // dengelenen musluk/sink oranına tek birim eklenmiyor.
  // ══════════════════════════════════════════════════════════════════

  // ── ERKEN ──
  {
    id: 'a_depth_10', name: 'Down Past the Roots', desc: 'Clear depth 10.',
    goal: 10, read: deepest, dust: 50,
  },
  {
    id: 'a_kills_1k', name: 'A Thousand Quiet Ones', desc: 'Put down 1,000 enemies.',
    goal: 1000, read: totalKills, dust: 60,
  },
  {
    id: 'a_pet_first', name: 'Something Followed You Home',
    desc: 'Bind your first companion.',
    goal: 1, read: petCount, dust: 40,
  },
  {
    id: 'a_streak_7', name: 'Seven Nights', desc: 'Keep a 7-day streak.',
    goal: 7, read: streakDays, dust: 100,
  },

  // ── ORTA ──
  {
    id: 'a_stages_10', name: 'Ten Roads', desc: 'Clear 10 stages.',
    goal: 10, read: clearedCount, dust: 150,
  },
  {
    id: 'a_forge_40', name: 'Hammerfall', desc: 'Buy 40 levels at the Forge.',
    goal: 40, read: forgeLevels, dust: 150,
  },
  {
    id: 'a_pet_3', name: 'The Binding Holds', desc: 'Bind 3 different companions.',
    goal: 3, read: petCount, dust: 110,
  },
  {
    id: 'a_pet_lv10', name: 'Well Fed', desc: 'Raise a companion to level 10.',
    goal: 10, read: bestPetLevel, dust: 130,
  },
  {
    id: 'a_kills_10k', name: 'Ten Thousand', desc: 'Put down 10,000 enemies.',
    goal: 10_000, read: totalKills, dust: 180,
  },
  {
    id: 'a_ladders_5', name: 'Five Stairs',
    desc: 'Reach depth 10 on 5 different stages.',
    goal: 5, read: ladders, dust: 200,
  },
  {
    id: 'a_relics_25', name: 'Curator', desc: 'Hold 25 different relics.',
    goal: 25, read: (p) => p.cosmetics.length, dust: 200,
  },
  {
    id: 'a_stages_15', name: 'The Long Walk', desc: 'Clear 15 stages.',
    goal: 15, read: clearedCount, dust: 220,
  },

  // ── GEÇ — KAZANILAN KOZMETİKLER ──
  {
    id: 'a_pet_fused', name: 'Made Mythic', desc: 'Fuse a companion into its mythic form.',
    goal: 1, read: fusedCount, dust: 300, cosmetic: 't_binder',
  },
  {
    id: 'a_forge_100', name: 'The Forge Answers', desc: 'Buy 100 levels at the Forge.',
    goal: 100, read: forgeLevels, dust: 320, cosmetic: 'a_forge',
  },
  {
    id: 'a_streak_30', name: 'Thirty Nights', desc: 'Keep a 30-day streak.',
    goal: 30, read: streakDays, dust: 350, cosmetic: 't_keeper',
  },
  {
    id: 'a_kills_50k', name: 'Gravemaker', desc: 'Put down 50,000 enemies.',
    goal: 50_000, read: totalKills, dust: 400,
  },
  {
    id: 'a_stone_50', name: 'Cairn of Cairns', desc: 'Raise the monument 50 stones.',
    goal: 50, read: (p) => p.ossuary, dust: 500,
  },
  {
    id: 'a_depth_60', name: 'Where the Stair Ends', desc: 'Clear depth 60.',
    goal: 60, read: deepest, dust: 550, cosmetic: 'p_deep',
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
