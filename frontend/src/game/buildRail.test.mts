// KOSU ICI BUILD RAYI MUHRU.
//
// 🔴 IKI GERCEK RISK:
//   1. RAY YALAN SOYLEYEBILIR. Kart "DAMAGE 20" yazarken oyuncu Forge'da
//      20 seviye Whetstone almis olabilir — gercek hasar 36'dir. Arayuz
//      kendi hesabini yaparsa `might`/`amount`/`cooldown` gorunmez ve
//      gosterilen sayi SESSIZCE yanlis olur. Bu yuzden sayilar MOTORDAN
//      geliyor ve bu dosya onu olcuyor.
//   2. AYNI KURAL IKI EKRANDA. Evrim esigi hem level-up kartinda hem
//      rayda okunuyor. Bu depoda tam bu kural bir kez ayristi: motorun
//      sarti gevsetildi, kartin ipucu eski kurali anlatmaya devam etti ve
//      "EVOLUTION READY" rozeti HIC gorunmedi.
//
//   cd frontend && npx tsx src/game/buildRail.test.mts

import fs from 'node:fs';
import {
  EVOLUTIONS, EVOLVED, PASSIVES, WEAPONS,
  evrimPasifEsigi, evrimSilahEsigi, weaponById,
} from './config.js';
import { evrimDurumu, evrimMetni, pasifBilgi, pasifDeger, silahArtislari } from './buildInfo.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
/** ⚠️ Yorumlar soyuluyor: bir seyden YORUMDA bahsetmek onu YAPMAK degildir.
 *  Bu tuzaga bu depoda dort kez dusuldu (codex, marketGuard, ossuary, share). */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const rayHam = oku('src/components/BuildRail.tsx');
const ray = yorumsuz(rayHam);
const canvas = yorumsuz(oku('src/components/GameCanvas.tsx'));
const kart = yorumsuz(oku('src/components/LevelUpCard.tsx'));
const motor = yorumsuz(oku('src/game/engine.ts'));
const bilgiHam = oku('src/game/buildInfo.ts');
const bilgi = yorumsuz(bilgiHam);

console.log('\n=== BUILD RAYI ===');

