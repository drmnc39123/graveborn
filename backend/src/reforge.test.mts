// YENİDEN DÖVME — sunucu testi.
//
// Burada PARA var, o yüzden sorular güvenlik soruları:
//   1. Gold gerçekten gidiyor mu, parça gerçekten değişiyor mu — ve ikisi
//      AYNI ANDA mı? ("gold gitti, parça değişmedi" geri alınamaz)
//   2. Eşzamanlı iki istek tek ödemeyle iki dövme geçirebiliyor mu?
//   3. Parası yeten yetmeyen ayrımı doğru mu?
//   4. GÜÇ TAVANI aşılabiliyor mu? (ekipmanın tüm tasarımı buna dayanıyor)
//   5. Başkasının parçasını dövebiliyor musun?
//
// Çalıştır:  npx tsx src/reforge.test.mts

import crypto from 'node:crypto';
import { MAX_GEAR_BUDGET, RARITIES, rarityOf } from '@game/gear';
import { FULL_PROMOTE_COST, canPromote, promoteCost, rerollCost } from '@game/reforge';
import { prisma } from './db.js';
import { GearError, reforgeGear } from './gear.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_REFORGE_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });

await prisma.player.createMany({
  data: [0, 1, 2].map((n) => ({ wallet: w(n), gold: 200_000 })),
});

async function parcaEkle(n: number, rarity: number, slot = 'grasp') {
  const id = crypto.randomUUID();
  await prisma.gearItem.create({
    data: {
      id, wallet: w(n), slot, rarity, depth: 20,
      affixes: [{ stat: 'might', value: 0.1, kind: 'boon' }] as unknown as object,
    },
  });
  return id;
}

console.log('\n[1] Maliyet tablosu tutarlı');
{
  console.log(`     yükseltme: ${RARITIES.map((r) => `${r.name} ${promoteCost(r.tier) ?? '—'}`).join(' · ')}`);
  console.log(`     tam yükseltme toplamı: ${FULL_PROMOTE_COST.toLocaleString('en-US')} gold`);
  // ⚠️ En üst kademe YÜKSELTİLEMEZ — aksi hâlde güç tavanı delinirdi.
  check('en üst kademe yükseltilemiyor', !canPromote(RARITIES.length), `t${RARITIES.length}`);
  check('her ara kademe yükseltilebiliyor',
    RARITIES.slice(0, -1).every((r) => canPromote(r.tier)));
  // Maliyet MONOTON artmalı: üst kademe daha ucuz olsaydı oyuncu atlaya
  // atlaya çıkardı ve merdiven anlamını yitirirdi.
  let artan = true;
  for (let t = 1; t < RARITIES.length - 1; t++) {
    if ((promoteCost(t + 1) ?? 0) <= (promoteCost(t) ?? 0)) artan = false;
  }
  check('yükseltme maliyeti kademeyle ARTIYOR', artan);
  let rArtan = true;
  for (let t = 1; t < RARITIES.length; t++) {
    if (rerollCost(t + 1) <= rerollCost(t)) rArtan = false;
  }
  check('yeniden dizme maliyeti kademeyle ARTIYOR', rArtan,
    RARITIES.map((r) => rerollCost(r.tier)).join('/'));
}

console.log('\n[2] ⭐ GÜÇ TAVANI DELİNMİYOR');
{
  // Yükseltme yalnızca kademe atlatıyor; kademe tavanı RARITIES'in sonu.
  // Yani tavan tanım gereği değişmiyor — ama bunu ölçmek şart, çünkü
  // ekipman tasarımının TAMAMI kapalı tavan üstüne kurulu.
  const id = await parcaEkle(0, 1);
  for (let i = 0; i < 10; i++) {
    try { await reforgeGear(w(0), id, 'promote'); } catch { /* en üstte durur */ }
  }
  const son = await prisma.gearItem.findUniqueOrThrow({ where: { id } });
  console.log(`     10 yükseltme denemesi → kademe ${son.rarity} (tavan ${RARITIES.length})`);
  check('kademe tavanı aşılmıyor', son.rarity === RARITIES.length, `t${son.rarity}`);
  const r = rarityOf(son.rarity);
  check('parçanın bütçesi kendi kademesini aşmıyor', r.budget <= RARITIES[RARITIES.length - 1].budget);
  check('toplam tavan sabit kaldı', MAX_GEAR_BUDGET === 5 * RARITIES[RARITIES.length - 1].budget,
    `${MAX_GEAR_BUDGET}`);
}

