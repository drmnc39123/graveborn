// GÜNLÜK GÖREVLER — "yarın niye geleyim" sorusunun cevabı.
//
// Sezon haftalık bir sebep verdi; bu günlük olanı. İkisi farklı ritim:
// sezon uzun tırmanışı ödüllendiriyor, görevler bugün oturup oynamayı.
//
// ⚠️ GÖREVLER SUNUCUDA TUTULMUYOR, TÜRETİLİYOR. Hangi üç görevin kime
// düştüğü `wallet + gün`den deterministik olarak çıkıyor — veritabanında
// "bugünün görevleri" diye bir satır yok. Sadece İLERLEME saklanıyor.
// Görev listesini de saklamak, her gece herkes için satır üretmek (cron!)
// ve o cron çalışmadığında görevsiz kalan oyuncular demekti.
//
// ⚠️ İLERLEME İSTEMCİDEN GELMEZ. Her görev, sunucunun ZATEN doğruladığı bir
// olaya bağlı (kapanan koşu, kabul edilen derinlik, kazanılan düello,
// harcanan gold). "Şu görevi bitirdim" diyen bir uç YOK.
//
// ⚠️ ÖDÜL GOLD DEĞİL — yedinci kez aynı kural. Günlük ve tekrarlanan bir
// musluk, gold ödediği anda ekonominin en büyük kaynağı olurdu.
//
// ⚠️ SAF VERİ — sunucu da bu dosyayı okuyor.

import { seedFromString } from './rng';

export const QUESTS = {
  /** günde kaç görev */
  perDay: 3,
  /** üçünü de bitirene ek toz */
  allBonus: 60,
} as const;

/**
 * Görevin bağlandığı olay.
 *
 * ⚠️ HEPSİ SUNUCUNUN GÖRDÜĞÜ ŞEYLER. "300 düşman öldür" gibi bir görev
 * cazip ama kill sayısı sunucuya hiç bildirilmiyor — istemciden istemek
 * zorunda kalırdık ve o an görev bir yalan beyanı olurdu.
 */
export type QuestKind =
  | 'run'        // koşu bitir (kırpılmamış)
  | 'depth'      // tek koşuda şu derinliğe in
  | 'duel'       // düello kazan
  | 'arena'      // arena maçı kazan
  | 'spend'      // gold harca
  | 'salvage';   // ekipman parçala

export interface QuestDef {
  id: string;
  kind: QuestKind;
  /** hedef miktar (depth'te "şu derinliğe in") */
  goal: number;
  dust: number;
  text: string;
  /**
   * Bu görevin AÇILMASI için daha önce ulaşılmış olması gereken derinlik.
   *
   * ⚠️ OLMADAN 1. GÜN BOZUKTU ve ölçüldü: sıfırdan bir oyuncuya
   * "derinlik 10'a in" ve "2.000 gold harca" düşüyordu — cüzdanında 0 gold
   * vardı ve tek bölüm temizlememişti. Üçünü de yapamaz, bonusa hiç
   * ulaşamaz ve paneli bir daha açmazdı.
   */
  minDepth?: number;
  /** en az bir bölüm temizlenmiş olmalı (PvP görevleri) */
  needsCleared?: boolean;
}

/** Oyuncunun görev havuzunu belirleyen durumu — SUNUCU doldurur */
export interface QuestProfile {
  /** bugüne kadar ulaşılmış en derin seviye */
  deepestDepth: number;
  /** en az bir bölüm temizlendi mi */
  cleared: boolean;
}

/**
 * Havuz.
 *
 * ⚠️ HEDEFLER TEK OTURUMDA BİTECEK KADAR KÜÇÜK. Günlük görev, bugün
 * oynamayı ödüllendirmeli; iki gün süren bir görev "günlük" değildir ve
 * ertesi gün sıfırlandığında oyuncuyu kızdırır.
 */
