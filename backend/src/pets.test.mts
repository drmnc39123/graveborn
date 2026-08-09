// THE BINDING — sunucu testi.
//
// Burada hem PARA hem GÜÇ var, o yüzden sorular güvenlik soruları:
//   1. Kill sayacı istemciden geliyor — uydurulabiliyor mu? (Bu sayaç pet'in
//      "parayla alınamaz" koşulunun TEK dayanağı; kırpılmazsa koşul kâğıt
//      üzerinde kalır.)
//   2. Gold gerçekten gidiyor mu ve pet gerçekten AYNI ANDA yazılıyor mu?
//   3. Eşzamanlı iki istek tek ödemeyle iki bağlama geçirebiliyor mu?
//   4. Mythic satın alınabiliyor mu? (tasarımın tamamı buna dayanıyor)
//   5. Forager greed'i sunucunun tavanına giriyor mu? (girmezse DÜRÜST
//      oyuncu haksız kırpılır — sessiz ve en kötü hata sınıfı)
//
// Çalıştır:  npx tsx src/pets.test.mts

import crypto from 'node:crypto';
import { BIND, FUSE_COPIES, FUSE_GOLD, MYTHIC_CAP, PETS, SLOT2, petById, petLevelCost } from '@game/pets';
import { emptyProgress } from '@game/progress';
import { prisma } from './db.js';
import { PetError, bindPet, upgradePet, fusePet, equipPets, buyPetSlot } from './pets.js';
import { applyKills, greedCeiling, maxKills } from './reward.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

// ── DB'SİZ BÖLÜM ─────────────────────────────────────────────────────
// Bu kontroller saf; DB olmadan da koşarlar ve en kritik olanları burada.

console.log('\n[1] KILL İDDİASI KIRPILIYOR — pet\'in "parayla alınamaz" dayanağı');
{
  const tavan = maxKills('campaign', 1, 0, 0);
  check('kampanya tavanı makul', tavan > 0 && tavan < 5000, `${tavan} düşman`);

  // Dürüst oyuncu: tavanın altında → HİÇ dokunulmuyor
  const durust = applyKills({}, { imp: 40, rogue: 25 }, tavan);
  check('dürüst iddia AYNEN geçiyor', durust.imp === 40 && durust.rogue === 25,
    JSON.stringify(durust));

  // ⚠️ ASIL SALDIRI: "999.999 brute öldürdüm" → legendary pet bedava açılır
  const yalanci = applyKills({}, { brute: 999_999 }, tavan);
  check('şişirilmiş iddia TAVANA kırpılıyor', (yalanci.brute ?? 0) <= tavan,
    `${yalanci.brute} ≤ ${tavan}`);
  check('şişirilmiş iddia legendary eşiğini TEK KOŞUDA geçemiyor',
    (yalanci.brute ?? 0) < BIND.legendary.kills,
    `${yalanci.brute} < ${BIND.legendary.kills}`);

  // ⚠️ TİP BAŞINA DEĞİL TOPLAM kırpılmalı: 20 tipe tavan kadar yazan yalancı
  // aksi hâlde 20 kat kazanırdı.
  const cokTip: Record<string, number> = {};
  for (const p of PETS) cokTip[p.bindsFrom] = 999_999;
  const kirpilan = applyKills({}, cokTip, tavan);
  const toplam = Object.values(kirpilan).reduce((s, v) => s + v, 0);
  check('TOPLAM kırpılıyor (tip başına değil)', toplam <= tavan + PETS.length,
    `${toplam} ≤ ~${tavan}`);

  // Var olan sayaç korunmalı — kırpma birikimi silmemeli
  const birikim = applyKills({ imp: 100 }, { imp: 5 }, tavan);
  check('önceki sayaç KORUNUYOR', birikim.imp === 105, `${birikim.imp}`);

  // Çöp girdi patlamamalı
  check('çöp iddia yok sayılıyor',
    Object.keys(applyKills({}, null, tavan)).length === 0
    && Object.keys(applyKills({}, { x: -5, y: 'abc' }, tavan)).length === 0);
}