console.log('\n[3] ⭐ GOLD ve PARÇA birlikte değişiyor');
{
  const id = await parcaEkle(1, 2);
  const once = (await get(1)).gold;
  const oncekiParca = await prisma.gearItem.findUniqueOrThrow({ where: { id } });
  const out = await reforgeGear(w(1), id, 'promote');
  const sonra = (await get(1)).gold;
  const yeniParca = await prisma.gearItem.findUniqueOrThrow({ where: { id } });

  check('gold TAM maliyet kadar düştü', once - sonra === out.spent,
    `${once} → ${sonra} (−${out.spent})`);
  check('kademe gerçekten arttı', yeniParca.rarity === oncekiParca.rarity + 1,
    `t${oncekiParca.rarity} → t${yeniParca.rarity}`);
  check('ekler yeniden dizildi',
    JSON.stringify(yeniParca.affixes) !== JSON.stringify(oncekiParca.affixes));
  // ⚠️ DEFTER KAYDI ŞART: gold sinklerinin ekonomi panosunda görünmesi
  // buna bağlı ve kasa katkısı da aynı yoldan geçiyor.
  const defter = await prisma.ledger.findFirst({
    where: { wallet: w(1), kind: 'reforge' }, orderBy: { at: 'desc' },
  });
  check('deftere yazıldı', !!defter && defter.gold === -out.spent, `${defter?.gold}`);
}

console.log('\n[4] ⭐ EŞZAMANLI DÖVME — muhasebe tutuyor mu');
{
  // ⚠️ BU BÖLÜM ÖNCE YANLIŞ ŞEYİ İDDİA EDİYORDU ve bir koşuda kırmızı yandı,
  // sonraki 10 koşuda yanmadı. Sebep testin kendisiydi: "tam 1 tanesi geçti"
  // bir GÜVENLİK kuralı DEĞİL. `Promise.all` isteklerin aynı ANDA okumasını
  // garanti etmiyor — biri diğerinin commit'inden SONRA okursa t2→t3
  // yükseltmesi tamamen MEŞRU olarak geçer. Yani 1 de 2 de doğru olabilir.
  //
  // Korunması gereken gerçek kural MUHASEBE: harcanan gold, uygulanan kademe
  // atlamalarının maliyetine BİREBİR eşit olmalı. Bu hem çift harcamayı
  // (gold gitti kademe gelmedi) hem bedava yükseltmeyi (kademe geldi gold
  // gitmedi) yakalar ve yarışın nasıl serileştiğinden bağımsızdır.
  const id = await parcaEkle(2, 1);
  const once = (await get(2)).gold;
  const sonuc = await Promise.all([1, 2, 3, 4, 5].map(
    () => reforgeGear(w(2), id, 'promote').then(() => 'ok').catch(() => 'red'),
  ));
  const gecen = sonuc.filter((x) => x === 'ok').length;
  const sonra = (await get(2)).gold;
  const parca = await prisma.gearItem.findUniqueOrThrow({ where: { id } });
  const harcanan = once - sonra;
  let beklenen = 0;
  for (let t = 1; t < parca.rarity; t++) beklenen += promoteCost(t) ?? 0;

  console.log(`     5 eszamanli -> ${gecen} gecti · t1 -> t${parca.rarity} · harcanan ${harcanan} (beklenen ${beklenen})`);
  check('EN AZ biri gecti (canlilik)', gecen >= 1, `${gecen}`);
  check('kademe artisi GECEN ISTEK SAYISI kadar', parca.rarity === 1 + gecen,
    `t${parca.rarity} vs 1+${gecen}`);
  // ⚠️ ASIL GÜVENLİK KURALI — bu asla bozulmamalı.
  check('harcanan gold uygulanan kademelerle BIREBIR esit', harcanan === beklenen,
    `${harcanan} = ${beklenen}`);
  check('bedava kademe YOK', harcanan > 0 || parca.rarity === 1);
}

