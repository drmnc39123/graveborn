// KAHRAMAN USTALIĞI — sunucu tarafı.
//
// ⚠️ AYRI BİR SÜTUN AÇILMADI ve bu bilinçli bir tercih. Ustalık zaten
// `Run` tablosunda YAZILI: her koşu `hero` ve sunucunun kabul ettiği
// `awardedDepth` ile duruyor. İkinci bir yere kopyalamak, iki gerçek
// kaynak demekti — biri güncellenip diğeri unutulduğunda oyuncu ekranda
// hak etmediği (ya da hak ettiği hâlde göremediği) bir kademe görürdü.
// Ayrıca kopya, bir migration ve her koşu kapanışında fazladan bir yazma
// getirirdi.
//
// ⚠️ MALİYET ÖLÇÜLDÜ ve sorgu SEYREK: yalnız koşu açılırken (zaten 4+
// sorgu var) ve kahraman kartı açılırken çalışıyor. `/progress` gibi sık
// çağrılan bir uca KONULMADI — orada her istekte bir groupBy demekti.
// `Run` tablosunda `@@index([wallet, startedAt])` var; cüzdana göre
// daraltma o indeksin önekini kullanıyor.

import { prisma } from './db.js';
import { USTALIK_MODLARI, ustalikBonusu, ustalikKademesi } from '@game/mastery';
import type { StatKey } from '@game/config';

/**
 * Cüzdanın kahraman başına EN DERİN noktası.
 *
 * ⚠️ `capped: false` ŞART. Kırpılmış koşu, sunucunun "bu iddia fiziksel
 * olarak imkânsız" dediği koşudur; onu ustalığa saymak, kırpmanın
 * anlamını ortadan kaldırırdı (leaderboard ve bahisteki kuralın aynısı).
 *
 * ⚠️ `claimedAt: { not: null }` — kapanmamış koşunun derinliği yoktur.
 */
export async function ustalikHaritasi(wallet: string): Promise<Record<string, number>> {
  const satirlar = await prisma.run.groupBy({
    by: ['hero'],
    where: {
      wallet,
      claimedAt: { not: null },
      capped: false,
      mode: { in: [...USTALIK_MODLARI] },
    },
    _max: { awardedDepth: true },
  });
  const out: Record<string, number> = {};
  for (const s of satirlar) out[s.hero] = s._max.awardedDepth ?? 0;
  return out;
}

/** Tek kahramanın ustalık bonusu — koşu açılırken bilete konur */
export async function ustalikBonusuOf(
  wallet: string, hero: string,
): Promise<Partial<Record<StatKey, number>>> {
  const harita = await ustalikHaritasi(wallet);
  return ustalikBonusu(hero, ustalikKademesi(harita[hero] ?? 0));
}
