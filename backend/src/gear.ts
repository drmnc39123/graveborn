// THE WILDERNESS + EKİPMAN — sunucu tarafı.
//
// Tasarım ve sayılar `@game/gear`'de. Burada üç iş var: DÜŞÜŞÜ SUNUCUNUN
// ÜRETMESİ, çantanın tutulması ve yarış koruması.
//
// ⚠️ WILDERNESS MOTORU DESCENT OLARAK ÇALIŞTIRIR. Motora yeni bir mod
// eklemedik: `RunMode` hâlâ 'campaign' | 'descent' ve `engine.ts`'te tek
// satır değişmedi — yani determinizm mührü (`SIM_SEAL`) bozulmadı. Wilderness
// farkı tamamen motorun DIŞINDA: koşu kaydının modu, sunucunun ne ödediği ve
// arayüz. Bu, özelliğin en ucuz ve en az riskli dikişi.
//
// ⚠️ WILDERNESS GOLD ÖDEMEZ. Tek kuruş bile. Ekipman ödüyor, ekipman da
// parçalanınca TOZ veriyor (kozmetik parası). Böylece koşu tekrarlanabilir
// olduğu hâlde musluğa hiç dokunmuyor: sonsuz tekrar edilebilen bir gold
// kaynağı, bu ekonominin kaldıramayacağı tek şey.
//
// ⚠️ ÖDÜLÜN "HAYATTA KALDIM" KISMI DOĞRULANAMAZ ve bunu saklamıyoruz.
// Sunucu koşuyu yeniden simüle etmiyor (DoS yüzeyi), yani "öldüm mü, çıktım
// mı" istemcinin sözü. Zararı YAPISAL OLARAK SINIRLI: yalancı, dürüst bir
// oyuncunun başarıyla çıktığında alacağından FAZLA parça alamıyor — parça
// sayısı derinliğe bağlı ve derinlik zaten süre tabanına kırpılıyor. Yani
// hile riski kaldırıyor, ekonomiye fazladan parça SOKMUYOR.

import { GEAR, GEAR_SLOTS, gearBonus, rarityOf, rollRunGear, type GearItem, type GearSlot } from '@game/gear';
import type { StatKey } from '@game/config';
import { prisma } from './db.js';

export class GearError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

const SLOT_SET = new Set<string>(GEAR_SLOTS);

/** DB satırını oyun nesnesine çevir */
function toItem(row: {
  id: string; slot: string; rarity: number; affixes: unknown; depth: number;
}): GearItem {
  return {
    id: row.id,
    slot: row.slot as GearSlot,
    rarity: row.rarity,
    affixes: (row.affixes as GearItem['affixes']) ?? [],
    depth: row.depth,
  };
}

export interface GearView {
  items: (GearItem & { equipped: boolean })[];
  /** yuva → takılı parçanın id'si */
  equipped: Partial<Record<GearSlot, string>>;
  vaultSize: number;
}

export async function listGear(wallet: string): Promise<GearView> {
  const rows = await prisma.gearItem.findMany({
    where: { wallet },
    orderBy: [{ equipped: 'desc' }, { rarity: 'desc' }, { foundAt: 'desc' }],
    take: GEAR.vaultSize + 8,   // tavanı aşan artıklar da görünsün ki parçalanabilsin
  });
  const equipped: Partial<Record<GearSlot, string>> = {};
  for (const r of rows) if (r.equipped) equipped[r.slot as GearSlot] = r.id;
  return {
    items: rows.map((r) => ({ ...toItem(r), equipped: r.equipped })),
    equipped,
    vaultSize: GEAR.vaultSize,
  };
}

/**
 * Takılı parçaların motora gidecek bonusu.
 *
 * ⚠️ `/run/start` BUNU ÇAĞIRIR — istemci kendi ekipman bonusunu BEYAN ETMEZ.
 * Lonca perkindeki kuralın aynısı: bir bonusun kaynağı hiçbir zaman istemci
 * olmamalı. (Ödül güvenliği buna dayanmıyor, o yapısal tavanlarda; ama kural
 * sızıntı bırakmasın.)
 */
