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
}

/**
 * Havuz.
 *
 * ⚠️ HEDEFLER TEK OTURUMDA BİTECEK KADAR KÜÇÜK. Günlük görev, bugün
 * oynamayı ödüllendirmeli; iki gün süren bir görev "günlük" değildir ve
 * ertesi gün sıfırlandığında oyuncuyu kızdırır.
 */
export const QUEST_POOL: readonly QuestDef[] = [
  { id: 'q_run2', kind: 'run', goal: 2, dust: 25, text: 'Finish 2 runs' },
  { id: 'q_run4', kind: 'run', goal: 4, dust: 40, text: 'Finish 4 runs' },
  { id: 'q_depth10', kind: 'depth', goal: 10, dust: 25, text: 'Reach depth 10 in one descent' },
  { id: 'q_depth20', kind: 'depth', goal: 20, dust: 40, text: 'Reach depth 20 in one descent' },
  { id: 'q_depth30', kind: 'depth', goal: 30, dust: 55, text: 'Reach depth 30 in one descent' },
  { id: 'q_duel1', kind: 'duel', goal: 1, dust: 30, text: 'Answer a rival and win' },
  { id: 'q_duel2', kind: 'duel', goal: 2, dust: 50, text: 'Win 2 duels' },
  { id: 'q_arena1', kind: 'arena', goal: 1, dust: 40, text: 'Win a match in the Pit' },
  { id: 'q_spend2k', kind: 'spend', goal: 2000, dust: 25, text: 'Spend 2,000 gold' },
  { id: 'q_spend8k', kind: 'spend', goal: 8000, dust: 45, text: 'Spend 8,000 gold' },
  { id: 'q_salv3', kind: 'salvage', goal: 3, dust: 25, text: 'Salvage 3 pieces of gear' },
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
export function questsFor(wallet: string, day: string): QuestDef[] {
  const havuz = [...QUEST_POOL];
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
export function dayDustCeiling(wallet: string, day: string): number {
  return questsFor(wallet, day).reduce((s, q) => s + q.dust, 0) + QUESTS.allBonus;
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
