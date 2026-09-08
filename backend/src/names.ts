// OYUNCU ADI ÇÖZÜCÜSÜ — sunucu tarafı, TOPLU.
//
// 🔴 NİYE VAR: oyuncu adı `Player` tablosunda, ama oyuncuyu BAŞKA bir
// oyuncuya gösteren satırların çoğu başka tablolardan geliyor —
// `BossDamage` (world boss katkısı), `Run` (takip listesi), `DuelRecord`
// (son düellolar), `Listing` (market). Her birinin sorgusuna `Player`
// birleştirmesi eklemek sekiz ayrı yerde sekiz ayrı karar demekti; biri
// unutulduğunda o ekran sessizce cüzdan göstermeye devam ederdi.
//
// ⚠️ TEK SORGU, N DEĞİL. Satır başına `findUnique` çağırmak 100 satırlık
// bir tabloda 100 sorgu açardı — bu depoda `nearestEnemyTo`nun ızgaraya
// 841 kez sorması tam bu hata sınıfıydı ve ölçülüp düzeltilmişti.
//
// ⚠️ ÖNBELLEK YOK, VE BU BİLİNÇLİ. Ad değişince bayat ad servis etmek,
// oyuncunun ödediği gold'un karşılığını görmemesi demek. Sorgu tek ve
// indeksli (`wallet` birincil anahtar); önbellek burada erken iyileştirme
// olurdu — ölçülmeden eklenen önbellek, ölçülmeden eklenen her şey gibi.

import { prisma } from './db.js';

/**
 * Verilen cüzdanların adlarını topluca çöz.
 *
 * @returns cüzdan → ad (adı olmayan oyuncu haritada YOK)
 */
export async function adlariCoz(
  wallets: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // ⚠️ Tekilleştirme: aynı cüzdan iki satırda geçebilir (düello listesinde
  // meydan okuyan ve savunan aynı kişi olabilir).
  const benzersiz = [...new Set(wallets.filter(Boolean))];
  if (benzersiz.length === 0) return out;

  const rows = await prisma.player.findMany({
    where: { wallet: { in: benzersiz } },
    select: { wallet: true, name: true },
  });
  for (const r of rows) if (r.name) out.set(r.wallet, r.name);
  return out;
}

/**
 * Satır listesine ad ekle — çağıranın tek satırlık işi.
 *
 * ⚠️ `null` DÖNÜYOR, `undefined` DEĞİL: istemcideki `oyuncuAdi()` "ad yok"
 * ile "alan gelmedi"yi ayırt etmek zorunda kalmasın.
 */
export async function adlariEkle<T extends Record<string, unknown>>(
  rows: T[],
  cuzdanAlani: keyof T,
): Promise<(T & { name: string | null })[]> {
  const harita = await adlariCoz(rows.map((r) => String(r[cuzdanAlani] ?? '')));
  return rows.map((r) => ({
    ...r,
    name: harita.get(String(r[cuzdanAlani] ?? '')) ?? null,
  }));
}