export async function equippedBonus(wallet: string): Promise<Partial<Record<StatKey, number>>> {
  const rows = await prisma.gearItem.findMany({
    where: { wallet, equipped: true },
    take: GEAR_SLOTS.length,
  });
  return gearBonus(rows.map(toItem));
}

/**
 * Koşunun ekipman düşüşünü ÜRET VE VER.
 *
 * ⚠️ `acceptedDepth` SUNUCUNUN KABUL ETTİĞİ derinlik olmalı, istemcinin
 * iddiası değil. Kırpılmış bir koşuya ekipman ödemek, kırpmanın anlamını
 * ortadan kaldırırdı — gold tarafındaki kuralın aynısı.
 *
 * ⚠️ PARÇA ID'Sİ DETERMİNİSTİK ve CÜZDANLA ÖNEKLİ: `wallet:seed-depth-index`.
 *
 * Determinizm, `createMany` + `skipDuplicates` ile grant'i fiilen idempotent
 * yapıyor — aynı koşu bir şekilde iki kez kapanırsa ikincisi sıfır satır
 * yazar (`run.claimedAt` birinci kilit, bu ikincisi).
 *
 * ⚠️ CÜZDAN ÖNEKİ SONRADAN EKLENDİ ve şart. Önce sadece `seed-depth-index`
 * yazıyordu; `id` GLOBAL birincil anahtar olduğu için AYNI seed'i alan iki
 * oyuncunun parçaları çakışıyor ve ikincisininki `skipDuplicates` tarafından
 * SESSİZCE yutuluyordu. Testte ölçüldü: fonksiyon "8 parça verdim" dedi,
 * veritabanına 0 satır yazıldı. Üretimde seed rastgele olduğu için nadir ama
 * imkânsız değil — ve sessiz olduğu için asla şikâyet gelmezdi.
 */
export async function grantRunGear(
  wallet: string, seed: number, acceptedDepth: number,
): Promise<{ items: GearItem[]; dropped: number }> {
  const rolled = rollRunGear(seed, acceptedDepth);
  if (rolled.length === 0) return { items: [], dropped: 0 };

  // ⚠️ ÇANTA TAVANI. Dolu çantaya sessizce eklemek tavanı anlamsız kılardı;
  // reddetmek de koşuyu boşa çıkarırdı. Sığan kadarını veriyoruz ve KAÇ
  // TANESİNİN düştüğünü söylüyoruz — parçalama kararı oyuncunun olsun.
  const mevcut = await prisma.gearItem.count({ where: { wallet } });
  const yer = Math.max(0, GEAR.vaultSize - mevcut);
  const verilecek = rolled.slice(0, yer).map((it) => ({ ...it, id: `${wallet}:${it.id}` }));
  const dropped = rolled.length - verilecek.length;
  if (verilecek.length === 0) return { items: [], dropped };

  await prisma.gearItem.createMany({
    data: verilecek.map((it) => ({
      id: it.id, wallet, slot: it.slot, rarity: it.rarity,
      affixes: it.affixes as unknown as object, depth: it.depth,
    })),
    skipDuplicates: true,
  });

  // ⚠️ GERÇEKTEN YAZILANI DÖNDÜR, ÜRETİLENİ DEĞİL. İlk sürüm `verilecek`
  // döndürüyordu ve yukarıdaki çakışma sessiz kalmıştı: oyuncuya "8 parça
  // kazandın" denip çantaya hiçbir şey konmayabilirdi. Bir ödül bildirimi,
  // ödülün yazıldığına dair kanıta dayanmalı.
  const yazilan = await prisma.gearItem.findMany({
    where: { wallet, id: { in: verilecek.map((it) => it.id) } },
  });
  const set = new Set(yazilan.map((r) => r.id));
  return { items: verilecek.filter((it) => set.has(it.id)), dropped };
}

