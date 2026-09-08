// DAVET MUHRU — bot direnci ve cift odeme.
//
// 🔴 BU SISTEMIN TEK GERCEK RISKI BOT CIFTLIGI. Bir cuzdan uretmek
// bedava; bin cuzdan uretmek de bedava. Kayit basina odul veren her
// sistem, en ucuz saldiriya en yuksek odulu verir.
//
// Buradaki tasarim odulu KAYITTAN degil OYNAMAKTAN acilir hale getiriyor:
// davet edilen `ODUL_DERINLIGI` derinligine INMEDEN kimse kurus almaz.
// Bu muhur o kapinin gercekten kapali oldugunu olcuyor — ve ikinci
// olarak, odulun IKI KEZ odenemedigini.
//
//   cd backend && npx tsx src/referral.test.mts

import { prisma } from './db.js';
import {
  KOD_PENCERESI_GUN, ODUL_DERINLIGI, ODUL_TAVANI, ODUL_TOZ, ReferralError,
  kodGir, kodTemizle, kodumu, odulKontrol, referralDurum,
} from './referral.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_REF_${Date.now()}`;
const w = (n: number | string) => `${P}_${n}`;
const yeni = (n: number | string, gunOnce = 0) => prisma.player.create({
  data: {
    wallet: w(n), gold: 0, dust: 0,
    createdAt: new Date(Date.now() - gunOnce * 86_400_000),
  },
});
const toz = async (x: string) =>
  (await prisma.player.findUniqueOrThrow({ where: { wallet: x }, select: { dust: true } })).dust;
const kod = async (f: () => Promise<unknown>) => {
  try { await f(); return null; } catch (e) {
    return e instanceof ReferralError ? e.code : `beklenmeyen: ${String(e).slice(0, 40)}`;
  }
};

console.log('\n=== DAVET ===');
console.log(`     esik d${ODUL_DERINLIGI} · odul ${ODUL_TOZ} toz · tavan ${ODUL_TAVANI} · pencere ${KOD_PENCERESI_GUN} gun`);

console.log('\n[1] KOD BICIMI');
{
  await yeni('a');
  const k = await kodumu(w('a'));
  check('kod uretiliyor', k.length === 6, k);
  check('kod SABIT — ikinci cagri ayni kodu doner', (await kodumu(w('a'))) === k);
  /**
   * ⚠️ KARISTIRILAN HARFLER YOK. Kod agizdan agiza ve ekran goruntusunden
   * yaziliyor; `0/O` ve `1/I/l` yanlis yazilir ve davet SESSIZCE kaybolur.
   * Kimse "yanlis harf yazdim" diye sikayet etmez, sadece bir daha denemez.
   */
  check('kodda karistirilan harf yok', !/[01OIL]/.test(k), k);
  check('kucuk harf ve bosluk kabul ediliyor', kodTemizle(` ${k.toLowerCase()} `) === k);
  check('yanlis uzunluk reddediliyor', kodTemizle('ABC') === null);
  check('alfabe disi harf reddediliyor', kodTemizle('ABC0EF') === null);
  check('metin olmayan reddediliyor', kodTemizle(null) === null && kodTemizle(42) === null);
}

console.log('\n[2] ** KOD GIRME KURALLARI');
{
  await yeni('b');
  const kA = await kodumu(w('a'));

  // ⚠️ EN UCUZ SOMURU: kendi kodunu girmek
  check('kendi kodun reddediliyor',
    (await kod(() => kodGir(w('a'), kA))) === 'kendi_kodun');

  check('gecerli kod giriliyor', (await kod(() => kodGir(w('b'), kA))) === null);
  // ⚠️ BIR KEZ: davet bir baslangic anidir, sonradan degistirilemez
  check('ikinci kez girilemiyor',
    (await kod(() => kodGir(w('b'), kA))) === 'zaten_girildi');
  check('olmayan kod 404', (await kod(() => kodGir(w('a'), 'ZZZZZZ'))) === 'kod_bulunamadi');

  /**
   * ⚠️ PENCERE SART. Olmadan, yillardir oynayan iki oyuncu birbirinin
   * kodunu girip odulu paylasirdi — davet olmayan bir "davet".
   */
  await yeni('eski', KOD_PENCERESI_GUN + 2);
  check('pencere kapaliysa reddediliyor',
    (await kod(() => kodGir(w('eski'), kA))) === 'pencere_kapandi');
  // CIFT TARAFLI: pencere icindeki hesap GECMELI
  await yeni('taze', KOD_PENCERESI_GUN - 1);
  check('pencere icinde geciyor (kontrol grubu)',
    (await kod(() => kodGir(w('taze'), kA))) === null);
}

