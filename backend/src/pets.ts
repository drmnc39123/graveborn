// THE BINDING — sunucu tarafı. Bağlama / yükseltme / füzyon / kuşanma.
//
// ⚠️ EKONOMİ KURALI BURADA YAZILMIYOR, `@game/pets`ten OKUNUYOR. Aynı sayıyı
// iki yerde tutmak er ya da geç iki yerde ayrışmak demek ve ayrışan taraf
// para basar. Bu dosyanın işi kural koymak değil, kuralı UYGULAMAK ve
// yazmanın atomik olmasını sağlamak.
//
// ⚠️ GOLD HAREKETİNİN TAMAMI `withLedger` ÜZERİNDEN. Tek kapı olmasının iki
// sebebi var: (1) Crypt kasası ve "gold harca" görevi oradan besleniyor,
// (2) `rev` ile koşullu yazma yarışı kapatıyor — ölçüldü, `rev` verilmeyen
// yolda tek ödemeyle beş işlem geçiyor.

import { prisma } from './db.js';
import { withLedger } from './ledger.js';
import {
  BIND, FUSE_COPIES, FUSE_GOLD, MYTHIC_CAP, SLOT2,
  bindKillsNeeded, canBind, petById, petCap, petLevelCost, slot2Unlockable,
} from '@game/pets';

export class PetError extends Error {
  constructor(msg: string, readonly status = 400) { super(msg); }
}

