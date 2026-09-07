// MARKET — AÇILIŞ GÜNÜ KORUMASI.
//
// 🔴 NİYE VAR: `/market/buy` bugün KAPALI (503 `token_yok`) ve alım kodu
// henüz yazılmadı. Yazıldığı gün unutulacak şeyler `TOKEN.md` §7'de bir
// KONTROL LİSTESİ olarak duruyor — ama markdown dosyası çalışmaz, kimse
// onu bir testin yerine koyamaz. Bu mühür o listeyi ÇALIŞTIRILABİLİR yapıyor:
// `buyListing` gerçek koda dönüştüğü an, korumalar da zorunlu hale geliyor.
//
// ⚠️ BU DEPONUN KENDİ GEÇMİŞİ UYARIYOR. Kardeş projede (Ghost Hunter) tam
// bu üç kontrol eksikti ve BAŞARISIZ zincir işlemlerinin imzaları kabul
// edilip sahte satın alma yapıldı; iki hesap 42 SOL değerinde sandık
// açtı. Aynı hata burada tekrarlanırsa bedeli gerçek para olur.
//
// ⚠️ BUGÜN NE ÖLÇÜLEBİLİR, NE ÖLÇÜLEMEZ:
//   ölçülebilir → kapının dürüstçe kapalı olması, şemanın hazır olması,
//                 komisyon matematiği, ileri korumanın devrede olması
//   ölçülemez   → gerçek bir zincir ödemesi (token yok, RPC yok)
// İkincisi açılış günü TESTNET'te denenmeli; bu mühür onun yerini TUTMAZ,
// sadece unutulmasını engeller.
//
//   cd backend && npx tsx src/marketGuard.test.mts

import fs from 'node:fs';
import { FEE, MAX_ACTIVE_LISTINGS, MIN_GOLD, feeSplit, tokenEnabled } from './market.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

/**
 * ⚠️ YORUMLAR SOYULUYOR. İlk sürümde `meta.err` kontrolü, `buyListing`in
 * ÜSTÜNDEKİ GEREKÇE YORUMUNDA o kelime geçtiği için korumasız bir
 * uygulamayı da GEÇİRDİ (enjeksiyonla yakalandı). Yorumda bir korumadan
 * bahsetmek, o korumayı yazmak değildir — bu depoda aynı alet hatası
 * `ossuary` taramasında da çıkmıştı.
 */
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const marketSrcHam = oku('src/market.ts');
const marketSrc = yorumsuz(marketSrcHam);
const indexSrc = oku('src/index.ts');
const schemaSrc = oku('prisma/schema.prisma');

/**
 * Alım hâlâ taslak mı? Tek ölçüt: `buyListing` `token_yok` fırlatıyor mu.
 * ⚠️ Bu tespit yanlış olursa mühür sessizce gevşer, o yüzden aşağıda ayrıca
 * uç davranışı da yoklanıyor.
 */
const alimKapali = /export async function buyListing\(\): Promise<never>/.test(marketSrc)
  && /throw new MarketError\('token_yok', 503\)/.test(marketSrc);

console.log('\n═══ MARKET AÇILIŞ KORUMASI ═══');
console.log(`     alım durumu: ${alimKapali ? 'KAPALI (taslak)' : 'AÇIK — ileri korumalar ZORUNLU'}`);
console.log(`     TOKEN_MINT : ${tokenEnabled() ? 'tanımlı' : 'tanımsız'}`);

console.log('\n[1] KAPI DÜRÜSTÇE KAPALI');
{
  /**
   * ⚠️ Sahte bir "satın al" düğmesi göstermek, oyuncuyu olmayan bir işleme
   * sokmaktır. Kapalıysa hem sunucu hem arayüz bunu SÖYLEMELİ.
   */
  check('sunucu /market/buy 503 dönüyor', /'\/market\/buy'[\s\S]{0,220}token_yok/.test(indexSrc));

  const panel = oku('../frontend/src/components/MarketPanel.tsx');
  check('arayüz token durumunu okuyor', /tokenEnabled/.test(panel));
  check('arayüz oyuncuya "henüz alınamaz" diyor',
    /has not launched yet|until the token exists/.test(panel));
  // ⚠️ İptalin her zaman mümkün olduğu SÖYLENMELİ: gold escrow'da kilitli ve
  // oyuncu geri alamayacağını sanırsa hiç ilan açmaz.
  check('arayüz iptalin serbest olduğunu söylüyor', /Cancel any listing/i.test(panel));
}

console.log('\n[2] ŞEMA AÇILIŞ GÜNÜ İÇİN HAZIR');
{
  /**
   * 🔴 `paymentSig @unique` ÇİFT HARCAMA KALKANI. Olmadan aynı zincir ödemesi
   * iki farklı ilanı kapatabilirdi — veritabanı seviyesinde engellenmeli,
   * uygulama kodunda değil: kod yarışabilir, benzersiz indeks yarışmaz.
   */
  check('paymentSig @unique', /paymentSig\s+String\?\s+@unique/.test(schemaSrc));
  check('alıcı cüzdanı saklanıyor', /buyer\s+String\?/.test(schemaSrc));
  check('fiyat BigInt (kayan nokta YOK)', /priceGrave\s+BigInt/.test(schemaSrc));
  // ⚠️ Kayan nokta bir token miktarında yuvarlama hatası demek; en küçük
  // birimde tam sayı tutmak tek doğru yol.
  check('gold tam sayı', /goldAmount\s+Int/.test(schemaSrc));
}