console.log('\n[1] ** SAYILAR MOTORDAN GELIYOR, ARAYUZDE TURETILMIYOR');
{
  /**
   * 🔴 ASIL KONTROL. `weaponDamageAt(def, lv)` `might`i GORMEZ,
   * `weaponCountAt` `amount`i GORMEZ. Ray bunlari kendi cagirsaydi
   * yukseltme almis oyuncuya taban sayilari yazardi.
   */
  check('motorda damageOf var', /damageOf\(w: OwnedWeapon\)/.test(motor));
  check('motorda countOf var', /countOf\(w: OwnedWeapon\)/.test(motor));
  check('damageOf might\'i tasiyan wDamage\'i cagiriyor',
    /damageOf\([\s\S]{0,120}this\.wDamage\(this\.hero, w\)/.test(motor));
  check('countOf amount\'u tasiyan wCount\'u cagiriyor',
    /countOf\([\s\S]{0,120}this\.wCount\(this\.hero, w\)/.test(motor));

  check('HUD anlik goruntusu dmg tasiyor', /dmg: game\.damageOf\(w\)/.test(canvas));
  check('HUD anlik goruntusu count tasiyor', /count: game\.countOf\(w\)/.test(canvas));
  check('HUD gercek beklemeyi tasiyor', /cdMax: game\.cooldownMaxOf\(w\)/.test(canvas));

  // ⚠️ CIFT TARAFLI: ray bu alanlari GERCEKTEN CIZIYOR mu — bu depodaki en
  // pahali hata sinifi tam burada oluyor (veri geliyor, son adimda oluyor).
  check('ray dmg\'i ciziyor', /value=\{String\(Math\.round\(w\.dmg\)\)\}/.test(ray));
  check('ray cdMax\'i ciziyor', /w\.cdMax\.toFixed\(2\)/.test(ray));
  check('ray count\'u ciziyor', /w\.count > 1/.test(ray));

  // ⚠️ Ray hasari/adedi KENDI hesaplamiyor
  check('ray weaponDamageAt cagirmiyor', !/weaponDamageAt/.test(ray));
  check('ray weaponCountAt cagirmiyor', !/weaponCountAt/.test(ray));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/damageZZZ/.test(ray + canvas + motor));
}

console.log('\n[2] ** ESKI DAR SATIR GERCEKTEN GITTI');
{
  /**
   * ⚠️ Kullanicinin sikayeti buydu: 6 silah + 6 pasif + dirilis rozeti
   * `maxWidth: 330` icinde sarmalanan 32 px'lik tek satirda uc siraya
   * kiriliyordu. Yeni ray eklenip eskisi BIRAKILSAYDI ekranda iki kopya
   * olurdu ve kimse fark etmezdi.
   */
  check('canvas artik pasifleri kendi cizmiyor', !/hud\.passives\.map/.test(canvas));
  check('canvas artik silahlari kendi cizmiyor', !/hud\.weapons\.map/.test(canvas));
  check('maxWidth 330 kutusu kalkti', !/maxWidth: 330/.test(canvas));
  check('ray takildi', /<BuildRail weapons=\{hud\.weapons\}/.test(canvas));
  check('raya pasifler de veriliyor', /passives=\{hud\.passives\}/.test(canvas));
  check('dirilis hakki raya tasindi', /revivalLeft=\{hud\.revivalLeft\}/.test(canvas));
  // ⚠️ Can kuresi ve kosu sayaclari YERINDE KALDI — tasinan yalniz build
  check('can kuresi alt solda duruyor', /<Orb pct=\{hpPct \/ 100\}/.test(canvas));
  check('kosu sayaclari duruyor', /gold found/.test(canvas));
}

console.log('\n[3] ** DUSEY VE SOL KENARDA (istegin kendisi)');
{
  check('ray sol kenara sabitli', /position: 'absolute', left: 10/.test(ray));
  check('ray dikeyde ortalanmis', /top: '50%', transform: 'translateY\(-50%\)'/.test(ray));
  check('sutunlar DUSEY', /flexDirection: 'column'/.test(ray));
  // ⚠️ Sarmalama YOK: eski satirin okunmazliginin sebebi tam buydu
  check('ray sarmalamiyor', !/flexWrap/.test(ray));
  // ⚠️ Slot olcegi TAM SAYI olmak zorunda (kit kurali: varlik 16x16)
  const olcekler = [...ray.matchAll(/scale=\{olcek\}/g)].length;
  check('slotlar ortak olcek degiskenini kullaniyor', olcekler >= 2, `${olcekler} yer`);
  check('genis ekranda olcek 3 (48 px)', /dar \? 2 : 3/.test(ray));
}

console.log('\n[4] ** DAR EKRANDA RAY PARMAGI YEMIYOR');
{
  /**
   * 🔴 Sanal joystick canvas'a bagli ve parmagin BASTIGI yer merkez
   * sayiliyor (`lib/stick.ts`). Sol kenarda tiklanabilir bir serit,
   * telefonda sola yurumek isteyen oyuncunun dokunusunu yutardi.
   */
  check('etkilesim dar ekranda kapali', /etkilesim: 'none' \| 'auto' = dar \? 'none' : 'auto'/.test(ray));
  check('satirlar bu bayragi kullaniyor', (ray.match(/pointerEvents: etkilesim/g) ?? []).length >= 2);
  check('sarmalayici hicbir zaman tiklamayi yemiyor',
    /alignItems: 'flex-start', gap: 8,\s*pointerEvents: 'none'/.test(ray));
  // ⚠️ Bilgi karti da imleci YAKALAMAMALI: yakalarsa slotun mouseleave'i
  // tetiklenir, kart kapanir, fare slota doner ve kart titrer.
  check('bilgi karti imleci yakalamiyor', /width: 244, zIndex: 4, pointerEvents: 'none'/.test(ray));
  /**
   * ⚠️ KART RAYIN COCUGU OLMALI, SATIRIN DEGIL. Satirda dururken kart
   * satirin merkezine hizalaniyordu; kart ~320 px ve ray dikeyde ortali
   * oldugu icin EN USTTEKI satirin karti kisa pencerede (500 px) ekranin
   * disina tasiyordu. Satira geri tasinirsa burasi kirmizi verir.
   */
  check('kart satir icinde CIZILMIYOR',
    !/secim === anahtar && <(Silah|Pasif)Karti/.test(ray));
  check('kart ray seviyesinde ciziliyor',
    /\{secilenSilah && <SilahKarti/.test(ray) && /\{secilenPasif && <PasifKarti/.test(ray));
  // ⚠️ Konum artik soylemedigi icin VURGU soylemek zorunda
  check('secili slot vurgulaniyor', (ray.match(/<Vurgu tone=/g) ?? []).length === 2);
  check('canvas dar bayragini veriyor', /dar=\{darHud\}/.test(canvas));
  /**
   * ⚠️ "ACILAMAZ" YETMEZ, "CIZILMEZ" gerekiyor: masaustunde bir slotun
   * ustundeyken pencereyi daraltan oyuncuda secim durumu KALIYORDU ve kart
   * 375 px'de oyun alaninin %65'ini kapatiyordu (tarayicida olculdu).
   */
  check('dar ekranda kart hic cizilmiyor',
    /const secilenSilah = !dar &&/.test(ray) && /const secilenPasif = !dar &&/.test(ray));
}

console.log('\n[5] ** PASIF TOPLAMI DOGRU (yuzde mi duz mu)');
{
  /**
   * ⚠️ Ikinci bir "birim" tablosu YAZILMADI: cevap `STAT_BASE`te duruyor.
   * Tabani 1 olan istatistik carpandir (yuzde), 0 olan duz sayidir.
   */
  const might = PASSIVES.find((p) => p.id === 'bloodmeal')!;   // +%10 hasar
  const armor = PASSIVES.find((p) => p.id === 'boneplate')!;   // +1 zirh
  const rec = PASSIVES.find((p) => p.id === 'slowknit')!;      // +0,2 HP/sn
  const cd = PASSIVES.find((p) => p.id === 'hands')!;          // -%8 bekleme

  check('yuzde istatistik yuzde yaziliyor', pasifDeger(might, 3) === '+30%', pasifDeger(might, 3));
  check('duz istatistik duz yaziliyor', pasifDeger(armor, 3) === '+3', pasifDeger(armor, 3));
  check('iyilesme HP/sn yaziliyor', pasifDeger(rec, 3) === '+0.6 HP/sec', pasifDeger(rec, 3));
  /**
   * ⚠️ BEKLEME AZALIYOR — motor `s.cooldown -= add` yapiyor. "+%24 cooldown"
   * yazmak oyuncuya TERSINI soylerdi.
   */
  check('bekleme EKSI isaretle yaziliyor', pasifDeger(cd, 3).startsWith('−'), pasifDeger(cd, 3));
  // CIFT TARAFLI: kontrol grubu — yuzde olmayan bir sey yuzde cikmamali
  check('duz istatistik yuzde ISARETI TASIMIYOR (kontrol grubu)', !pasifDeger(armor, 3).includes('%'));

  const b = pasifBilgi('bloodmeal', might.maxLevel)!;
  check('max\'ta sonraki seviye YOK', b.maxed && b.sonra === null);
  const b2 = pasifBilgi('bloodmeal', 1)!;
  check('max altinda sonraki seviye VAR (kontrol grubu)', !b2.maxed && b2.sonra === '+20%', String(b2.sonra));
  check('bilinmeyen pasif null donuyor', pasifBilgi('zzz-yok', 1) === null);

  // ⚠️ MOTORLA AYNI KURAL: `recomputeStats` → `perLevel * level`
  check('motor da perLevel * level uyguluyor', /const add = p\.def\.perLevel \* p\.level;/.test(motor));
}

console.log('\n[6] ** EVRIM: TEK KAYNAK, IKI EKRAN');
{
  const ev = EVOLUTIONS[0];
  const def = weaponById(ev.weapon)!;
  const pas = PASSIVES.find((p) => p.id === ev.passive)!;
  const sEsik = evrimSilahEsigi(def);
  const pEsik = evrimPasifEsigi(pas);

  // ESIGIN ALTINDA: iki taraf da TAMAM DEGIL
  const alt = evrimDurumu(ev.weapon, sEsik - 1, [{ id: ev.passive, level: pEsik - 1 }])!;
  check('esik altinda silah tamam DEGIL', !alt.silahTamam);
  check('esik altinda pasif tamam DEGIL', !alt.pasifTamam);
  // ESIKTE: ikisi de TAMAM (cift tarafli)
  const ust = evrimDurumu(ev.weapon, sEsik, [{ id: ev.passive, level: pEsik }])!;
  check('esikte silah TAMAM (cift tarafli)', ust.silahTamam);
  check('esikte pasif TAMAM (cift tarafli)', ust.pasifTamam);
  check('hedef adi gercek evrimli silah', EVOLVED.some((w) => w.name === ust.hedefAd), ust.hedefAd);
  check('gereken pasif adi dogru', ust.pasifAd === pas.name);

  /**
   * ⚠️ ILK HALI BOSTA GECIYORDU: her TABAN silahin evrimi var, yani kosul
   * hic calismadan dogru donuyordu. Gercek vaka evrimlesmis silahin
   * KENDISI — onun daha ileri bir evrimi yok.
   */
  check('evrim tablosu bos degil (kontrol grubu)', EVOLUTIONS.length > 0, `${EVOLUTIONS.length} evrim`);
  check('evrimlesmis silahin evrimi YOK', evrimDurumu(EVOLVED[0].id, 9, []) === null, EVOLVED[0].id);
  check('bilinmeyen silah null donuyor', evrimDurumu('zzz-yok', 9, []) === null);

  /**
   * 🔴 TEK KAYNAK. Kart da ray da AYNI fonksiyonu cagiriyor; kart kendi
   * `EVOLUTIONS.find`ini yapmiyor.
   */
  check('level-up karti ortak fonksiyonu cagiriyor', /evrimDurumu\(id,/.test(kart));
  check('karta kendi evrim aramasi KALMADI', !/EVOLUTIONS\.find/.test(kart));
  check('ray da ayni fonksiyonu cagiriyor', /evrimDurumu\(w\.id, w\.level, passives\)/.test(ray));
  // ⚠️ Esikler buildInfo'da da ELLE YAZILI DEGIL
  check('buildInfo esikleri config\'ten okuyor',
    /evrimSilahEsigi\(def\)/.test(bilgi) && /evrimPasifEsigi\(gereken\)/.test(bilgi));

  /**
   * ⚠️ UCUNCU SART: evrim ayrica bir EVRIM SANDIGI istiyor (`tryEvolve`
   * yalniz sandiktan cagriliyor). "Hazir" demek "simdi olacak" demek
   * degil ve ray bunu SOYLEMEK zorunda.
   */
  check('motor evrimi sandiktan cagiriyor', /c\.evolution \? this\.tryEvolve\(this\.hero\) : false/.test(motor));
  check('ray sandigi soyluyor', /evolution chest/.test(bilgiHam));

  /**
   * ⚠️ YALNIZ EKSIK SART YAZILIYOR. Ilk hali ikisini birden sayiyordu ve
   * ekranda "Needs this at Lv 6 (6/6)" cikiyordu — TUTULMUS bir sarti
   * eksikmis gibi gosteriyordu (tarayicida goruldu).
   */
  const hepsi = evrimDurumu(ev.weapon, sEsik, [{ id: ev.passive, level: pEsik }])!;
  check('ikisi de tamamsa "ready"', /Ready/.test(evrimMetni(hepsi)), evrimMetni(hepsi));
  const yalnizSilah = evrimDurumu(ev.weapon, sEsik, [{ id: ev.passive, level: 0 }])!;
  const m1 = evrimMetni(yalnizSilah);
  check('silah tamamken silahtan BAHSETMIYOR', !/this weapon/.test(m1), m1);
  check('silah tamamken pasifi soyluyor (cift tarafli)', m1.includes(pas.name), m1);
  const yalnizPasif = evrimDurumu(ev.weapon, 1, [{ id: ev.passive, level: pEsik }])!;
  const m2 = evrimMetni(yalnizPasif);
  check('pasif tamamken pasiften BAHSETMIYOR', !m2.includes(pas.name), m2);
  check('pasif tamamken silahi soyluyor (cift tarafli)', /this weapon/.test(m2), m2);
  const hicbiri = evrimDurumu(ev.weapon, 1, [])!;
  const m3 = evrimMetni(hicbiri);
  check('hicbiri tamam degilse IKISINI birden soyluyor',
    /this weapon/.test(m3) && m3.includes(pas.name), m3);
}

console.log('\n[7] SEVIYE ARTISLARI');
{
  const def = WEAPONS.find((w) => w.id === 'shard')!;
  const a1 = silahArtislari(def, 1);
  check('max altinda artis VAR', a1.length > 0, a1.map((x) => `${x.label} ${x.text}`).join(', '));
  check('max\'ta artis YOK (cift tarafli)', silahArtislari(def, def.maxLevel).length === 0);
  // countLevels esiginde MERMI artisi cikmali
  const esik = (def.countLevels ?? [])[0];
  const ac = silahArtislari(def, esik - 1);
  check('mermi esiginde PROJECTILES cikiyor', ac.some((x) => x.label === 'PROJECTILES'), `lv ${esik - 1}→${esik}`);
  const ax = silahArtislari(def, esik);
  check('esik disinda PROJECTILES cikmiyor (kontrol grubu)', !ax.some((x) => x.label === 'PROJECTILES'));
}

console.log('\n[8] HER SILAHIN "NASIL CALISIR" METNI VAR');
{
  /**
   * ⚠️ BU HATA DAHA ONCE OLDU: `PATTERN_TEXT`te iki desen eksikti ve DORT
   * silah kartinda "nasil calisir" satiri BOS cikiyordu. Ray ayni tabloyu
   * okuyor — bir gun yeni desenli bir silah eklenirse burasi kirmizi verir.
   */
  const kaynak = oku('src/components/ui/cards.tsx');
  const blok = kaynak.slice(kaynak.indexOf('export const PATTERN_TEXT'));
  const tanimli = new Set([...blok.slice(0, blok.indexOf('\n};')).matchAll(/^\s{2}(\w+): \{ label:/gm)].map((m) => m[1]));
  check('desen tablosu okundu (kontrol grubu)', tanimli.size >= 8, `${tanimli.size} desen`);
  const eksik = [...WEAPONS, ...EVOLVED].filter((w) => !tanimli.has(w.pattern)).map((w) => w.id);
  check('her silahin deseni tabloda', eksik.length === 0, eksik.join(', ') || 'eksik yok');
}

console.log(`\n${FAIL.length === 0 ? 'BUILD RAYI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
