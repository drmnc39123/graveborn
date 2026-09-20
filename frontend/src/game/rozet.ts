// RIHTIM ROZETLERİ — "şu an alınacak bir şeyin var" katmanı.
//
// 🔴 NİYE VAR (2026-09-20 denetimi): geri getiren sistemlerin hepsi yazılmış
// (günlük görev, streak, Forge) ama köyde hiçbiri kendini duyurmuyor.
// `BuildingDock.tsx` bunu zaten kabul ediyordu: *"Rozet/vurgu Faz 5 cilasında
// eklenecek."* Oyuncu, cebindeki gold'un iki Forge yükseltmesi ettiğini ya da
// bekleyen bir görev ödülü olduğunu ancak o paneli AÇARSA öğreniyordu.
//
// ⚠️ SAF FONKSİYON: ağ isteği yok, `Date.now()` yok (gün dışarıdan veriliyor).
// Mühür bu yüzden davranışı ölçebiliyor.
//
// ⚠️ YENİ İSTEK YOK: girdilerin hepsi köyde ZATEN ekranda olan veri —
// `Progress` yerel, `CardSummary` profil kartının 30 sn'lik paylaşılan
// isteğinden geliyor.
//
// ⚠️ ROZET = YAPILABİLİR İŞ. "Yeni içerik var" ya da "bak şuraya" demek için
// kullanılmıyor: oyuncu rozete gidip bir şey alamazsa rozet yalan söylemiş
// olur ve bir daha hiçbirine güvenmez.

import type { Progress } from './progress';
import { claimStreak } from './progress';
import { FORGE, costOf } from './forge';

/** Rozet kaynakları — hepsi köyde zaten var olan veri */
export interface RozetGirdi {
  progress: Progress | null;
  /** `/me/card` özeti (cüzdan modunda); demo'da null */
  ozet: { quests?: { claimable: number } | null } | null;
  /** bugünün UTC günü — `utcDay(new Date())` */
  gun: string;
}

/** Bina kimliği → rozet var mı */
export type Rozetler = Readonly<Record<string, boolean>>;

/**
 * Karşılanabilir bir Forge yükseltmesi var mı.
 *
 * ⚠️ EN UCUZ SIRADAKİ satır aranıyor, herhangi biri değil: tavana gelmiş bir
 * hat "satın alınabilir" görünmemeli.
 */
export function forgeAlinabilir(p: Progress): boolean {
  for (const u of FORGE) {
    // ⚠️ TAVAN KURALI BURADA TEKRARLANMIYOR: `costOf` seviye tavana
    // geldiğinde `Infinity` döndürüyor, yani kapalı hat kendiliğinden
    // "alınamaz" oluyor. İkinci bir `maxLevel` kontrolü yazmıştım; kuralın
    // iki yerde durması, birinin bir gün değişip diğerinin unutulması
    // demekti — mühür de onu ölçemiyordu (enjeksiyon kırmızı yanmadı).
    if (p.gold >= costOf(u, p.upgrades?.[u.id] ?? 0)) return true;
  }
  return false;
}

/** Giriş serisi bugün alınabilir mi */
export function streakAlinabilir(p: Progress, gun: string): boolean {
  return claimStreak(p, gun).error === null;
}

export function dockRozetleri(g: RozetGirdi): Rozetler {
  const p = g.progress;
  return {
    // TODAY — alınabilir görev ödülü (sunucu sayıyor)
    daily: (g.ozet?.quests?.claimable ?? 0) > 0,
    // TAVERN — giriş serisi ödülü bekliyor
    tavern: !!p && streakAlinabilir(p, g.gun),
    // FORGE — cebindeki gold bir yükseltmeye yetiyor
    upgrade: !!p && forgeAlinabilir(p),
  };
}

/** Grup çipi: üyelerinden birinde rozet varsa grup da işaretli */
export function grupRozeti(uyeler: readonly string[], r: Rozetler): boolean {
  return uyeler.some((id) => r[id]);
}