export const QUEST_POOL: readonly QuestDef[] = [
  // ── HERKESE AÇIK — 1. gün oyuncusu bunları YAPABİLİR ──
  { id: 'q_run1', kind: 'run', goal: 1, dust: 20, text: 'Finish a run' },
  { id: 'q_depth3', kind: 'depth', goal: 3, dust: 20, text: 'Reach depth 3 in one descent' },
  { id: 'q_spend300', kind: 'spend', goal: 300, dust: 20, text: 'Spend 300 gold' },

  { id: 'q_run2', kind: 'run', goal: 2, dust: 25, text: 'Finish 2 runs', minDepth: 5 },
  { id: 'q_run4', kind: 'run', goal: 4, dust: 40, text: 'Finish 4 runs', minDepth: 12 },
  { id: 'q_depth10', kind: 'depth', goal: 10, dust: 25, text: 'Reach depth 10 in one descent', minDepth: 10 },
  { id: 'q_depth20', kind: 'depth', goal: 20, dust: 40, text: 'Reach depth 20 in one descent', minDepth: 20 },
  { id: 'q_depth30', kind: 'depth', goal: 30, dust: 55, text: 'Reach depth 30 in one descent', minDepth: 30 },
  // ⚠️ PvP görevleri en az bir TEMİZLENMİŞ bölüm istiyor: düelloda rakibin
  // bölümünü temizlemiş olman şart (bkz. duelBlocker), yoksa görev
  // yapılamaz bir şey olurdu.
  { id: 'q_duel1', kind: 'duel', goal: 1, dust: 30, text: 'Answer a rival and win', needsCleared: true },
  { id: 'q_duel2', kind: 'duel', goal: 2, dust: 50, text: 'Win 2 duels', needsCleared: true, minDepth: 10 },
  { id: 'q_arena1', kind: 'arena', goal: 1, dust: 40, text: 'Win a match in the Pit', needsCleared: true },
  { id: 'q_spend2k', kind: 'spend', goal: 2000, dust: 25, text: 'Spend 2,000 gold', minDepth: 5 },
  { id: 'q_spend8k', kind: 'spend', goal: 8000, dust: 45, text: 'Spend 8,000 gold', minDepth: 15 },
  // ⚠️ Ekipman ancak Wilderness'tan çıkıyor; hiç parçası olmayan oyuncuya
  // "3 parça parçala" demek anlamsız.
  { id: 'q_salv3', kind: 'salvage', goal: 3, dust: 25, text: 'Salvage 3 pieces of gear', minDepth: 5 },
] as const;

export function questById(id: string): QuestDef | undefined {
  return QUEST_POOL.find((q) => q.id === id);
}

/**
 * Bugünün üç görevi — cüzdana ve güne göre DETERMİNİSTİK.
 *
 * ⚠️ AYNI TÜRDEN İKİ GÖREV DÜŞMEZ. "2 koşu bitir" ile "4 koşu bitir" aynı
 * gün gelirse ikincisi birincisini kendiliğinden tamamlar ve gün üç görev
 * değil iki buçuk görev olur.
 */
export function questsFor(wallet: string, day: string, p: QuestProfile): QuestDef[] {
  // ⚠️ HAVUZ ÖNCE SÜZÜLÜYOR — bkz. QuestDef.minDepth. Yapılamayacak bir
  // görev vermek, oyuncuya "bu panel bana göre değil" dedirtiyordu.
  const havuz = QUEST_POOL.filter((q) =>
    (q.minDepth === undefined || p.deepestDepth >= q.minDepth)
    && (!q.needsCleared || p.cleared));
  const out: QuestDef[] = [];
  const kullanilan = new Set<QuestKind>();
  // Deterministik karıştırma — `Math.random()` YASAK, sunucu aynı sonucu
  // üretmek zorunda.
  let h = seedFromString(`${wallet}|${day}`);
  const sonraki = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  for (let i = havuz.length - 1; i > 0; i--) {
    const j = Math.floor(sonraki() * (i + 1));
    [havuz[i], havuz[j]] = [havuz[j], havuz[i]];
  }
  for (const q of havuz) {
    if (out.length >= QUESTS.perDay) break;
    if (kullanilan.has(q.kind)) continue;
    kullanilan.add(q.kind);
    out.push(q);
  }
  return out;
}

/** Görev tamamlandı mı */
export function questDone(q: QuestDef, ilerleme: number): boolean {
  return ilerleme >= q.goal;
}

/** Günün toplam toz ödülü (üçü + bonus) — musluk ölçülebilir olmalı */
export function dayDustCeiling(ids: readonly string[]): number {
  return ids.reduce((s, id) => s + (questById(id)?.dust ?? 0), 0) + QUESTS.allBonus;
}

/**
 * `depth` görevleri EN İYİ TEK KOŞUYU sayar, toplamı değil.
 *
 * ⚠️ Toplasaydık "derinlik 30'a in" görevi, üç kez 10'a inerek tamamlanırdı —
 * oysa görev tek bir derin iniş istiyor. Diğer türlerde toplam doğru.
 */
export function questAccumulate(kind: QuestKind, mevcut: number, gelen: number): number {
  return kind === 'depth' ? Math.max(mevcut, gelen) : mevcut + gelen;
}
