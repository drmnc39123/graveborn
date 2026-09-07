// SOL RAYI — UC MUHRU.
//
// `solPay.test` zincir dogrulamasinin KENDISINI olcuyor. Bu dosya rayin
// KURULUSUNU olcuyor: hangi urunler acik, sira dogru mu, ve akista imza
// mesaji var mi.
//
// 🔴 IKI KURAL BU DOSYADA YASIYOR:
//
//   1. RAY GUC SATMAZ. Forge · Stall · Gear · Paths · Binding SOL rayina
//      KAPALI. Olculdu (balance.probe): Forge agaci derinligi 8,2 -> 16,6,
//      kosu gold'unu 268 -> 915 yapiyor. Acilsaydi THE PIT dogrudan
//      pay-to-win olurdu (arena `permanent` = Forge+ekipman+beceri) ve
//      SOL -> Forge -> 3,4x gold -> marketplace -> $GRAVE zinciri kurulurdu.
//
//   2. ODEME AKISINDA IMZA MESAJI YOK. Cuzdan tek bir sey soruyor: duz bir
//      SOL transferi. Araya "odemeyi onayla" diye bir metin imzalatmak
//      cuzdanlarin supheli site uyarisini tetikliyor ve oyuncu tam odeme
//      aninda cikiyor. Ek imza zaten hicbir sey kanitlamazdi: kim oldugumuz
//      oturum jetonuyla belli, odemenin sahibi ZINCIRDEN okunuyor.
//
//   cd backend && npx tsx src/solRail.test.mts

import fs from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
/** Yorumlar soyuluyor: bir korumadan YORUMDA bahsetmek onu yazmak degildir */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const idxHam = oku('src/index.ts');
const idx = yorumsuz(idxHam);

console.log('\n=== SOL RAYI - UCLAR ===');