console.log('\n[3] ** ODUL KAYITTAN DEGIL OYNAMAKTAN ACILIYOR');
{
  /**
   * 🔴 SISTEMIN BEL KEMIGI. Kod girildi ama kimse oynamadi: kimse kurus
   * almamali. Bot ciftliginin ucuz oldugu yer tam burasi.
   */
  const oncekiA = await toz(w('a'));
  const oncekiB = await toz(w('b'));
  check('kod girmek TEK BASINA odul VERMIYOR',
    oncekiA === 0 && oncekiB === 0, `A=${oncekiA} B=${oncekiB}`);

  // ⚠️ Esigin ALTINDA hala odul yok
  const sig = await odulKontrol(w('b'), ODUL_DERINLIGI - 1);
  check('esigin altinda odul YOK', !sig.odendi);
  check('esigin altinda toz degismedi',
    (await toz(w('a'))) === 0 && (await toz(w('b'))) === 0);

  // ⭐ Esik gecilince IKI TARAF da alir
  const r = await odulKontrol(w('b'), ODUL_DERINLIGI);
  check('esik gecilince odul VERILIYOR', r.odendi);
  check('davet edilen tozunu aldi', (await toz(w('b'))) === ODUL_TOZ, String(await toz(w('b'))));
  check('davetci tozunu aldi', (await toz(w('a'))) === ODUL_TOZ, String(await toz(w('a'))));
}

console.log('\n[4] ** CIFT ODEME ENGELI');
{
  /**
   * Iki eszamanli kosu kapanisi odulu IKI KEZ odeyebilirdi. Bayrak
   * kosullu yaziliyor (`refRewarded: false`), yani yarisi yalniz biri
   * kazanir.
   */
  const once = await toz(w('a'));
  const tekrar = await odulKontrol(w('b'), ODUL_DERINLIGI + 5);
  check('ikinci cagri odemiyor', !tekrar.odendi);
  check('toz artmadi', (await toz(w('a'))) === once, String(await toz(w('a'))));

  // ⭐ ESZAMANLI: bes cagri ayni anda
  await yeni('c');
  await kodGir(w('c'), await kodumu(w('a')));
  const oncekiA = await toz(w('a'));
  const sonuc = await Promise.all(
    Array.from({ length: 5 }, () => odulKontrol(w('c'), ODUL_DERINLIGI)),
  );
  const gecen = sonuc.filter((x) => x.odendi).length;
  check('5 eszamanli cagrinin SADECE 1\'i odedi', gecen === 1, `${gecen} gecti`);
  check('davetciye tam bir kez yazildi',
    (await toz(w('a'))) === oncekiA + ODUL_TOZ, `${await toz(w('a'))}`);
}

console.log('\n[5] DAVETCISI OLMAYAN / YASAKLI');
{
  await yeni('d');
  const r = await odulKontrol(w('d'), ODUL_DERINLIGI + 20);
  check('davetcisi olmayan odul almiyor', !r.odendi);
  check('tozu degismedi', (await toz(w('d'))) === 0);

  // Yasakli davetcinin kodu kabul edilmemeli
  await yeni('ban');
  await prisma.player.update({ where: { wallet: w('ban') }, data: { banned: true } });
  const kBan = await kodumu(w('ban'));
  await yeni('e');
  // ⚠️ "Yok" ile "banli" AYNI cevap: aksi halde kod girisi, hangi
  // cuzdanlarin banli oldugunu sorgulamanin araci olurdu.
  check('yasakli davetcinin kodu "bulunamadi" diyor',
    (await kod(() => kodGir(w('e'), kBan))) === 'kod_bulunamadi');
}

console.log('\n[6] DURUM EKRANI DOGRU SAYIYOR');
{
  const v = await referralDurum(w('a'));
  check('davet sayisi dogru', v.invited >= 2, `${v.invited}`);
  check('odullenen sayisi dogru', v.rewarded >= 2, `${v.rewarded}`);
  check('kendi kodunu gosteriyor', v.code.length === 6);
  // ⚠️ Zaten kod girmis oyuncuya giris kutusu GOSTERILMEMELI: tiklaninca
  // hep hata veren bir kutu, bozuk bir kutudur.
  const vb = await referralDurum(w('b'));
  check('kod girmis oyuncuda giris KAPALI', !vb.canEnter);
  check('kod girmis oyuncu kiminle geldigini goruyor', !!vb.joinedWith, vb.joinedWith ?? '');
  const vd = await referralDurum(w('d'));
  check('kod girmemis taze oyuncuda giris ACIK (cift tarafli)', vd.canEnter);
}

// ── temizlik ──
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? 'DAVET SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