console.log('\n[3] ⭐ İLERİ KORUMA — alım yazıldığı gün ZORUNLU olanlar');
{
  /**
   * 🔴 MÜHRÜN ASIL İŞİ BU. `buyListing` gerçek koda dönüştüğü an aşağıdaki
   * kontroller kaynakta GÖRÜNMEK ZORUNDA. Görünmezse mühür kırmızı verir ve
   * `TOKEN.md` §7 listesi bir daha "sonra bakarız" olamaz.
   *
   * ⚠️ Kaynak taraması kusursuz bir kanıt değil — kontrolün VARLIĞINI ölçer,
   * DOĞRULUĞUNU değil. Doğruluk açılış günü testnet'te denenmeli. Ama
   * "hiç yazılmamış olması" en pahalı hata ve bu onu yakalar.
   */
  if (alimKapali) {
    console.log('     (alım kapalı — bu bölüm alım açıldığında devreye girer)');
    check('taslak açıkça `token_yok` fırlatıyor', true, 'ileri koruma armed');
    // ⚠️ Gerekçe metni kodda DURMALI: silinirse yazacak kişi neyi
    // atlamaması gerektiğini bilemez.
    // ⚠️ Bu kontrol HAM metne bakıyor — burada aranan şey zaten YORUM.
    check('gerekçe kodda yazılı (meta.err · mint · imza)',
      /meta\.err/.test(marketSrcHam) && /paymentSig/.test(marketSrcHam));
  } else {
    // ─── ALIM AÇIK: üç kontrol de kaynakta olmalı ───
    check('1. başarısız işlem reddediliyor (meta.err)',
      /meta\??\.err/.test(marketSrc), 'BAŞARISIZ İŞLEM DE İMZA ÜRETİR');
    check('2. mint/alıcı/miktar doğrulanıyor',
      /TOKEN_MINT|mint/.test(marketSrc) && /priceGrave|toSeller/.test(marketSrc));
    check('3. imza tek kullanımlık (paymentSig yazılıyor)',
      /paymentSig:/.test(marketSrc));
    check('4. gold devri ve kapanış AYNI transaction\'da',
      /\$transaction/.test(marketSrc));
    /**
     * ⚠️ EŞİK KONTROLÜ /market/list'te var, /market/buy'a KOPYALANMALI —
     * kod içinde uyarı olarak duruyor ve `TOKEN.md` §7'de madde.
     */
    const buyBlok = indexSrc.slice(indexSrc.indexOf("'/market/buy'"));
    check('5. hold-to-play eşiği alım ucuna da kopyalandı',
      /esikKontrol/.test(buyBlok.slice(0, 1200)));
  }
}

console.log('\n[4] KOMİSYON MATEMATİĞİ');
{
  check('toplam = yakım + hazine',
    FEE.totalBps === FEE.burnBps + FEE.treasuryBps,
    `${FEE.totalBps} = ${FEE.burnBps} + ${FEE.treasuryBps}`);
  check('komisyon makul (%1-10)', FEE.totalBps >= 100 && FEE.totalBps <= 1000,
    `%${FEE.totalBps / 100}`);

  for (const fiyat of [1000n, 999n, 1n, 10n ** 12n]) {
    const f = feeSplit(fiyat);
    /**
     * 🔴 EN KRİTİK DEĞİŞMEZ: hiçbir kuruş KAYBOLMAMALI ve YARATILMAMALI.
     * Tam sayı bölmesinde yuvarlama artığı sessizce buharlaşabilirdi;
     * `treasury = total - burn` tam bu yüzden çıkarmayla hesaplanıyor.
     */
    if (f.toSeller + f.burn + f.treasury !== fiyat) {
      FAIL.push(`komisyon toplamı tutmuyor (${fiyat})`);
    }
    if (f.toSeller < 0n || f.burn < 0n || f.treasury < 0n) {
      FAIL.push(`negatif pay (${fiyat})`);
    }
  }
  check('satıcı + yakım + hazine = fiyat (kuruş kaybı yok)',
    !FAIL.some((f) => f.startsWith('komisyon toplamı')));
  check('hiçbir pay negatif değil', !FAIL.some((f) => f.startsWith('negatif pay')));
  // ⚠️ 1 birimlik ilanda satıcıya 1 kalmalı — komisyon her şeyi yutmamalı
  check('en küçük fiyatta satıcı payı kalıyor', feeSplit(1n).toSeller === 1n,
    String(feeSplit(1n).toSeller));
}

console.log('\n[5] İLAN SINIRLARI');
{
  // ⚠️ 1 gold'luk ilan spam'i defteri şişirir ve emir defterini okunmaz yapar
  check('en az listeleme miktarı var', MIN_GOLD >= 10, `${MIN_GOLD} gold`);
  check('aktif ilan sınırı var', MAX_ACTIVE_LISTINGS > 0 && MAX_ACTIVE_LISTINGS <= 50,
    `${MAX_ACTIVE_LISTINGS} ilan`);
  // ⚠️ Escrow ATOMİK olmalı — koşullu `updateMany` olmadan iki eşzamanlı
  // ilan aynı gold'u iki kez kilitleyebilirdi (klasik çift harcama).
  check('escrow koşullu updateMany ile alınıyor',
    /updateMany\([\s\S]{0,200}gold:\s*\{\s*gte/.test(marketSrc));
  check('iptal koşullu updateMany ile kapatılıyor',
    /updateMany\([\s\S]{0,200}status:\s*'active'/.test(marketSrc));
  // ⚠️ Defter kaydı AYNI transaction'da: escrow'a giden gold'un nereye
  // gittiği yazılmazsa "gold'um kayboldu" şikâyetinin cevabı olmaz.
  check('escrow defterе yazılıyor', /kind:\s*'market_list'/.test(marketSrc));
  check('iptal defterе yazılıyor', /kind:\s*'market_cancel'/.test(marketSrc));
}

console.log(`\n${FAIL.length === 0 ? '✅ MARKET KORUMASI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