console.log('\n[2] FORAGER GREED\'İ SUNUCU TAVANINA GİRİYOR');
{
  // ⚠️ Girmezse DÜRÜST oyuncu kırpılır. Bu sessiz bir hatadır: kimse
  // "gold'um eksik geldi" diye şikâyet etmez, oyun sadece cimri hissettirir.
  const bos = emptyProgress();
  const tabanTavan = greedCeiling(bos);

  const forager = PETS.find((p) => p.role === 'forager')!;
  const ile = { ...bos, pets: { [forager.id]: 1 } };
  const petliTavan = greedCeiling(ile);
  check('forager sahibi oyuncunun tavanı DAHA GENİŞ', petliTavan > tabanTavan,
    `${tabanTavan.toFixed(3)} → ${petliTavan.toFixed(3)}`);

  // ⚠️ Ama HERKESE verilmemeli — sabit pay bırakmak, greedCeiling başlığında
  // anlatılan hatanın (yalancıya dürüstün 2,1 katı) pet üzerinden tekrarı olurdu
  check('pet\'i olmayanın tavanı BÜYÜMÜYOR', greedCeiling(bos) === tabanTavan);

  // İki yuva iki forager taşıyabilir → tavan daha da geniş
  const ikiYuva = { ...bos, pets: Object.fromEntries(
    PETS.filter((p) => p.role === 'forager').map((p) => [p.id, 1])), petSlot2: true };
  check('iki yuva iki forager\'ı sayıyor', greedCeiling(ikiYuva) > petliTavan,
    `${petliTavan.toFixed(3)} → ${greedCeiling(ikiYuva).toFixed(3)}`);
}