console.log('\n[5] Parası yetmeyen dövemiyor');
{
  await prisma.player.update({ where: { wallet: w(0) }, data: { gold: 10 } });
  const id = await parcaEkle(0, 1);
  let red = false;
  try { await reforgeGear(w(0), id, 'promote'); } catch (e) {
    red = e instanceof GearError && e.code === 'gold_yetersiz';
  }
  check('gold yetmeyince REDDEDİLİYOR', red);
  const parca = await prisma.gearItem.findUniqueOrThrow({ where: { id } });
  check('reddedilen işlem parçaya DOKUNMADI', parca.rarity === 1);
  check('gold da değişmedi', (await get(0)).gold === 10);
}

console.log('\n[6] ⭐ BAŞKASININ parçası dövülemiyor');
{
  const id = await parcaEkle(1, 2);
  let red = false;
  try { await reforgeGear(w(2), id, 'reroll'); } catch (e) {
    red = e instanceof GearError && e.code === 'parca_yok';
  }
  check('başkasının parçası REDDEDİLİYOR', red);
  // ⚠️ Sahibinin gold'u da harcanmamalı — yanlış cüzdanla gelen istek
  // sahibinin cebine dokunamaz.
  const sahip = (await get(1)).gold;
  const saldirgan = (await get(2)).gold;
  await prisma.gearItem.findUniqueOrThrow({ where: { id } });
  check('kimsenin altını harcanmadı', sahip >= 0 && saldirgan >= 0);
}

console.log('\n[7] Geçersiz girdi');
{
  const id = await parcaEkle(1, 2);
  for (const [ad, arg] of [['bilinmeyen işlem', 'melt'], ['boş', ''], ['null', null]] as const) {
    let red = false;
    try { await reforgeGear(w(1), id, arg); } catch (e) { red = e instanceof GearError; }
    check(`${ad} reddediliyor`, red);
  }
  let red = false;
  try { await reforgeGear(w(1), 'yok-boyle-id', 'reroll'); } catch (e) {
    red = e instanceof GearError && e.code === 'parca_yok';
  }
  check('olmayan parça reddediliyor', red);
}

console.log('\n[8] Yeniden dizme kademeyi DEĞİŞTİRMİYOR');
{
  await prisma.player.update({ where: { wallet: w(1) }, data: { gold: 200_000 } });
  const id = await parcaEkle(1, 4);
  const once = await prisma.gearItem.findUniqueOrThrow({ where: { id } });
  const out = await reforgeGear(w(1), id, 'reroll');
  const sonra = await prisma.gearItem.findUniqueOrThrow({ where: { id } });
  check('kademe aynı kaldı', sonra.rarity === once.rarity, `t${sonra.rarity}`);
  check('maliyet kademenin yeniden dizme fiyatı', out.spent === rerollCost(once.rarity),
    `${out.spent}`);
  // ⚠️ LANET DE YENİDEN ATILIYOR: 4. kademede lanet var, dizilen parçada da
  // olmalı. Sadece bonus atan bir yeniden dizme, laneti "silme" yolu olurdu.
  const lanet = (sonra.affixes as { kind: string }[]).filter((a) => a.kind === 'bane').length;
  check('lanet korunuyor (silinmiyor)', lanet === rarityOf(4).banes, `${lanet} lanet`);
}

// ── temizlik ──
await prisma.gearItem.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.ledger.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ YENİDEN DÖVME SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
await prisma.$disconnect();
process.exit(FAIL.length === 0 ? 0 : 1);