/** JSON sütunundan sayı sözlüğü — kayıt her zaman güvensiz okunur */
function sayac(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.floor(Number(v));
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

function dizi(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

interface PetDurum {
  gold: number;
  kills: Record<string, number>;
  pets: Record<string, number>;
  petLevels: Record<string, number>;
  petFused: string[];
  equippedPets: string[];
  petSlot2: boolean;
  deepestDepth: number;
}

async function oku(wallet: string): Promise<PetDurum & { rev: number }> {
  const p = await prisma.player.findUnique({
    where: { wallet },
    select: {
      gold: true, rev: true, banned: true, depthPaid: true,
      kills: true, pets: true, petLevels: true, petFused: true,
      equippedPets: true, petSlot2: true,
    },
  });
  if (!p || p.banned) throw new PetError('yasakli', 403);
  // ⚠️ EN DERİN NOKTA `depthPaid`TEN — yani sunucunun ÖDEDİĞİ, oyuncunun
  // iddia ettiği değil. İkinci yuvanın derinlik koşulu buna bakıyor;
  // istemciden gelen bir sayıya baksaydı yuva bedava açılırdı.
  const dp = sayac(p.depthPaid);
  const deepest = Object.values(dp).reduce((m, v) => Math.max(m, v), 0);
  return {
    gold: p.gold, rev: p.rev,
    kills: sayac(p.kills), pets: sayac(p.pets), petLevels: sayac(p.petLevels),
    petFused: dizi(p.petFused), equippedPets: dizi(p.equippedPets),
    petSlot2: p.petSlot2 === true,
    deepestDepth: deepest,
  };
}

/**
 * BAĞLAMA — pet'i aç ya da bir kopya daha ekle.
 *
 * ⚠️ İKİ KOŞUL BİRDEN: kill eşiği + gold. Yalnızca gold olsaydı balina
 * koleksiyonu açılışta satın alırdı; yalnızca kill olsaydı gold'a talep
 * doğmazdı. Eşik kopya başına artıyor — `canBind` bunu hesaplıyor, burada
 * tekrar yazılmıyor.
 */
export async function bindPet(wallet: string, petId: unknown) {
  if (typeof petId !== 'string') throw new PetError('gecersiz_pet');
  const def = petById(petId);
  if (!def) throw new PetError('gecersiz_pet');

  const s = await oku(wallet);
  const sahip = s.pets[petId] ?? 0;
  const kill = s.kills[def.bindsFrom] ?? 0;

  const karar = canBind(def, kill, s.gold, sahip);
  if (!karar.ok) {
    // Sebebi oyuncuya söylüyoruz: "neden alamıyorum" sorusunun cevabı
    // panelde görünmeli, yoksa düğme sessizce çalışmıyor sanılır.
    throw new PetError(
      karar.reason === 'kills' ? `kill_yetersiz:${kill}/${bindKillsNeeded(def, sahip)}`
        : karar.reason === 'gold' ? 'gold_yetersiz'
        : 'max_kopya');
  }

  const maliyet = BIND[def.rarity].gold;
  const yeniPets = { ...s.pets, [petId]: sahip + 1 };
  // ⚠️ İLK KOPYADA SEVİYE 0'DAN BAŞLAR, sonraki kopyalarda DOKUNULMAZ:
  // kopya bir yükseltme değil füzyon malzemesi. Seviyeyi sıfırlasaydık
  // oyuncu kopya toplarken kendi yatırımını silerdi.
  const yeniLevels = sahip === 0 ? { ...s.petLevels, [petId]: 0 } : s.petLevels;

  await withLedger(
    wallet,
    { gold: { decrement: maliyet }, pets: yeniPets, petLevels: yeniLevels },
    { kind: 'pet', gold: -maliyet, detail: `bind ${petId} #${sahip + 1}` },
    s.rev,
  );
  return { pet: petId, copies: sahip + 1, spent: maliyet, gold: s.gold - maliyet };
}

/**
 * YÜKSELTME — bir seviye. ⚠️ SONLU: tavan nadirlikten (füzyonluysa MYTHIC_CAP).
 * Tavansız olsaydı gold sınırsız güce çevrilir ve "derinlik parayla aşılamaz"
 * duruşu çökerdi.
 */
export async function upgradePet(wallet: string, petId: unknown) {
  if (typeof petId !== 'string') throw new PetError('gecersiz_pet');
  const def = petById(petId);
  if (!def) throw new PetError('gecersiz_pet');

  const s = await oku(wallet);
  if ((s.pets[petId] ?? 0) <= 0) throw new PetError('bagli_degil', 404);

  const mythic = s.petFused.includes(petId);
  const lv = s.petLevels[petId] ?? 0;
  const tavan = petCap(def, mythic);
  if (lv >= tavan) throw new PetError('tavan');

  const maliyet = petLevelCost(def, lv, mythic);
  if (!Number.isFinite(maliyet)) throw new PetError('tavan');
  if (s.gold < maliyet) throw new PetError('gold_yetersiz');

  await withLedger(
    wallet,
    { gold: { decrement: maliyet }, petLevels: { ...s.petLevels, [petId]: lv + 1 } },
    { kind: 'pet', gold: -maliyet, detail: `upgrade ${petId} lv${lv}→${lv + 1}` },
    s.rev,
  );
  return { pet: petId, level: lv + 1, cap: tavan, spent: maliyet, gold: s.gold - maliyet };
}

/**
 * FÜZYON → MYTHIC.
 *
 * ⚠️ MYTHIC SATIN ALINAMAZ. Dört kopya gerekiyor ve her kopya kill eşiğini
 * yeniden doldurmayı gerektiriyor (bkz. `bindPet`), yani gold burada yalnızca
 * ikinci koşul. Ekonomideki tek "parayla erişilemeyen güç kademesi" bu.
 *
 * ⚠️ Yalnızca LEGENDARY füzyonlanır: mythic bir nadirlik değil, füzyondan
 * geçmiş legendary'nin DURUMU (bkz. pets.ts PET_CAP notu).
 */
export async function fusePet(wallet: string, petId: unknown) {
  if (typeof petId !== 'string') throw new PetError('gecersiz_pet');
  const def = petById(petId);
  if (!def) throw new PetError('gecersiz_pet');
  if (def.rarity !== 'legendary') throw new PetError('sadece_legendary');

  const s = await oku(wallet);
  if (s.petFused.includes(petId)) throw new PetError('zaten_mythic');
  if ((s.pets[petId] ?? 0) < FUSE_COPIES) {
    throw new PetError(`kopya_yetersiz:${s.pets[petId] ?? 0}/${FUSE_COPIES}`);
  }
  if (s.gold < FUSE_GOLD) throw new PetError('gold_yetersiz');

  await withLedger(
    wallet,
    {
      gold: { decrement: FUSE_GOLD },
      petFused: [...s.petFused, petId],
      // ⚠️ KOPYALAR TÜKETİLİYOR (1'e düşüyor). Kalsalardı oyuncu aynı pet'i
      // ikinci kez füzyonlayamayacağı için ölü yatırım olurlardı; tüketmek
      // ayrıca "füzyon bir BEDEL" hissini veriyor.
      pets: { ...s.pets, [petId]: 1 },
    },
    { kind: 'pet', gold: -FUSE_GOLD, detail: `fuse ${petId} → mythic` },
    s.rev,
  );
  return { pet: petId, mythic: true, cap: MYTHIC_CAP, spent: FUSE_GOLD, gold: s.gold - FUSE_GOLD };
}

/**
 * KUŞANMA — hangi pet'ler koşuya girecek.
 *
 * ⚠️ GOLD HAREKETİ YOK, o yüzden `withLedger` DEĞİL doğrudan koşullu yazma.
 * `withLedger`i bedelsiz bir işlem için çağırmak deftere sıfır gold'luk
 * satırlar yazar ve ekonomi panosunu kirletirdi.
 */
export async function equipPets(wallet: string, ids: unknown) {
  if (!Array.isArray(ids)) throw new PetError('gecersiz_liste');
  const s = await oku(wallet);
  const yuva = s.petSlot2 ? 2 : 1;

  const temiz: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || temiz.includes(id)) continue;
    if (!petById(id)) continue;
    // ⚠️ SAHİP OLMADIĞINI TAKAMAZ. İstemci tarafında da aynı kontrol var
    // (`resolveRunPets`) ama orası oyuncunun kendi tarayıcısı — yetkili
    // olan burası.
    if ((s.pets[id] ?? 0) <= 0) throw new PetError(`bagli_degil:${id}`, 404);
    temiz.push(id);
    if (temiz.length >= yuva) break;
  }

  const n = await prisma.player.updateMany({
    where: { wallet, rev: s.rev },
    data: { equippedPets: temiz, rev: { increment: 1 } },
  });
  if (n.count === 0) throw new PetError('yaris', 409);
  return { equipped: temiz, slots: yuva };
}

/**
 * İKİNCİ YUVA — bir kez satın alınır.
 *
 * ⚠️ DERİNLİK KOŞULU `depthPaid`TEN okunuyor (bkz. `oku`): sunucunun ödediği
 * derinlik. Gold tek koşul olsaydı yuva ilk gün açılır ve güç tavanı ikiye
 * katlanırdı — kampanya dengesi buna göre ölçülmedi.
 */
export async function buyPetSlot(wallet: string) {
  const s = await oku(wallet);
  if (s.petSlot2) throw new PetError('zaten_acik');
  if (!slot2Unlockable(s.deepestDepth, s.gold)) {
    throw new PetError(s.deepestDepth < SLOT2.depth
      ? `derinlik_yetersiz:${s.deepestDepth}/${SLOT2.depth}`
      : 'gold_yetersiz');
  }

  await withLedger(
    wallet,
    { gold: { decrement: SLOT2.gold }, petSlot2: true },
    { kind: 'pet', gold: -SLOT2.gold, detail: 'ikinci yuva' },
    s.rev,
  );
  return { slots: 2, spent: SLOT2.gold, gold: s.gold - SLOT2.gold };
}