console.log('\n[1] ** RAY GUC SATMIYOR');
{
  /**
   * Bir gun biri "Forge'a da koyalim" derse bu satir kirmizi verecek ve
   * gerekcesi dosyanin basliginda yazili olacak. Karar degisirse bilerek
   * degisir, kazara degil.
   */
  const yasak = ['/forge/', '/charm/', '/gear/', '/skills/', '/pets/'];
  const acik = [...idx.matchAll(/app\.post\('([^']*-sol)'/g)].map((m) => m[1]);
  console.log(`     SOL ucları: ${acik.join(' · ')}`);
  const ihlal = acik.filter((u) => yasak.some((y) => u.startsWith(y)));
  check('guc satan hicbir uc SOL rayinda degil', ihlal.length === 0, ihlal.join(', '));

  // CIFT TARAFLI: tarama gercekten SOL uclarini buluyor mu
  check('tarama SOL uclarini buluyor (kontrol grubu)', acik.length >= 4, `${acik.length} uc`);

  // Fiyat kaynagi da guc satmamali: solPrice yalnizca izinli urunlerde
  const izinli = ['reliquary10', 'ossuary', 'guild', 'guild_up'];
  const urunler = [...idx.matchAll(/solAlim\(req, res, '(\w+)'/g)].map((m) => m[1]);
  check('her SOL urunu izinli listede', urunler.every((u) => izinli.includes(u)),
    urunler.join(' · '));
}

console.log('\n[2] ** ODEME AKISINDA IMZA MESAJI YOK');
{
  /**
   * Kullanici kurali (2026-09-08): "direkt transfer asamasi olucak yani
   * imza mesajlari gormeden son asamaya gecmesi lazim aksi takdirde
   * tehlikeli site uyarisi veriyor".
   */
  const lib = oku('../frontend/src/lib/solPay.ts');
  check('istemci odeme yolu signMessage CAGIRMIYOR',
    !/signMessage|imzala\(/.test(yorumsuz(lib)));
  check('istemci signAndSendTransaction kullaniyor', /odemeGonder/.test(lib));
  // signTransaction DEGIL: imzali islemi zincire biz yollarsak "cuzdan
  // imzaladi ama yayin dustu" durumu oyuncunun parasini belirsiz birakir.
  check('signTransaction (tek basina) kullanilmiyor',
    !/\bsignTransaction\b/.test(yorumsuz(lib)));

  const w = yorumsuz(oku('../frontend/src/lib/wallets.ts'));
  check('cuzdan katmani signAndSendTransaction sunuyor',
    /solana:signAndSendTransaction/.test(w));
  // ⚠️ Odeme yetenegi GIRIS icin sart olmamali: bir cuzdani sirf odeme
  // yapamiyor diye giristen de engellemek oyunun tamamini kapatirdi.
  /**
   * ⚠️ ALET HATASI DUZELTILDI: ilk surum `standartUygun` govdesinde duz
   * "signMessage" metni ariyordu; fonksiyon SABIT kullaniyor (`SIGN`) ve
   * tarama yorumlari da soyuyor. Yani kontrol OLMAYAN bir hata bulmustu.
   * Dogru olcut: uygunluk SIGN'a bakiyor, SEND'e BAKMIYOR.
   */
  const uygun = w.slice(w.indexOf('export function standartUygun'));
  const govdeU = uygun.slice(0, uygun.indexOf('\n}'));
  check('giris uygunlugu imza yetenegine bakiyor', /\[SIGN\]/.test(govdeU), govdeU.trim().slice(-60));
  check('giris uygunlugu ODEME yetenegine BAKMIYOR', !/\[SEND\]/.test(govdeU));
}

console.log('\n[3] ** SIRA: dogrula -> imzayi yaz -> urunu ver');
{
  /**
   * Imza kaydi urunu vermeden ONCE ve veritabani benzersiz indeksiyle
   * olmali. Tersi olsaydi ayni imzayla iki eszamanli istek ikisi de urunu
   * alir, sonra biri yazarken duserdi.
   */
  const govde = idx.slice(idx.indexOf('async function solAlim'));
  const g = govde.slice(0, govde.indexOf('\n}\n'));
  const iDogrula = g.indexOf('odemeDogrula');
  const iYaz = g.indexOf('payment.create');
  const iVer = g.indexOf('await ver(');
  check('once zincir dogrulamasi', iDogrula > 0 && iDogrula < iYaz);
  check('sonra imza kaydi (urunden ONCE)', iYaz > 0 && iYaz < iVer);
  check('en son urun', iVer > 0);
  check('benzersiz kisit ihlali 409 donuyor', /imza_kullanilmis/.test(g));
  check('urun verilemezse kayit SILINMIYOR',
    !/payment\.delete/.test(g) && /urun_verilemedi/.test(g));
}

console.log('\n[4] FIYAT SUNUCUDA');
{
  // Istemciden tutar alinsaydi L60'taki oyuncu L1 fiyatini gonderirdi.
  check('istemciden lamports OKUNMUYOR',
    !/body[\s\S]{0,40}lamports|lamports[\s\S]{0,20}req\.body/.test(idx));
  /**
   * ⚠️ KUR KALDIRILDI (kullanici karari 2026-09-08): fiyatlar artik duz bir
   * listeden (`SOL_PRICES`) ve anit basamakli (`ossuarySolPrice`) geliyor.
   * Olcut degismedi: fiyat SUNUCUDA turetiliyor mu.
   */
  check('fiyat solPrice/ossuarySolPrice ile turetiliyor',
    (idx.match(/solPrice\(/g) ?? []).length >= 4);
  check('odeme oncesi yoklama ucu var (/sol/quote)', /'\/sol\/quote'/.test(idx));
  check('quote fiyati da ayni fonksiyonlardan veriyor',
    /\/sol\/quote'[\s\S]{0,2500}solPrice\(/.test(idx));
  // ⚠️ Kur kavrami sunucuya da geri sizmamali
  check('sunucuda kur kalmadi', !/goldToLamports|goldPerSol|solCost\(/.test(idx));
}

console.log('\n[5] KAPI VE SINIRLAR');
{
  check('ray kapaliyken 503', /solRayiAcik\(\)[\s\S]{0,80}sol_kapali/.test(idx));
  // Her deneme bir RPC okumasi tetikliyor; sinirsiz birakmak ozel
  // saglayici kotasini yakmanin en ucuz yolu olurdu.
  for (const yol of ['/sol/quote', '/sol/blockhash', '/reliquary/pull-sol',
    '/ossuary/raise-sol', '/guild/create-sol', '/guild/upgrade-sol']) {
    check(`${yol} hiz sinirinda`, new RegExp(`'${yol}'`).test(
      idx.slice(idx.indexOf('paraLimiti'), idx.indexOf('app.use(yol, paraLimiti)'))));
  }
}

console.log('\n[6] SOL ALIMI GOLD EKONOMISINE DOKUNMUYOR');
{
  /**
   * `/admin/economy` musluk/sink dengesini deftere bakarak olcuyor.
   * SOL alimi deftere gold yazsaydi o denge yalan soylerdi. Gercek para
   * `Payment` tablosunda; iki defter bilerek ayri.
   */
  /**
   * ⚠️ ALET HATASI DUZELTILDI: dilim `'/reliquary/pull-sol'` metninin ILK
   * gecisinden basliyordu ve o gecis HIZ SINIRI LISTESI (satir ~131) —
   * yani dilim butun gold uclarini da kapsiyor, `gold: -cost` bulup
   * OLMAYAN bir hata raporluyordu. Dogru capa `app.post(...)`.
   */
  const solBlok = idx.slice(idx.indexOf("app.post('/reliquary/pull-sol'"),
    idx.indexOf("app.get('/worldboss'"));
  const golds = [...solBlok.matchAll(/kind:\s*'\w+',\s*gold:\s*(-?[\w.]+)/g)].map((m) => m[1]);
  check('SOL uclarinin defter kayitlari gold: 0', golds.every((g) => g === '0'),
    golds.join(', ') || 'kayit yok');
  check('SOL blogu gercekten tarandi (kontrol grubu)', golds.length >= 2, `${golds.length} kayit`);
}

console.log(`\n${FAIL.length === 0 ? 'SOL RAYI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
