// KIMLIK KARTI MUHRU.
//
// Kart koyde SUREKLI EKRANDA duran tek bilesen. Iki sey onemli:
//   1. KAPALIYKEN MALIYETI SIFIR olmali — surekli duran bir cip her
//      acilista istek atarsa oyunun en gurultulu istemcisi olur.
//   2. GOSTERDIGI HER SEY GERCEKTEN ULASILIYOR olmali. Bu depoda tekrar
//      eden en pahali hata sinifi tam bu: kod calisiyor, veri var, son
//      adimda oluyor (Barrow odulu, pet baglama, anit rutbesi, kasa
//      katkisi). Kartin dort yeni alani da o zincirin ucunda.
//
//   cd frontend && npx tsx src/game/profileCard.test.mts

import fs from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
/** Yorumlar soyuluyor: bir seyden YORUMDA bahsetmek onu yazmak degildir */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const kartHam = oku('src/components/ProfileCard.tsx');
const kart = yorumsuz(kartHam);
const sess = oku('src/lib/gameSession.ts');
const idx = yorumsuz(oku('../backend/src/index.ts'));

console.log('\n=== KIMLIK KARTI ===');

console.log('\n[1] ** KAPALIYKEN MALIYET SIFIR');
{
  /**
   * ⚠️ ASIL KONTROL. Kart koyde her zaman ekranda; kapaliyken de istek
   * atsaydi her oyuncu her oturumda gereksiz yuk uretirdi.
   */
  check('ozet SADECE kart acikken cekiliyor', /if \(!acik \|\| !panelUnlocked/.test(kart));
  check('demo modunda hic cekilmiyor', /panelUnlocked\(getMode\(\)\)/.test(kart));
  // ⚠️ Iptal bayragi: kart hizla acilip kapanirsa gec donen istek
  // cozulmus bir bilesene yazmaya calisirdi.
  check('istek iptal edilebiliyor', /let iptal = false[\s\S]{0,220}iptal = true/.test(kart));

  /**
   * TEK ISTEK: lonca · duello · gorevler ayri ayri cekilseydi kart acilisi
   * uc gidis-donus surerdi.
   */
  const cagrilar = (kart.match(/fetch[A-Z]\w+\(/g) ?? []);
  check('kart TEK uc cagiriyor', cagrilar.length === 1, cagrilar.join(', ') || 'yok');
  check('cagrilan uc /me/card', /fetchCardSummary\(\)/.test(kart));
}

console.log('\n[2] ** ZINCIR: gosterilen her sey GERCEKTEN geliyor');
{
  // Sunucu ucu var mi ve alanlari dolduruyor mu
  check('sunucuda /me/card ucu var', /'\/me\/card'/.test(idx));
  const blok = idx.slice(idx.indexOf("app.get('/me/card'"));
  const g = blok.slice(0, blok.indexOf('}));') + 4);
  check('uc lonca donuyor', /guild: lonca/.test(g));
  check('uc duello puani donuyor', /duelRating/.test(g));
  check('uc gorev ozeti donuyor', /quests:/.test(g));
  // ⚠️ Uc PARALEL cekiyor — sirali olsaydi kart acilisi uc gidis-donus surerdi
  check('uc sorgulari PARALEL cekiyor', /Promise\.all/.test(g));
  // CIFT TARAFLI: blok gercekten bulundu
  check('uc blogu bulundu (kontrol grubu)', g.length > 200, `${g.length} karakter`);

  // Istemci tipi alanlari taniyor mu
  check('istemci tipi lonca taniyor', /guild: \{ tag: string/.test(sess));
  check('istemci tipi gorev taniyor', /quests: \{ done: number/.test(sess));

  // Kart onlari CIZIYOR mu — zincirin son adimi
  check('kart loncayi ciziyor', /ozet\.guild/.test(kart));
  check('kart duello tier\'ini ciziyor', /duelTier\(/.test(kart));
  check('kart gunun gorevlerini ciziyor', /ozet\.quests/.test(kart));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/ozetZZZ/.test(kart + sess + g));
}

console.log('\n[3] BEDAVA ALANLAR SUNUCUYA SORULMUYOR');
{
  /**
   * gold · toz · seri `Progress`te ZATEN duruyor. Bunlari da uctan istemek
   * kartin maliyetini bos yere buyuturdu.
   */
  check('gold dogrudan progress\'ten', /progress\.gold/.test(kart));
  check('toz dogrudan progress\'ten', /progress\.dust/.test(kart));
  check('seri dogrudan progress\'ten', /progress\.streak/.test(kart));
  check('bunlar ozette ARANMIYOR', !/ozet\.(gold|dust|streak)/.test(kart));
}

console.log('\n[4] YARIM VERI CIZILMIYOR');
{
  /**
   * ⚠️ Ozet gelene kadar durus satiri HIC cizilmemeli. Yarim dolu bir satir
   * (lonca var, tier yok) bos bir satirdan daha kafa karistirici; oyuncu
   * "loncam yok mu?" diye sorar.
   */
  check('durus satiri ozet gelmeden cizilmiyor', /\{ozet && \(/.test(kart));
  // Lonca yoksa o kutu hic cikmamali — "[]" gibi bos bir etiket olmaz
  check('loncasiz oyuncuda lonca kutusu yok', /\{ozet\.guild && \(/.test(kart));
  // Istek duserse kart yine calismali (sessiz catch)
  check('istek duserse kart cokmuyor', /catch\(\(\) => \{ \/\* sessiz \*\/ \}\)/.test(kartHam));
}

console.log('\n[5] SERI: "alinacak var" SESSIZ KALMIYOR');
{
  /**
   * Gunluk odulun fark edilmemesinin en kolay yolu kartin sessiz
   * durmasidir. Seri hazirsa kart bunu SOYLEMELI.
   */
  check('seri durumu okunuyor', /streakAvailable\(progress\)/.test(kart));
  check('hazirken ayri metin var', /CLAIM READY/.test(kart));
  // ⚠️ Seri 0 iken cizilmemeli — yeni oyuncuya kazanmadigi bir seyi
  // hatirlatmak yer israfi (kartin kendi kurali, PATHS kutusunda da ayni).
  check('seri 0 iken cizilmiyor', /seri > 0 &&/.test(kart));
}

console.log('\n[6] KART HALA DAR EKRANA SIGIYOR');
{
  /**
   * ⚠️ Kartin genisligini SARMALAYICI belirliyor (`play/page.tsx`), kart
   * degil — 1134 px'de navbarin ustune biniyordu ve o yuzden boyle kuruldu.
   * Yeni satirlar o kurali bozmamali: hicbiri sabit genislik vermemeli.
   */
  check('kart sabit genislik dayatmiyor', !/width:\s*\d{3}/.test(kart));
  check('kutular esnek (flex 1 1 0)', /flex: '1 1 0'/.test(kart));
  // Satir basina en fazla 3 kutu: 214 px'de 4 kutu okunmaz hale gelir
  const satirlar = kartHam.split('<div style={{ display: \'flex\', gap: 4');
  const enCok = Math.max(0, ...satirlar.slice(1).map((b) => (b.slice(0, b.indexOf('</div>')).match(/<Kutu/g) ?? []).length));
  check('bir satirda en fazla 3 kutu', enCok <= 3, `en kalabalik satir ${enCok} kutu`);
}

console.log(`\n${FAIL.length === 0 ? 'KIMLIK KARTI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
