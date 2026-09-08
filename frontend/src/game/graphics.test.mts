// GRAFİK KADEMESİ MÜHRÜ.
//
// 🔴 NİYE VAR: kademe sistemi, oyunun ÇİZİM katmanına ilk kez "bu kareyi
// atla" diyebilen bir anahtar koydu. Bu iki şeyi birden riske atıyor:
//   1. KUYRUKLAR. `render()` motorun kozmetik kuyruklarını boşaltan TEK
//      yer. Bir kademe kapısı erken `return` ederse dizi sınırsız büyür.
//   2. ADALET. Bir kademe düşmanı ya da düşman mermisini kısarsa, en düşük
//      kademe ya haksız avantaj ya haksız ölüm olur.
//
//   npx tsx src/game/graphics.test.mts

import fs from 'node:fs';
import { STAGES, TICK, weaponById } from './config.js';
import { FORGE, permanentBonus } from './forge.js';
import { Game } from './engine.js';
import { seedFromString } from './rng.js';
import { fleeInput, smartPick } from './simPlayer.js';
import { render } from './render.js';
import { resetFx } from './fx.js';
import { normalizeSettings } from './settings.js';
import { TIER_IDS, applyQuality, guessTier, normalizeTier, profileOf, quality } from './quality.js';
import { KasmaOlcer, ONERI_ESIGI_MS, kareSayilsinMi } from './autoQuality.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const tamForge: Record<string, number> = {};
for (const u of FORGE) tamForge[u.id] = u.maxLevel;

/** Sayan sahte ctx — Node'da gercek canvas yok, cagri hacmi sayiliyor */
function sayanCtx() {
  const c = { path: 0, arc: 0, drawImage: 0, gradient: 0, fillArea: 0 };
  const nope = () => undefined;
  const grad = { addColorStop: nope };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      switch (k) {
        case 'arc': return () => { c.path += 1; c.arc += 1; };
        case 'drawImage': return () => { c.drawImage += 1; };
        case 'createRadialGradient':
        case 'createLinearGradient': return () => { c.gradient += 1; return grad; };
        case 'fillRect': return (_x: number, _y: number, w: number, h: number) => {
          c.path += 1;
          if (Number.isFinite(w) && Number.isFinite(h)) c.fillArea += Math.abs(w * h) / (1280 * 720);
        };
        case 'beginPath': case 'closePath': case 'fill': case 'stroke':
        case 'ellipse': case 'moveTo': case 'lineTo':
        case 'roundRect': case 'strokeRect':
          return () => { c.path += 1; };
        case 'canvas': return { width: 1280, height: 720 };
        default: return typeof k === 'string' ? nope : undefined;
      }
    },
    set() { return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, c };
}

/** Derin, dolu sahne — kademelerin gercekten is yaptigi yer */
function sahne(seed: string, derinlik = 60, saniye = 14): Game {
  const g = new Game(seedFromString(seed), STAGES[0], permanentBonus(tamForge),
    'descent', undefined, derinlik);
  g.setViewport(1280, 720);
  const lost = weaponById('lost');
  if (lost) g.weapons[0] = { def: lost, level: 1, cd: 0 };
  for (let i = 0; i < Math.round(saniye / TICK); i++) {
    let guard = 0;
    while (g.phase === 'levelup' && guard < 64) { g.choose(smartPick(g)); guard += 1; }
    if (g.phase !== 'running') break;
    g.hp = g.stats.maxHp;
    g.setInput(...fleeInput(g));
    g.step();
  }
  return g;
}

console.log('\n=== GRAFIK KADEMESI ===');

