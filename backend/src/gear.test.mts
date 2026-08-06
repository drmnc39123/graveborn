// EKİPMAN — SUNUCU TESTİ.
//
// Oyun tarafındaki denge `frontend/src/game/gear.test.mts`'te. Burada
// sunucuya özgü üç risk var:
//   1. Düşüşün SUNUCUDA üretilmesi — istemci "bende Graveborn çıktı" diyemez
//   2. Yarışlar — aynı yuvada iki takılı parça = bedava güç, çift parçalama =
//      bedava toz
//   3. Ekonomi — parçalama GOLD ödememeli, Wilderness gold ödememeli
//
// Çalıştır:  npx tsx src/gear.test.mts

import { GEAR, rollRunGear } from '@game/gear';
import { prisma } from './db.js';
import { equipGear, equippedBonus, grantRunGear, listGear, salvageGear, unequipSlot } from './gear.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_GEAR_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });

await prisma.player.createMany({
  data: [0, 1, 2].map((n) => ({ wallet: w(n), gold: 100_000 })),
});

console.log('\n═══ EKİPMAN (SUNUCU) ═══');

console.log('\n[1] ⭐ Düşüşü SUNUCU üretiyor');
{
  const seed = 987654321;
  const out = await grantRunGear(w(0), seed, 40);
  // ⚠️ İstemci hiçbir şey göndermedi; parçalar seed + derinlikten türedi.
  const beklenen = rollRunGear(seed, 40);
  check('derinlik 40 → 8 parça (tavan)', out.items.length === beklenen.length,
    `${out.items.length}`);
  // id dışında her şey saf fonksiyonun ürettiğiyle aynı olmalı; id sunucuda
  // cüzdanla öneklenir (bkz. grantRunGear — çakışma hatası)
  const soy = (x: { id: string }) => ({ ...x, id: '' });
  check('parçalar saf fonksiyonun ürettiğiyle AYNI',
    JSON.stringify(out.items.map(soy)) === JSON.stringify(beklenen.map(soy)));
  check('parça id\'si cüzdanla öneklenmiş',
    out.items.every((i) => i.id.startsWith(`${w(0)}:`)), out.items[0]?.id);

  const v = await listGear(w(0));
  check('çantaya yazıldı', v.items.length === out.items.length, `${v.items.length}`);
  check('hepsi çıkarılmış geliyor', v.items.every((i) => !i.equipped));
  check('çanta tavanı bildiriliyor', v.vaultSize === GEAR.vaultSize, `${v.vaultSize}`);
}

console.log('\n[2] ⭐ Aynı koşu iki kez kapanırsa parça ÇOĞALMIYOR');
{
  // ⚠️ `run.claimedAt` birinci kilit; bu ikincisi. Parça id'si deterministik
  // (`seed-depth-index`) olduğu için `skipDuplicates` ikinci grant'i yutuyor.
  const once = (await listGear(w(0))).items.length;
  await grantRunGear(w(0), 987654321, 40);
  const sonra = (await listGear(w(0))).items.length;
  check('ikinci grant sıfır satır ekledi', once === sonra, `${once} → ${sonra}`);
}

console.log('\n[2b] ⭐ İKİ OYUNCU AYNI SEED — parçalar çakışıyor mu');
{
  // ⚠️ BU TEST BİR HATA YAKALADI. Parça id'si önce sadece `seed-depth-index`
  // idi ve `id` GLOBAL birincil anahtar: aynı seed'i alan ikinci oyuncunun
  // parçaları `skipDuplicates` tarafından sessizce yutuluyordu — fonksiyon
  // "8 parça verdim" diyor, veritabanına 0 satır yazılıyordu. Üretimde nadir
  // ama sessiz, yani asla şikâyet gelmezdi.
  const r = await grantRunGear(w(2), 987654321, 40);   // w(0) ile AYNI seed
  const satir = await prisma.gearItem.count({ where: { wallet: w(2) } });
  check('ikinci oyuncu da parçalarını ALDI', r.items.length === 8, `${r.items.length}`);
  check('rapor edilen sayı veritabanıyla UYUŞUYOR', satir === r.items.length, `${satir} satır`);
  check('birinci oyuncunun parçaları duruyor',
    (await prisma.gearItem.count({ where: { wallet: w(0) } })) === 8);
  await prisma.gearItem.deleteMany({ where: { wallet: w(2) } });
}