/**
 * Parçayı tak.
 *
 * ⚠️ HER İKİ YAZMA DA KOŞULLU ve AYNI transaction'da. İki sekmeden aynı anda
 * takmak, "önce oku sonra yaz" ile aynı yuvada iki takılı parça bırakabilirdi
 * ve `equippedBonus` ikisini birden toplardı — yani bedava güç.
 */
export async function equipGear(wallet: string, id: unknown): Promise<GearView> {
  if (typeof id !== 'string' || !id) throw new GearError('gecersiz_parca');
  const row = await prisma.gearItem.findUnique({ where: { id } });
  if (!row || row.wallet !== wallet) throw new GearError('parca_yok', 404);
  if (row.equipped) return listGear(wallet);

  await prisma.$transaction(async (tx) => {
    // Aynı yuvadaki eskisini çıkar — yuva başına TEK parça
    await tx.gearItem.updateMany({
      where: { wallet, slot: row.slot, equipped: true },
      data: { equipped: false },
    });
    // ⚠️ `equipped: false` şartı KALMALI: yukarıdaki temizlikle bu satır
    // arasında başka bir istek onu takmış olabilir.
    const hit = await tx.gearItem.updateMany({
      where: { id, wallet, equipped: false },
      data: { equipped: true },
    });
    if (hit.count === 0) throw new GearError('takilamadi');
  });
  return listGear(wallet);
}

export async function unequipSlot(wallet: string, slot: unknown): Promise<GearView> {
  if (typeof slot !== 'string' || !SLOT_SET.has(slot)) throw new GearError('gecersiz_yuva');
  await prisma.gearItem.updateMany({
    where: { wallet, slot, equipped: true },
    data: { equipped: false },
  });
  return listGear(wallet);
}

/**
 * Parçala — TOZ verir, gold DEĞİL.
 *
 * ⚠️ Gold verseydi Wilderness sonsuz tekrarlanabilir bir gold musluğu olurdu
 * ve bu ekonominin kaldıramayacağı tek şey o. Toz yalnızca kozmetik alıyor;
 * yani güç ekonomisine hiç dokunmuyor.
 *
 * ⚠️ TAKILI PARÇA PARÇALANAMAZ. Kaza ile en iyi parçasını yok eden oyuncu,
 * geri alınamayan bir arayüz hatası yaşar; yasak burada, arayüzde değil.
 */
export async function salvageGear(
  wallet: string, ids: unknown,
): Promise<{ dust: number; removed: number }> {
  if (!Array.isArray(ids) || ids.length === 0) throw new GearError('bos_secim');
  if (ids.length > GEAR.vaultSize) throw new GearError('cok_fazla');
  const list = ids.filter((x): x is string => typeof x === 'string' && !!x);
  if (list.length === 0) throw new GearError('bos_secim');

  return prisma.$transaction(async (tx) => {
    const rows = await tx.gearItem.findMany({
      where: { id: { in: list }, wallet, equipped: false },
    });
    if (rows.length === 0) throw new GearError('parca_yok', 404);

    // ⚠️ SİLME KOŞULLU ve TOZ SİLİNEN SATIR SAYISINDAN hesaplanıyor.
    // Okunan satırlara göre toz verip sonra silmek, iki eşzamanlı parçalama
    // isteğinde aynı parçanın tozunu İKİ KEZ ödettirirdi.
    const toz = rows.reduce((s, r) => s + rarityOf(r.rarity).salvage, 0);
    const silinen = await tx.gearItem.deleteMany({
      where: { id: { in: rows.map((r) => r.id) }, wallet, equipped: false },
    });
    if (silinen.count !== rows.length) throw new GearError('yaris', 409);

    await tx.player.update({ where: { wallet }, data: { dust: { increment: toz } } });
    return { dust: toz, removed: silinen.count };
  });
}