console.log('\n[1] ** KADEME CIZMEYI ATLAR, BOSALTMAYI ASLA');
{
  /**
   * 🔴 BURADAKI TEK OLUMCUL HATA SINIFI.
   *
   * `render()` motorun kozmetik kuyruklarini bosaltan TEK yer:
   *   g.arcs      -> drawArcs sonunda length = 0
   *   g.deaths    -> pumpEffects sonunda length = 0
   *   g.hits      -> pumpFx (fx.ts)
   *   g.hurts     -> pumpFx (fx.ts)
   *   g.petBlasts / petStrikes / petWards -> pumpPetFx
   *
   * Bir kademe kapisi bu fonksiyonlardan birini erken `return` ile
   * kapatirsa, o dizi KOSU BOYUNCA sinirsiz buyur: bellek sisirir, sonra
   * her kare uzerinde donulen dizi uzadikca oyun yavaslar. Yani "hizlansin
   * diye" acilan ayar oyunu yavaslatir — ve bu ancak uzun kosularda,
   * teshis edilemez bicimde ortaya cikar.
   *
   * ⚠️ EN DUSUK KADEMEDE olculuyor: kapilarin EN COK kapandigi yer orasi.
   */
  for (const tier of TIER_IDS) {
    applyQuality(tier);
    resetFx();
    const g = sahne(`bosalt-${tier}`);
    const { ctx } = sayanCtx();
    render(ctx, g, 1280, 720, 1, TICK);
    const kalan = {
      arcs: g.arcs.length, deaths: g.deaths.length,
      hits: g.hits.length, hurts: g.hurts.length,
      petBlasts: g.petBlasts.length, petStrikes: g.petStrikes.length,
      petWards: g.petWards.length,
    };
    const dolu = Object.entries(kalan).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`);
    check(`${tier}: render sonrasi TUM kuyruklar bos`, dolu.length === 0,
      dolu.join(' ') || 'hepsi bos');
  }

  /**
   * ⚠️ KONTROL GRUBU: kuyruklar RENDER'DAN ONCE gercekten DOLU muydu?
   * Doluyken bosaldigini gormek sart; bos bir kuyrugun bos kalmasi hicbir
   * sey kanitlamaz ve bu depoda tam olarak o tuzaga bir kez dusuldu.
   */
  applyQuality('ultraLow');
  resetFx();
  const g2 = sahne('bosalt-kontrol');
  const doluydu = g2.deaths.length + g2.hits.length + g2.arcs.length;
  check('render ONCESI kuyruklarda is VARDI (kontrol grubu)', doluydu > 0,
    `${doluydu} kayit`);
}

console.log('\n[2] ** ADALET: DETAY AZALIR, VARLIK ASLA');
{
  /**
   * 🔴 KURALI MEKANIK YAPAN MUHUR.
   *
   * Kademe tablosunda "dusmanlar her kademede ayni gorunur" diye bir SOZ
   * var. Soz, test degildir. Burada AYNI sahne bes kademede ciziliyor ve
   * dusman/mermi cizimlerinin urettigi `arc()` cagrilari sayiliyor:
   * esit olmalilar.
   *
   * ⚠️ BUNU BUGUN OLCEBILIYORUZ CUNKU Node'da sprite yuklenmiyor:
   * `drawActor` false donuyor ve dusmanlar toplu daire (`arc`) yoluna
   * dusuyor. Tarayicida sprite ile cizilirler; sayilabilir olmalarini
   * saglayan sey aletin bu sinirlamasi.
   *
   * ⚠️ AYNI SEED, AYNI ADIM SAYISI: sahne kademeden bagimsiz kurulmali,
   * yoksa olculen sey kademe degil rastgelelik olur.
   */
  const sayilar = TIER_IDS.map((tier) => {
    applyQuality(tier);
    resetFx();
    const g = sahne('adalet');
    const { ctx, c } = sayanCtx();
    render(ctx, g, 1280, 720, 1, TICK);
    return { tier, arc: c.arc, dusman: g.enemies.length, mermi: g.enemyShots.length };
  });
  for (const s of sayilar) {
    console.log(`     ${s.tier.padEnd(9)} ${s.arc} arc · ${s.dusman} dusman · ${s.mermi} dusman mermisi`);
  }
  const dusmanEsit = new Set(sayilar.map((s) => s.dusman)).size === 1;
  check('sahne kademeden BAGIMSIZ kuruldu (ayni dusman sayisi)', dusmanEsit);
  const arcEsit = new Set(sayilar.map((s) => s.arc)).size === 1;
  check('varlik cizimi TUM kademelerde esit (arc sayisi)', arcEsit,
    sayilar.map((s) => s.arc).join(' / '));
  check('sahnede gercekten dusman vardi (kontrol grubu)', sayilar[0].dusman > 20,
    `${sayilar[0].dusman} dusman`);
}

console.log('\n[3] ** KADEMELER GERCEKTEN AZALAN IS');
{
  /**
   * ⚠️ IKI KADEME AYNI ISI GONDERIYORSA O KADEME BIR YALANDIR. Oyuncuya
   * bes secenek gosterip ikisini ayni yapmak, ayarlara olan guveni yer.
   *
   * ⚠️ OLCU BIRIMI `fillArea` (ekran alani), `path` DEGIL. Kademelerin
   * cektigi kollar (sis, vinyet, mesale, cozunurluk) DOLGU HIZINI
   * degistiriyor, cagri sayisini degil — telefondaki darbogaz da o.
   * `path` ile olcseydim kademeler neredeyse esit cikardi ve yanlis
   * sonuca varirdim.
   *
   * ⚠️ COZUNURLUK BURADA GORUNMEZ: `pixelCap` tuvalin arka tamponunu
   * degistiriyor, cizim cagrilarini degil. HD ile ULTRA arasindaki fark
   * bu alette OLCULEMEZ — gercek fps tarayicida olculmeli.
   */
  const isler = TIER_IDS.map((tier) => {
    applyQuality(tier);
    resetFx();
    const g = sahne('is');
    const { ctx, c } = sayanCtx();
    const K = 8;
    for (let i = 0; i < K; i++) render(ctx, g, 1280, 720, 1, TICK);
    return { tier, alan: c.fillArea / K, path: c.path / K };
  });
  for (const i of isler) {
    console.log(`     ${i.tier.padEnd(9)} ${i.alan.toFixed(2)} ekran/kare · ${Math.round(i.path)} path`);
  }
  let artan = true;
  for (let i = 1; i < isler.length; i++) if (isler[i].alan < isler[i - 1].alan - 1e-6) artan = false;
  check('is hacmi ULTRA LOW -> ULTRA azalmayan sirada', artan,
    isler.map((i) => i.alan.toFixed(2)).join(' <= '));
  check('en dusuk ile en yuksek GERCEKTEN farkli',
    isler[isler.length - 1].alan > isler[0].alan + 0.5,
    `${isler[0].alan.toFixed(2)} -> ${isler[isler.length - 1].alan.toFixed(2)}`);
  /**
   * 🔴 KOMSU KADEMELER AYNI OLAMAZ — VE BUNU ALET GOREMEDIGI ICIN
   * PROFILDEN OLCUYORUZ.
   *
   * Yukaridaki tabloda ultraLow ile low ayni alani (4,01), normal/hd/ultra
   * ise ayni alani (6,01) gosteriyor. Bu bir hata DEGIL: aralarindaki fark
   * `renderScale` ve `pixelCap`, ikisi de tuvalin ARKA TAMPONUNU
   * degistiriyor, cizim cagrisini degil — bu alet onlari GOREMEZ.
   *
   * Ama "goremiyorum" ile "fark yok" ayni sey degil. Iki kademenin
   * gercekten farkli oldugunu profilden dogruluyoruz: aksi halde oyuncuya
   * bes secenek gosterip ikisini ayni yapmis olurduk.
   */
  const ayniCift: string[] = [];
  for (let i = 1; i < TIER_IDS.length; i++) {
    const a2 = profileOf(TIER_IDS[i - 1]);
    const b2 = profileOf(TIER_IDS[i]);
    const farkli = (Object.keys(a2) as (keyof typeof a2)[])
      .some((k) => k !== 'tier' && k !== 'label' && k !== 'note' && a2[k] !== b2[k]);
    if (!farkli) ayniCift.push(`${a2.tier}=${b2.tier}`);
  }
  check('komsu kademelerin HEPSI birbirinden farkli', ayniCift.length === 0,
    ayniCift.join(' ') || `${TIER_IDS.length} kademe`);
}

console.log('\n[4] NORMAL = BUGUNKU OYUN');
{
  /**
   * 🔴 Ayarlara hic girmeyen kimsenin oyunu degismemeli. NORMAL profili,
   * kademe sisteminden ONCE kodda yazili olan sayilarin AYNISI olmali.
   */
  const n = profileOf('normal');
  check('pixelCap 2 (eski `Math.min(dpr, 2)`)', n.pixelCap === 2);
  check('renderScale 1 (olcekleme yok)', n.renderScale === 1);
  const fx = fs.readFileSync('src/game/fx.ts', 'utf8');
  check('sparks 96 = fx.CAP.spark', n.sparks === 96 && fx.includes('spark: 96'));
  check('corpses 128 = fx.CAP.corpse', n.corpses === 128 && fx.includes('corpse: 128'));
  const rd = fs.readFileSync('src/game/render.ts', 'utf8');
  check('deathFx 90 = render.MAX_FX', n.deathFx === 90 && rd.includes('const MAX_FX = 90'));
  check('dekor 1 · sis 1 · vinyet 1 (bugunku gorunum)',
    n.decor === 1 && n.fog === 1 && n.vignette === 1);
  check('mesale ve kozmetik aura acik', n.torch && n.cosmeticAura && n.uiMotion);
}

console.log('\n[5] AYAR GOCU — eski tercih kaybolmuyor');
{
  /**
   * 🔴 `lowGraphics: true` secmis oyuncu bunu bir sebeple secti. Goc
   * etmezse bir surumde sessizce yuksek kademeye atlar ve oyunu bozulur.
   */
  check('lowGraphics:true -> low',
    normalizeSettings({ lowGraphics: true } as never).quality === 'low');
  /**
   * ⚠️ `lowGraphics:false` -> `normal`, cihaz TAHMINI degil. O oyuncu bu
   * cihazda zaten bugunku goruntuyu goruyordu; telefonda bile olsa onu
   * LOW'a dusurmek istemedigi bir gerilemedir.
   */
  check('lowGraphics:false -> normal (tahmin DEGIL)',
    normalizeSettings({ lowGraphics: false } as never).quality === 'normal');
  check('acik kademe kaydi korunuyor',
    normalizeSettings({ quality: 'ultra' } as never).quality === 'ultra');
  check('bozuk kademe adi varsayilana dusuyor',
    normalizeSettings({ quality: 'hile' } as never).quality === guessTier());
  check('hic kayit yoksa cihaz tahmini', normalizeSettings({}).quality === guessTier());
  /**
   * 🔴 ILK SURUM BU MUHRU `guessTier() === 'normal'` DIYE YAZDIM VE YANLISTI:
   * Node 21+ `navigator.hardwareConcurrency` TASIYOR. Bu makinede 4 cekirdek
   * var, yani tahmin 'low' donuyor — mühür MAKINEYE BAGIMLI olurdu ve
   * 8 cekirdekli bir makinede yesil, 4 cekirdeklide kirmizi yanardi.
   *
   * Dogru iddia sabit bir deger degil, DAVRANIS SINIRI:
   */
  check('tahmin gecerli bir kademe donuyor', TIER_IDS.includes(guessTier()));
  /**
   * ⚠️ ASLA `ultraLow` TAHMIN ETME. Gereksiz yere cirkin bir ilk izlenim,
   * birkac saniyelik dusuk fps'ten kotudur; oyuncu zaten seciciden inebilir.
   * ⚠️ ASLA YUKARI TAHMIN ETME (`hd`/`ultra`): bilinmeyen bir cihaza en
   * pahali kademeyi vermek, tam da onlemeye calistigimiz seyi yapar.
   */
  check('tahmin ne en dibe ne en tepeye gidiyor',
    guessTier() === 'low' || guessTier() === 'normal', guessTier());
  check('normalizeTier bilinmeyeni yedege dusuruyor', normalizeTier('zzz', 'hd') === 'hd');
  // ⚠️ Alan sayisi degismedi — `settings.test`teki mevcut muhur bunu da olcuyor
  check('ayar alanlari: volume · damageNumbers · music · quality · qualityPicked',
    Object.keys(normalizeSettings({})).length === 5);
  /**
   * ⚠️ ESKI `lowGraphics:true` KAYDI "SECILMIS" SAYILIYOR: o oyuncu zaten
   * bilincli olarak dusuk grafigi acmis. Ona yeniden sormak, verdigi karari
   * gormezden gelmek olurdu.
   */
  check('lowGraphics:true -> secilmis sayiliyor',
    normalizeSettings({ lowGraphics: true } as never).qualityPicked === true);
  check('taze oyuncu secmemis sayiliyor (kontrol grubu)',
    normalizeSettings({}).qualityPicked === false);
}

console.log('\n[6] TEK KAYNAK — secici iki yerde de AYNI bilesen');
{
  /**
   * ⚠️ Ayni kurali iki yere yazmak bu depoda tekrar eden en pahali hata
   * (`lib/stick.ts` zaten bu yuzden var). Kademe secici tek bilesen olmali.
   */
  const panel = fs.readFileSync('src/components/SettingsPanel.tsx', 'utf8');
  check('koy ayarlari QualityPicker kullaniyor', panel.includes('<QualityPicker'));
  /**
   * ⚠️ METNI DEGIL KODU ARIYORUZ: "Less atmosphere" ifadesi artik yalniz
   * ACIKLAMA YORUMUNDA geciyor (neyin yerine gectigini anlatmak icin) ve
   * o yorumun kalmasi DOGRU. Ilk surumde duz metin aradim ve mühür kendi
   * belgelendirmemize kirmizi yakti.
   */
  check('eski lowGraphics anahtari koddan kalkti', !panel.includes('patch({ lowGraphics'));
  check('acilista kademe uygulaniyor', panel.includes('applyQuality('));
  const gc = fs.readFileSync('src/components/GameCanvas.tsx', 'utf8');
  /**
   * 🔴 ZINCIRIN SON ADIMI: kademe degisince tuval yeniden boyutlanmali.
   * Kademedeki her sey modul durumundan okundugu icin canli; COZUNURLUK
   * degil, `canvas.width` yalniz `resize()` icinde yaziliyor. Bu abonelik
   * unutulsaydi oyuncu ULTRA LOW'a basar, sis kapanir, "bir seyler oldu"
   * der — ama en buyuk kol hic cekilmemis olurdu.
   */
  check('kademe degisince tuval yeniden boyutlaniyor',
    gc.includes('onQualityChange(() => resize())'));
  check('cozunurluk kademeden turuyor', gc.includes('q.pixelCap') && gc.includes('q.renderScale'));
  check('iOS tuval alani kelepcesi var', gc.includes('TUVAL_TAVANI'));
  // Kontrol grubu: tarama her seye evet demiyor
  check('uydurma desen bulunmuyor (kontrol grubu)', !gc.includes('qualityZZZ'));

  /**
   * ⚠️ AYNI KADEME PVP'DE DE GECERLI. Duello koludan farkli bir bütçeyle
   * cizilirse ayni cihazda iki farkli deneyim olur ve bu sessizdir.
   */
  for (const f of ['ArenaScreen.tsx', 'HomeAttract.tsx', 'HubCanvas.tsx', 'MenuBackground.tsx']) {
    const src = fs.readFileSync(`src/components/${f}`, 'utf8');
    check(`${f} kademeyi uyguluyor`, src.includes('quality().pixelCap'));
  }
}

console.log('\n[7] ** KASMA OLCERI — olcer, DEGISTIRMEZ');
{
  /**
   * 🔴 KULLANICI KARARI: *"Sadece oner, oyuncu karar versin."* Otomatik
   * dusurme masadaydi ve REDDEDILDI. Bu bolum onerinin ne zaman
   * cikacagini — ve daha onemlisi NE ZAMAN CIKMAYACAGINI — kilitliyor.
   */
  const o = new KasmaOlcer();
  // ⚠️ Pencere dolmadan karar YOK: 5 kareye bakip hukum vermek gurultudur.
  for (let i = 0; i < 50; i++) o.ekle(40);
  check('pencere dolmadan oneri YOK', !o.onerMi(false, false));
  for (let i = 0; i < 200; i++) o.ekle(40);
  check('surekli 40 ms -> ONERIYOR', o.onerMi(false, false));
  check('oneri oturumda BIR KEZ (ikinci cagri sessiz)', !o.onerMi(false, false));

  /**
   * ⚠️ ORTANCA, ORTALAMA DEGIL. Tek bir cop toplama sicramasi ortalamayi
   * ucurur ve OLMAYAN bir kasma bildirir. Ortanca ona kor.
   */
  const o2 = new KasmaOlcer();
  for (let i = 0; i < 130; i++) o2.ekle(10);
  o2.ekle(3000);   // tek devasa sicrama
  check('tek sicrama oneri URETMIYOR (ortanca)', !o2.onerMi(false, false),
    `ortanca ${o2.ortanca()} ms`);

  // ⚠️ Oyuncu elle sectiyse ASLA sorma — cevabini dinlemeyen bir soru,
  // sorunun kendisinden kotudur.
  const o3 = new KasmaOlcer();
  for (let i = 0; i < 130; i++) o3.ekle(60);
  check('elle secmis oyuncuya SORULMUYOR', !o3.onerMi(true, false));
  check('en dusuk kademede SORULMUYOR', !o3.onerMi(false, true));
  // CIFT TARAFLI: ayni olcer, kosullar kalkinca oneriyor
  check('kosullar kalkinca ONERIYOR (cift tarafli)', o3.onerMi(false, false));

  /**
   * 🔴 GIZLI SEKME TUZAGI. Arka plandaki sekmede tarayici `rAF`i saniyede
   * bire dusuruyor — bu depoda 7 kez yanlis teshise yol acmis bir tuzak.
   * Olcmezsek sekmesini degistiren HERKESE "oyunun yavas" derdik.
   */
  const taban = { dtMs: 16, gizli: false, kosuSuresiSn: 10, oynaniyor: true };
  check('normal kare SAYILIYOR', kareSayilsinMi(taban));
  check('gizli sekme SAYILMIYOR', !kareSayilsinMi({ ...taban, gizli: true }));
  check('isinma (ilk 3 sn) SAYILMIYOR', !kareSayilsinMi({ ...taban, kosuSuresiSn: 1 }));
  check('duraklamis kare SAYILMIYOR', !kareSayilsinMi({ ...taban, oynaniyor: false }));
  // ⚠️ Sekme uyanmasi / varlik cozme: oyunun yavasligi degil, olcumun gurultusu
  check('dev sicrama (>100 ms) SAYILMIYOR', !kareSayilsinMi({ ...taban, dtMs: 250 }));
  check('bozuk dt SAYILMIYOR', !kareSayilsinMi({ ...taban, dtMs: NaN }));

  /**
   * ⚠️ ESIK YUVARLAK BIR FPS DEGIL. `MAX_CATCHUP = 2` dt'yi 33,3 ms'e
   * kirpiyor: 30 fps altinda simulasyon kare basina en fazla 2 tick
   * ilerliyor, yani oyun gorunur bicimde AGIR CEKIME giriyor. Esik o
   * ucurumun hemen ustunde durmali — altinda kalirsa oyuncu uyariyi
   * ancak is isten gectikten sonra gorur.
   */
  check('esik agir cekim ucurumunun (33,3 ms) ALTINDA', ONERI_ESIGI_MS < 1000 / 30);
  check('esik 60 fps"i kasma saymiyor', ONERI_ESIGI_MS > 1000 / 60);

  // 🔴 ZINCIRIN SON ADIMI: olcer kosu dongusune GERCEKTEN bagli mi?
  const gc2 = fs.readFileSync('src/components/GameCanvas.tsx', 'utf8');
  check('olcer kosu dongusunde besleniyor', gc2.includes('olcerRef.current.ekle('));
  check('kor pencereler uygulaniyor', gc2.includes('kareSayilsinMi({'));
  check('oneri seridi ciziliyor', gc2.includes('RUNNING BELOW 30 FPS'));
  /**
   * 🔴 OYUN HICBIR SEYI KENDI DEGISTIRMIYOR. `onerMi` yalnizca bir bayrak
   * kaldiriyor; `applyQuality` cagrisi SADECE oyuncunun tikladigi yerde.
   */
  const oneriGovde = gc2.slice(gc2.indexOf('olcerRef.current.onerMi('),
    gc2.indexOf('// fps ölçümü'));
  check('oneri dali kademeyi KENDI DEGISTIRMIYOR', !oneriGovde.includes('applyQuality('),
    oneriGovde.length + ' karakter');
}

console.log(`\n${FAIL.length === 0 ? 'GRAFIK KADEMESI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