// ── DB'Lİ BÖLÜM ──────────────────────────────────────────────────────
const dbVar = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
if (!dbVar) {
  console.log('\n⚠️  DB YOK — [3]-[6] atlandı (saf kontroller yukarıda koştu)');
} else {
  const cuzdan = `test_pet_${crypto.randomUUID()}`;
  const temizle = async () => {
    await prisma.ledger.deleteMany({ where: { wallet: cuzdan } }).catch(() => {});
    await prisma.player.deleteMany({ where: { wallet: cuzdan } }).catch(() => {});
  };
  const kur = async (data: Record<string, unknown>) => {
    await temizle();
    await prisma.player.create({ data: { wallet: cuzdan, ...data } as never });
  };

  const common = PETS.find((p) => p.rarity === 'common')!;
  const leg = PETS.find((p) => p.rarity === 'legendary')!;

  console.log('\n[3] BAĞLAMA — iki koşul birden');
  {
    // Gold sonsuz, kill sıfır → RED
    await kur({ gold: 10_000_000, kills: {} });
    let hata = '';
    await bindPet(cuzdan, common.id).catch((e) => { hata = String(e.message); });
    check('gold sonsuz ama kill yoksa REDDEDİLİYOR', hata.startsWith('kill_yetersiz'), hata);

    // Kill yeter, gold yok → RED
    await kur({ gold: 0, kills: { [common.bindsFrom]: 999_999 } });
    hata = '';
    await bindPet(cuzdan, common.id).catch((e) => { hata = String(e.message); });
    check('kill yeter ama gold yoksa REDDEDİLİYOR', hata === 'gold_yetersiz', hata);

    // İkisi de var → gold gidiyor VE pet yazılıyor
    await kur({ gold: 100_000, kills: { [common.bindsFrom]: 999_999 } });
    const out = await bindPet(cuzdan, common.id);
    const row = await prisma.player.findUnique({ where: { wallet: cuzdan } });
    const pets = row!.pets as Record<string, number>;
    check('gold DÜŞTÜ ve pet AYNI ANDA yazıldı',
      row!.gold === 100_000 - BIND.common.gold && pets[common.id] === 1,
      `gold ${row!.gold} · kopya ${pets[common.id]}`);
    check('defter kaydı düşüldü', out.spent === BIND.common.gold);
  }

  console.log('\n[4] EŞZAMANLI İSTEK — tek ödemeyle iki bağlama geçmiyor');
  {
    await kur({ gold: 100_000, kills: { [common.bindsFrom]: 999_999 } });
    const sonuc = await Promise.allSettled(
      Array.from({ length: 6 }, () => bindPet(cuzdan, common.id)));
    const gecen = sonuc.filter((r) => r.status === 'fulfilled').length;
    const row = await prisma.player.findUnique({ where: { wallet: cuzdan } });
    const pets = row!.pets as Record<string, number>;
    // ⚠️ Kaçının geçtiği önemli DEĞİL; önemli olan ÖDENEN ile YAZILAN'ın
    // birebir tutması. `rev` koşullu yazma bunu garanti ediyor.
    check('ödenen gold ile yazılan kopya BİREBİR',
      100_000 - row!.gold === (pets[common.id] ?? 0) * BIND.common.gold,
      `${gecen}/6 geçti · gold −${100_000 - row!.gold} · kopya ${pets[common.id]}`);
  }

  console.log('\n[5] MYTHIC SATIN ALINAMIYOR');
  {
    // Sonsuz gold, tek kopya → füzyon RED
    await kur({ gold: 100_000_000, pets: { [leg.id]: 1 }, petLevels: { [leg.id]: 0 } });
    let hata = '';
    await fusePet(cuzdan, leg.id).catch((e) => { hata = String(e.message); });
    check('sonsuz gold ile bile kopya olmadan füzyon YOK',
      hata.startsWith('kopya_yetersiz'), hata);

    // Dört kopya + gold → füzyon geçiyor, tavan yükseliyor
    await kur({ gold: 100_000_000, pets: { [leg.id]: FUSE_COPIES }, petLevels: { [leg.id]: 0 } });
    const f = await fusePet(cuzdan, leg.id);
    check('dört kopya + gold ile füzyon geçiyor', f.mythic && f.cap === MYTHIC_CAP);
    const row = await prisma.player.findUnique({ where: { wallet: cuzdan } });
    check('füzyon kopyaları TÜKETİYOR',
      (row!.pets as Record<string, number>)[leg.id] === 1,
      `${(row!.pets as Record<string, number>)[leg.id]} kopya kaldı`);
    check('füzyon gold\'u düştü', row!.gold === 100_000_000 - FUSE_GOLD);

    // İkinci kez füzyon → RED
    hata = '';
    await fusePet(cuzdan, leg.id).catch((e) => { hata = String(e.message); });
    check('ikinci füzyon REDDEDİLİYOR', hata === 'zaten_mythic', hata);

    // Common füzyonlanamaz
    hata = '';
    await fusePet(cuzdan, common.id).catch((e) => { hata = String(e.message); });
    check('sadece legendary füzyonlanıyor', hata === 'sadece_legendary', hata);
  }

  console.log('\n[6] YÜKSELTME TAVANI + KUŞANMA + YUVA');
  {
    await kur({ gold: 100_000_000, pets: { [common.id]: 1 }, petLevels: { [common.id]: 0 } });
    // Tavana kadar yükselt, sonra bir tane daha dene
    const tavan = 10;   // common
    for (let i = 0; i < tavan; i++) await upgradePet(cuzdan, common.id);
    let hata = '';
    await upgradePet(cuzdan, common.id).catch((e) => { hata = String(e.message); });
    check('seviye TAVANI aşılamıyor', hata === 'tavan', hata);

    const row = await prisma.player.findUnique({ where: { wallet: cuzdan } });
    let beklenen = 0;
    for (let i = 0; i < tavan; i++) beklenen += petLevelCost(common, i, false);
    check('harcanan gold seviyelerle BİREBİR',
      100_000_000 - row!.gold === beklenen,
      `${100_000_000 - row!.gold} = ${beklenen}`);

    // ⚠️ SAHİP OLMADIĞINI TAKAMAZ — burada bahis kozmetik değil GÜÇ
    hata = '';
    await equipPets(cuzdan, [leg.id]).catch((e) => { hata = String(e.message); });
    check('sahip olunmayan pet TAKILAMIYOR', hata.startsWith('bagli_degil'), hata);

    // Tek yuva → ikinci pet kırpılıyor
    await prisma.player.update({ where: { wallet: cuzdan },
      data: { pets: { [common.id]: 1, [leg.id]: 1 } } });
    const eq = await equipPets(cuzdan, [common.id, leg.id]);
    check('tek yuvada ikinci pet KIRPILIYOR', eq.equipped.length === 1, JSON.stringify(eq));

    // Yuva: derinlik yetmezse açılmıyor
    hata = '';
    await buyPetSlot(cuzdan).catch((e) => { hata = String(e.message); });
    check('derinlik yetmeden ikinci yuva AÇILMIYOR', hata.startsWith('derinlik_yetersiz'), hata);

    // Derinlik verilince açılıyor
    await prisma.player.update({ where: { wallet: cuzdan },
      data: { depthPaid: { 1: SLOT2.depth } } });
    const slot = await buyPetSlot(cuzdan);
    check('derinlik + gold ile ikinci yuva açılıyor', slot.slots === 2);
  }

  await temizle();
}

await prisma.$disconnect().catch(() => {});
console.log(`\n${FAIL.length === 0 ? '✅ PET SUNUCU KAPISI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
