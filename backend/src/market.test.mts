// MARKETPLACE ESCROW TESTİ — ekonominin ikinci can damarı.
//
// Kural: ilan açılınca gold satıcının bakiyesinden DÜŞÜLÜR. Düşmezse oyuncu
// aynı gold'u hem satışa koyar hem Forge'da harcar — yoktan gold üretmenin
// en kolay yolu budur. Gold markette token karşılığı satılacağı için bu
// doğrudan para basmak demektir.
//
// Çalıştır:  npx tsx src/market.test.mts

import { prisma } from './db.js';
import {
  MAX_ACTIVE_LISTINGS, MIN_GOLD, MarketError, cancelListing, createListing,
  escrowedGold, feeSplit, listActive, listMine,
} from './market.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

async function expectFail(label: string, fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
    check(label, false, 'hata BEKLENIYORDU ama geçti');
  } catch (e) {
    const got = e instanceof MarketError ? e.code : String(e);
    check(label, got === code, got);
  }
}

const W = `TEST_MKT_${Date.now()}`;
const gold = async () => (await prisma.player.findUniqueOrThrow({ where: { wallet: W } })).gold;

await prisma.player.create({ data: { wallet: W, gold: 1000 } });

// ── 1) Escrow gerçekten düşüyor mu ──
console.log('\n[1] Escrow');
{
  const before = await gold();
  const l = await createListing(W, 300, 1_000_000n);
  const after = await gold();
  check('ilan açılınca gold bakiyeden DÜŞÜYOR', after === before - 300, `${before} → ${after}`);
  check('escrow toplamı doğru', (await escrowedGold(W)) === 300, `${await escrowedGold(W)}`);
  check('ilan aktif', l.status === 'active');

  // ⭐ ÇİFT HARCAMA: escrow'daki gold hâlâ harcanabiliyor mu?
  await expectFail('escrow\'daki gold TEKRAR listelenemiyor',
    () => createListing(W, 800, 1n), 'yetersiz_gold');
}

// ── 2) İptal gold'u geri veriyor mu ──
console.log('\n[2] İptal');
{
  const l = await createListing(W, 200, 5_000n);
  const mid = await gold();
  await cancelListing(W, l.id);
  const after = await gold();
  check('iptal gold\'u GERİ VERİYOR', after === mid + 200, `${mid} → ${after}`);
  check('escrow düşüyor', (await escrowedGold(W)) === 300, `${await escrowedGold(W)}`);

  // ⭐ ÇİFT İADE: aynı ilan iki kez iptal edilip gold iki kez geri alınamamalı
  await expectFail('aynı ilan İKİNCİ KEZ iptal edilemiyor',
    () => cancelListing(W, l.id), 'ilan_yok');
  check('çift iade olmadı', (await gold()) === after, `${await gold()}`);
}

// ── 3) Başkasının ilanı ──
console.log('\n[3] Sahiplik');
{
  const other = `TEST_MKT_B_${Date.now()}`;
  await prisma.player.create({ data: { wallet: other, gold: 500 } });
  const mine = await createListing(W, 100, 9n);

  await expectFail('başkasının ilanı İPTAL EDİLEMİYOR',
    () => cancelListing(other, mine.id), 'ilan_yok');
  check('gold başkasına geçmedi', (await prisma.player.findUniqueOrThrow({ where: { wallet: other } })).gold === 500);

  await cancelListing(W, mine.id);
  await prisma.listing.deleteMany({ where: { seller: other } });
  await prisma.player.delete({ where: { wallet: other } });
}

// ── 4) Girdi doğrulama ──
console.log('\n[4] Girdi');
{
  await expectFail('sıfır gold listelenemiyor', () => createListing(W, 0, 10n), 'gecersiz_miktar');
  await expectFail('negatif gold listelenemiyor', () => createListing(W, -100, 10n), 'gecersiz_miktar');
  await expectFail('asgari altı listelenemiyor', () => createListing(W, MIN_GOLD - 1, 10n), 'gecersiz_miktar');
  await expectFail('kesirli gold listelenemiyor', () => createListing(W, 100.5, 10n), 'gecersiz_miktar');
  await expectFail('sıfır fiyat reddediliyor', () => createListing(W, 100, 0n), 'gecersiz_fiyat');
  await expectFail('negatif fiyat reddediliyor', () => createListing(W, 100, -5n), 'gecersiz_fiyat');
  await expectFail('sahip olmadığı gold listelenemiyor',
    () => createListing(W, 999_999, 10n), 'yetersiz_gold');
}

// ── 5) İlan sınırı ──
console.log('\n[5] İlan sınırı');
{
  await prisma.listing.deleteMany({ where: { seller: W } });
  await prisma.player.update({ where: { wallet: W }, data: { gold: 10_000 } });

  for (let i = 0; i < MAX_ACTIVE_LISTINGS; i++) await createListing(W, MIN_GOLD, BigInt(i + 1));
  const aktif = await prisma.listing.count({ where: { seller: W, status: 'active' } });
  check(`${MAX_ACTIVE_LISTINGS} ilan açılabiliyor`, aktif === MAX_ACTIVE_LISTINGS, `${aktif}`);
  await expectFail('sınırın üstüne çıkılamıyor', () => createListing(W, MIN_GOLD, 1n), 'ilan_siniri');

  // İptal edilen ilan sınırı işgal etmemeli
  const first = (await prisma.listing.findFirst({ where: { seller: W, status: 'active' } }))!;
  await cancelListing(W, first.id);
  const ok = await createListing(W, MIN_GOLD, 1n);
  check('iptal sonrası yer açılıyor', ok.status === 'active');
}