console.log('\n[3] Çanta tavanı — sığmayan bildiriliyor mu');
{
  // Çantayı doldur
  let toplam = (await listGear(w(1))).items.length;
  let seed = 1;
  while (toplam < GEAR.vaultSize) {
    const r = await grantRunGear(w(1), seed++, 40);
    if (r.items.length === 0 && r.dropped === 0) break;
    toplam += r.items.length;
  }
  const dolu = await prisma.gearItem.count({ where: { wallet: w(1) } });
  check('çanta tavana kadar doldu', dolu === GEAR.vaultSize, `${dolu}/${GEAR.vaultSize}`);

  const tasan = await grantRunGear(w(1), 999999, 40);
  check('dolu çantaya parça EKLENMİYOR', tasan.items.length === 0);
  check('kaç parçanın düştüğü bildiriliyor', tasan.dropped > 0, `${tasan.dropped} parça düştü`);
  const sonra = await prisma.gearItem.count({ where: { wallet: w(1) } });
  check('tavan AŞILMADI', sonra === GEAR.vaultSize, `${sonra}`);
}

console.log('\n[4] ⭐ Takma — yuva başına TEK parça');
{
  // ⚠️ KOŞULLU KONTROL YOK. İlk sürüm "o yuvada 3 parça varsa test et"
  // diyordu ve çalıştığında yuvada 2 parça vardı: eşzamanlılık kontrolü
  // SESSİZCE ATLANDI, test yine yeşil yandı. Veriye bağlı bir kontrol test
  // değildir — burada yeterli veri GARANTİ EDİLİYOR.
  let seed = 5000;
  let yuva = '';
  let ayniYuva: { id: string; slot: string }[] = [];
  for (let i = 0; i < 40 && ayniYuva.length < 3; i++) {
    await grantRunGear(w(2), seed++, 40);
    const v = await listGear(w(2));
    const grup = new Map<string, { id: string; slot: string }[]>();
    for (const it of v.items) {
      if (!grup.has(it.slot)) grup.set(it.slot, []);
      grup.get(it.slot)!.push(it);
    }
    for (const [s, list] of grup) if (list.length >= 3) { yuva = s; ayniYuva = list; break; }
  }
  check('aynı yuvada en az 3 parça toplandı', ayniYuva.length >= 3,
    `'${yuva}' yuvasında ${ayniYuva.length}`);

  await equipGear(w(2), ayniYuva[0].id);
  check('parça takıldı', (await listGear(w(2))).equipped[yuva as 'skull'] === ayniYuva[0].id);

  await equipGear(w(2), ayniYuva[1].id);
  const cur = await listGear(w(2));
  check('yeni parça eskisini ÇIKARDI', cur.equipped[yuva as 'skull'] === ayniYuva[1].id);
  check('yuvada tek takılı parça',
    cur.items.filter((i) => i.slot === yuva && i.equipped).length === 1);

  // ⚠️ EŞZAMANLI TAKMA. Oku-sonra-yaz olsaydı iki parça birden takılı
  // kalabilir ve `equippedBonus` ikisini de toplardı — bedava güç.
  const r = await Promise.all(ayniYuva.slice(0, 3).map((i) =>
    equipGear(w(2), i.id).then(() => true).catch(() => false)));
  const son = await listGear(w(2));
  const takiliSayi = son.items.filter((i) => i.slot === yuva && i.equipped).length;
  console.log(`     3 eşzamanlı takma → ${r.filter(Boolean).length} geçti`);
  check('eşzamanlı takma sonrası yine TEK takılı', takiliSayi === 1, `${takiliSayi}`);

  // Aynı kontrol bonus tarafından da doğrulanmalı: iki takılı parça
  // olsaydı bonus da ikisini toplardı ve sayı sessizce şişerdi.
  const takiliParca = son.items.find((i) => i.slot === yuva && i.equipped)!;
  const b = await equippedBonus(w(2));
  const beklenen = takiliParca.affixes.reduce((m, a) => {
    m[a.stat] = (m[a.stat] ?? 0) + a.value; return m;
  }, {} as Record<string, number>);
  check('bonus TEK parçadan geliyor',
    Object.entries(beklenen).every(([k, v]) => Math.abs((b[k as 'might'] ?? 0) - v) < 1e-6),
    JSON.stringify(b));

  // Sonraki testler w(0) üzerinde çalışıyor — burayı temizle
  await unequipSlot(w(2), yuva);
}

console.log('\n[5] Bonus SUNUCUDAN okunuyor');
{
  // ⚠️ [4] artık w(2) üzerinde çalışıyor; buranın kendi kurulumu olmalı.
  // Önceki hâli [4]'ün bıraktığı duruma güveniyordu ve test sırası
  // değişince çöktü — testler birbirinin artığına yaslanmamalı.
  await equipGear(w(0), (await listGear(w(0))).items[0].id);
  const b = await equippedBonus(w(0));
  check('takılı parçadan bonus çıkıyor', Object.keys(b).length > 0, Object.keys(b).join(', '));

  const v = await listGear(w(0));
  const yuva = Object.keys(v.equipped)[0] as 'skull';
  await unequipSlot(w(0), yuva);
  const bosalan = await listGear(w(0));
  check('çıkarma çalışıyor', !bosalan.equipped[yuva]);

  // ⚠️ `greed` ekipmandan GELMEMELİ — sunucunun nadir-düşüş tavanı onu bilmiyor
  await equipGear(w(0), v.items.find((i) => i.slot === yuva)!.id);
  const b2 = await equippedBonus(w(0));
  check('bonusta greed YOK', !('greed' in b2), Object.keys(b2).join(', '));
}

