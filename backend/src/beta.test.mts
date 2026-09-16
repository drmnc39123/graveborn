// BETA CUZDAN KAYDI TESTI — kapanis hediyesinin dayanagi.
//
// 🔴 NIYE VAR (2026-09-16): "beta'da cuzdan baglayip oynayan herkese acilista
// hediye" sozu HALKA ACIK verildi. O sozun dayanagi `Player` satirlariydi ve
// `betaSifirla()` o tablonun TAMAMINI siliyor — yani soz verildigi haliyle,
// sifirlama aninda kimin hak ettigi bilgisi de yok oluyordu.
//
// Olculen sey tek cumle: KAYIT, OYUNCU SATIRI SILINDIKTEN SONRA DA DURUYOR MU.
//
// Calistir:  npx tsx src/beta.test.mts

import { betaAnlikGoruntu, betaCuzdanlari } from './beta.js';
import { betaSifirla } from './admin.js';
import { prisma } from './db.js';
import crypto from 'node:crypto';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_BETA_${Date.now()}`;
const oynayan = `${P}_oynayan`;
const bosta = `${P}_bosta`;
const banli = `${P}_banli`;
const hepsi = [oynayan, bosta, banli];

const kosu = (wallet: string, kapali: boolean) => ({
  id: crypto.randomUUID(), wallet, seed: 7n, mode: 'campaign', stageId: 1, hero: 'warrior',
  startedAt: new Date(), claimedAt: kapali ? new Date() : null,
});

try {
  await prisma.player.createMany({
    data: [
      { wallet: oynayan, gold: 0, name: `${P}_ad`.slice(0, 16) },
      { wallet: bosta, gold: 0 },
      { wallet: banli, gold: 0, banned: true },
    ],
  });
  // oynayan: 2 kapanmis + 1 acik kosu · bosta: yalniz ACIK kosu (oynamis sayilmaz)
  await prisma.run.createMany({
    data: [kosu(oynayan, true), kosu(oynayan, true), kosu(oynayan, false), kosu(bosta, false)],
  });

  console.log('\n[1] Anlik goruntu');
  {
    const out = await betaAnlikGoruntu();
    check('kayit alindi', out.kaydedilen >= 3, `${out.kaydedilen} cuzdan`);
    const o = await prisma.betaWallet.findUniqueOrThrow({ where: { wallet: oynayan } });
    check('oynayanin KAPANMIS kosu sayisi yazildi (acik kosu sayilmiyor)', o.runs === 2, `${o.runs}`);
    check('adi da yazildi', o.name === `${P}_ad`.slice(0, 16), `${o.name}`);
    const b = await prisma.betaWallet.findUniqueOrThrow({ where: { wallet: bosta } });
    check('hic oynamayan da KAYDA GIRIYOR (hak edis karari dagitimda)', b.runs === 0);
    const y = await prisma.betaWallet.findUniqueOrThrow({ where: { wallet: banli } });
    check('banli da kayitli ama isaretli', y.banned === true);
  }

  console.log('\n[2] Tekrar calistirmak bozmuyor');
  {
    const ilk = await prisma.betaWallet.findUniqueOrThrow({ where: { wallet: oynayan } });
    // Hediye gonderilmis gibi damgala — ikinci goruntu bunu EZMEMELI
    await prisma.betaWallet.update({ where: { wallet: oynayan }, data: { giftSentAt: new Date() } });
    await prisma.run.create({ data: kosu(oynayan, true) });   // yeni bir kosu daha
    await betaAnlikGoruntu();
    const ikinci = await prisma.betaWallet.findUniqueOrThrow({ where: { wallet: oynayan } });
    check('satir COGALMADI (idempotent)',
      (await prisma.betaWallet.count({ where: { wallet: oynayan } })) === 1);
    check('ilk gorulme KORUNDU', ikinci.firstSeen.getTime() === ilk.firstSeen.getTime());
    check('kosu sayisi ILERLEDI', ikinci.runs === 3, `${ilk.runs} → ${ikinci.runs}`);
    check('HEDIYE DAMGASI EZILMEDI (iki kez gonderim olmaz)', ikinci.giftSentAt !== null);
  }

  console.log('\n[3] Panel ozeti');
  {
    const liste = await betaCuzdanlari(200);
    const bizim = liste.rows.filter((r) => r.wallet.startsWith(P));
    check('panel listesi bizim cuzdanlari goruyor', bizim.length === 3, `${bizim.length}`);
    check('sayaclar dolu', liste.toplam >= 3 && liste.oynayan >= 1 && liste.banli >= 1,
      `toplam ${liste.toplam} · oynayan ${liste.oynayan} · banli ${liste.banli}`);
  }

  console.log('\n[4] ⭐ OYUNCU SATIRI SILININCE KAYIT AYAKTA (sifirlamanin taklidi)');
  {
    // `betaSifirla` TUM oyunculari siliyor; burada yalniz kendi test
    // cuzdanlarimizi siliyoruz — ayni yikici etki, paylasilan veritabanina
    // zarar vermeden. Kayit `Player`a FK ile BAGLI OLMADIGI icin kalmali.
    await prisma.run.deleteMany({ where: { wallet: { in: hepsi } } });
    await prisma.player.deleteMany({ where: { wallet: { in: hepsi } } });
    const kalan = await prisma.betaWallet.count({ where: { wallet: { in: hepsi } } });
    check('oyuncular gitti, beta kaydi DURUYOR', kalan === 3, `${kalan}/3`);
    const o = await prisma.betaWallet.findUniqueOrThrow({ where: { wallet: oynayan } });
    check('cuzdan, ad ve kosu sayisi hala okunabiliyor',
      o.wallet === oynayan && o.runs === 3, `${o.wallet.slice(0, 12)} · ${o.runs} kosu`);
  }

  console.log('\n[5] Kuru calistirma kac cuzdan kaydedilecegini soyluyor');
  {
    const sayim = await betaSifirla(false);
    check('kuru calistirmada beta sayisi raporlaniyor',
      typeof sayim.betaCuzdanKaydi === 'number', `${sayim.betaCuzdanKaydi}`);
    check('kuru calistirma HICBIR SEY SILMEDI (kontrol)',
      (await prisma.player.count()) === sayim.players, `${sayim.players} oyuncu duruyor`);
  }
} finally {
  await prisma.betaWallet.deleteMany({ where: { wallet: { in: hepsi } } });
  await prisma.run.deleteMany({ where: { wallet: { in: hepsi } } });
  await prisma.player.deleteMany({ where: { wallet: { in: hepsi } } });
}

console.log(`\n${FAIL.length === 0 ? '✅ BETA KAYDI SAGLAM' : `❌ ${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