// ── 6) Banlı oyuncu ──
console.log('\n[6] Ban');
{
  // ⚠️ Kota kontrolü ban kontrolünden ÖNCE çalışıyor — defter doluyken ban
  // testi yanlışlıkla 'ilan_siniri' ölçerdi. Önce yer aç.
  const room = (await prisma.listing.findFirst({ where: { seller: W, status: 'active' } }))!;
  await cancelListing(W, room.id);

  const before = await gold();
  await prisma.player.update({ where: { wallet: W }, data: { banned: true } });
  await expectFail('banlı oyuncu ilan AÇAMIYOR', () => createListing(W, MIN_GOLD, 1n), 'yetersiz_gold');
  check('banlı oyuncunun gold\'u escrow\'a alınmadı',
    (await gold()) === before, `${before} → ${await gold()}`);
  await prisma.player.update({ where: { wallet: W }, data: { banned: false } });
}

// ── 7) Komisyon matematiği ──
console.log('\n[7] Komisyon');
{
  const f = feeSplit(1_000_000n);
  check('toplam komisyon %5', f.total === 50_000n, `${f.total}`);
  check('yarısı yakılıyor', f.burn === 25_000n, `${f.burn}`);
  check('yarısı hazineye', f.treasury === 25_000n, `${f.treasury}`);
  check('satıcı kalanı alıyor', f.toSeller === 950_000n, `${f.toSeller}`);
  check('parçalar toplamı fiyatı veriyor', f.toSeller + f.burn + f.treasury === 1_000_000n);

  // ⚠️ Kayan nokta YOK: token en küçük birimi 2^53'ü aşabilir
  const big = feeSplit(123_456_789_012_345_678n);
  check('büyük sayıda taşma yok',
    big.toSeller + big.burn + big.treasury === 123_456_789_012_345_678n,
    `${big.toSeller + big.burn + big.treasury}`);
}

// ── 8) Defter görünümü ──
console.log('\n[8] Emir defteri');
{
  const book = await listActive(100, 0);
  check('aktif ilanlar listeleniyor', book.length > 0, `${book.length} ilan`);
  check('fiyat METİN olarak dönüyor (BigInt tuzağı)',
    typeof book[0].priceGrave === 'string', typeof book[0].priceGrave);
  check('kapalı ilanlar defterde YOK',
    book.every((b) => b.status === 'active'));

  const mine = await listMine(W);
  check('kendi ilanlarım (kapalılar dahil) görünüyor',
    mine.some((m) => m.status === 'cancelled'), `${mine.length} kayıt`);
}

// ── 9) YARIŞ KOŞULU — asıl tehlike burada ──
// Sıralı testler geçse bile, iki istek AYNI ANDA gelirse "oku sonra yaz"
// mantığı aynı gold'u iki kez harcatır. Koşullu updateMany'nin bunu
// gerçekten tuttuğunu ölçmeden geçemeyiz.
console.log('\n[9] Eşzamanlılık');
{
  await prisma.listing.deleteMany({ where: { seller: W } });
  await prisma.player.update({ where: { wallet: W }, data: { gold: 300 } });

  // 300 gold var, aynı anda 6 ilan × 100 gold denenir → en fazla 3'ü tutmalı
  const sonuc = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) => createListing(W, 100, BigInt(i + 1))),
  );
  const basarili = sonuc.filter((r) => r.status === 'fulfilled').length;
  const kalan = await gold();
  const escrow = await escrowedGold(W);

  check('eşzamanlı istekler bakiyeyi AŞAMIYOR', basarili <= 3, `${basarili} ilan geçti`);
  check('gold negatife düşmedi', kalan >= 0, `${kalan}`);
  check('escrow + bakiye = başlangıç (gold basılmadı)',
    kalan + escrow === 300, `${kalan} + ${escrow} = ${kalan + escrow}`);
  check('başarılı ilan sayısı escrow ile tutarlı',
    escrow === basarili * 100, `${escrow} vs ${basarili * 100}`);

  // ⭐ Eşzamanlı iptal: aynı ilan 5 kez birden iptal edilirse gold 5 kez dönmemeli
  const l = (await prisma.listing.findFirst({ where: { seller: W, status: 'active' } }))!;
  const iptalOncesi = await gold();
  const iptaller = await Promise.allSettled(
    Array.from({ length: 5 }, () => cancelListing(W, l.id)),
  );
  const iptalGecen = iptaller.filter((r) => r.status === 'fulfilled').length;
  check('eşzamanlı iptalden SADECE biri geçiyor', iptalGecen === 1, `${iptalGecen} iptal geçti`);
  check('gold tam bir kez iade edildi',
    (await gold()) === iptalOncesi + 100, `${iptalOncesi} → ${await gold()}`);
}

// ── temizlik ──
await prisma.listing.deleteMany({ where: { seller: W } });
await prisma.player.delete({ where: { wallet: W } });

console.log(`\n${FAIL.length === 0 ? '✅ MARKET ESCROW SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