console.log('\n[6] ⭐ Parçalama — TOZ veriyor, gold DEĞİL');
{
  const goldOnce = (await get(0)).gold;
  const tozOnce = (await get(0)).dust;
  const v = await listGear(w(0));
  const bos = v.items.filter((i) => !i.equipped).slice(0, 3);

  const r = await salvageGear(w(0), bos.map((i) => i.id));
  const sonra = await get(0);
  check('toz arttı', sonra.dust === tozOnce + r.dust, `+${r.dust} toz`);
  // ⚠️ EN ÖNEMLİ KONTROL: gold'a dokunulmadı. Dokunsaydı Wilderness
  // sınırsız tekrarlanabilir bir gold musluğu olurdu.
  check('GOLD DEĞİŞMEDİ', sonra.gold === goldOnce, `${goldOnce} → ${sonra.gold}`);
  check('parçalar silindi', r.removed === bos.length, `${r.removed}`);
}

console.log('\n[7] ⭐ Takılı parça parçalanamıyor + çift parçalama');
{
  const v = await listGear(w(0));
  const takili = v.items.find((i) => i.equipped)!;
  let gecti = true;
  try { await salvageGear(w(0), [takili.id]); } catch { gecti = false; }
  check('TAKILI parça parçalanamıyor', !gecti);
  check('takılı parça hâlâ duruyor',
    (await prisma.gearItem.count({ where: { id: takili.id } })) === 1);

  // ⚠️ AYNI PARÇAYI 5 KEZ AYNI ANDA parçalamak, toz iki kez ödenirse
  // sınırsız toz demek olurdu.
  const bos = (await listGear(w(0))).items.find((i) => !i.equipped)!;
  const tozOnce = (await get(0)).dust;
  const sonuc = await Promise.all([1, 2, 3, 4, 5].map(() =>
    salvageGear(w(0), [bos.id]).then((r) => r.dust).catch(() => 0)));
  const odenen = sonuc.reduce((s, v2) => s + v2, 0);
  const tozSonra = (await get(0)).dust;
  console.log(`     5 eşzamanlı parçalama → ${sonuc.filter(Boolean).length} geçti`);
  check('toz YALNIZCA BİR KEZ ödendi', tozSonra - tozOnce === odenen && sonuc.filter(Boolean).length === 1,
    `+${tozSonra - tozOnce}`);
  check('parça gerçekten silindi',
    (await prisma.gearItem.count({ where: { id: bos.id } })) === 0);
}

console.log('\n[8] Başkasının parçasına dokunulamıyor');
{
  await grantRunGear(w(2), 5150, 20);
  const baskasi = (await listGear(w(2))).items[0];
  let takti = true;
  try { await equipGear(w(0), baskasi.id); } catch { takti = false; }
  check('başkasının parçası TAKILAMIYOR', !takti);

  let parcaladi = true;
  try { await salvageGear(w(0), [baskasi.id]); } catch { parcaladi = false; }
  check('başkasının parçası PARÇALANAMIYOR', !parcaladi);
  check('parça sahibinde duruyor',
    (await prisma.gearItem.count({ where: { id: baskasi.id, wallet: w(2) } })) === 1);
}

console.log('\n[9] Geçersiz girdiler patlatmıyor');
{
  const dene = async (fn: () => Promise<unknown>) => {
    try { await fn(); return 'gecti'; } catch (e) {
      return e instanceof Error && e.constructor.name === 'GearError' ? 'red' : `patladi:${e}`;
    }
  };
  check('bilinmeyen id → red', (await dene(() => equipGear(w(0), 'yok-boyle'))) === 'red');
  check('id yerine sayı → red', (await dene(() => equipGear(w(0), 42))) === 'red');
  check('geçersiz yuva → red', (await dene(() => unequipSlot(w(0), 'kafa'))) === 'red');
  check('boş parçalama listesi → red', (await dene(() => salvageGear(w(0), []))) === 'red');
  check('liste yerine metin → red', (await dene(() => salvageGear(w(0), 'hepsi'))) === 'red');
  check('derinlik 0 → parça yok', (await grantRunGear(w(2), 1, 0)).items.length === 0);
}

await prisma.gearItem.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ EKİPMAN SUNUCUSU SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
