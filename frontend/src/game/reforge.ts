// YENİDEN DÖVME — ekipmana yatırım yapılan yer.
//
// NİYE VAR: ekipman DÜŞÜYOR ve PARÇALANIYOR ama YÜKSELTİLMİYORDU. Elindeki
// iyi bir parçaya yatırım yapacağın hiçbir yer yoktu; parça ya yeterince
// iyiydi ya çöptü. AFK Heroes'un 45 günlük tablosunda 152.529 "enhancement"
// var ve bu tesadüf değil: eşyaya yatırım, gold'un en doğal sonsuz gideri.
//
// ⚠️ AYNI TABLODAN ÖĞRENİLEN İKİNCİ ŞEY: 5.637.424 parçalama / 43.076 satış
// = 131 kat. Eşyanın gerçek gideri market değil, oyuncunun kendi elindeki
// döngü. O yüzden bu sistem markete DEĞİL, çantaya bağlı.
//
// ══════════════════════════════════════════════════════════════════════
// ⚠️ GÜÇ TAVANI BÜYÜMÜYOR — sistemin tamamı bunun üstüne kurulu.
// ══════════════════════════════════════════════════════════════════════
// `MAX_GEAR_BUDGET` = 5 yuva × en yüksek kademe bütçesi. Yükseltme yalnızca
// KADEME atlatıyor ve tavanı 5. kademe. Yani yükseltme tavana YAKLAŞTIRIYOR,
// tavanı YÜKSELTMİYOR — kapalı tavan garantisi bit bit korunuyor.
// Bütçeyi doğrudan çarpan bir "+1 seviye" tasarımı cazipti ve ekipmanı
// ikinci bir Forge'a çevirirdi (bkz. gear.ts başlığı).
//
// ⚠️ YÜKSELTMEK LANET DE GETİRİR. 3. kademeden itibaren her parçanın laneti
// var; Kept→Marked geçişi bir lanet, Cursed→Graveborn ikinci laneti ekliyor.
// Yani yükseltme bedava bir iyileşme değil, DAHA BÜYÜK BİR TAKAS. Laneti
// atlayan bir yükseltme, ekipman tasarımının kalbini söker.
//
// ⚠️ YENİDEN DİZME LANETLERİ DE ATAR (bkz. gear.rollAffixes). Sadece
// bonusları atsaydı oyuncu lanetsiz parçaya ulaşana kadar döndürürdü.

import { RARITIES, rarityOf } from './gear';

export const REFORGE = {
  /**
   * KADEME YÜKSELTME maliyetleri — hedef kademeye göre.
   *
   * ⚠️ Sayılar ÖLÇÜLMÜŞ ekonomiye oturtuldu: tekrar koşusu geliri
   * 6.031 gold/saat (hours.test.mts). Bir parçayı Worn'dan Graveborn'a
   * çıkarmak 44.000 gold ≈ 7,3 saat saf farm. Bu kasıtlı olarak AĞIR:
   * "bu parça benim olsun" bir karar olmalı, bir alışkanlık değil.
   *
   * ⚠️ Doğal düşüşten UCUZ OLMAMALI. Ucuz olsaydı düşüş sistemi anlamını
   * yitirir, herkes en ucuz parçayı alıp yükseltirdi.
   */
  promote: [0, 600, 2_400, 9_000, 32_000] as const,

  /**
   * YENİDEN DİZME maliyeti — kademeye göre, SABİT.
   *
   * ⚠️ Parça başına ARTAN bir maliyet denenmedi ve denenmemeli: artan
   * maliyet sink'i kendi kendini sınırlar hâle getirir (oyuncu 5. denemeden
   * sonra bırakır). Sabit ama hissedilir bir fiyat, sonsuz bir gider kanalı
   * açıyor — bu sistemin asıl işi o.
   *
   * 5. kademede 1.800 gold ≈ 18 dakika oyun. Kovalanabilir ama bedava değil.
   */
  reroll: [0, 90, 220, 550, 1_100, 1_800] as const,
} as const;

/** `tier` kademesinden BİR ÜSTE çıkmanın maliyeti; en üstteyse `null` */
export function promoteCost(tier: number): number | null {
  const t = Math.floor(tier);
  if (!Number.isFinite(t) || t < 1) return null;
  // ⚠️ Tavan RARITIES tablosundan TÜRÜYOR, elle yazılmıyor: yeni bir kademe
  // eklenirse yükseltme kendiliğinden oraya kadar çalışır.
  if (t >= RARITIES.length) return null;
  return REFORGE.promote[t] ?? null;
}

/** Bu kademedeki bir parçayı yeniden dizmenin maliyeti */
export function rerollCost(tier: number): number {
  const t = Math.max(1, Math.min(RARITIES.length, Math.floor(tier) || 1));
  return REFORGE.reroll[t] ?? REFORGE.reroll[REFORGE.reroll.length - 1];
}

/** Yükseltilebilir mi (en üst kademede değil mi) */
export function canPromote(tier: number): boolean {
  return promoteCost(tier) !== null;
}

/**
 * Yükseltme sonrası ne olacağının ÖNİZLEMESİ — arayüz bunu gösterir.
 *
 * ⚠️ Lanet sayısındaki artış AÇIKÇA söylenmeli. Oyuncu 32.000 gold
 * harcamadan önce "bu işlem sana ikinci bir lanet getirecek" cümlesini
 * görmeli; sonradan öğrenmek, geri alınamayan bir harcamada en kötü sürpriz.
 */
export function promotePreview(tier: number): {
  from: string; to: string; cost: number;
  boonsFrom: number; boonsTo: number;
  banesFrom: number; banesTo: number;
} | null {
  const cost = promoteCost(tier);
  if (cost === null) return null;
  const a = rarityOf(tier);
  const b = rarityOf(tier + 1);
  return {
    from: a.name, to: b.name, cost,
    boonsFrom: a.boons, boonsTo: b.boons,
    banesFrom: a.banes, banesTo: b.banes,
  };
}

/**
 * Bir parçayı Worn'dan en üst kademeye çıkarmanın TOPLAM maliyeti.
 * Ekonomi ölçümü bu sayıyı kullanıyor — elle toplanmasın.
 */
export const FULL_PROMOTE_COST: number =
  REFORGE.promote.reduce<number>((s, v) => s + v, 0);
