// PET SİSTEMİ TESTİ — "THE BINDING".
//
// NİYE VAR: pet GÜÇ veriyor ve gold'la yükseltiliyor. Bu ikisi bir araya
// geldiğinde iki sessiz felaket mümkün:
//   1) Pet oyuncunun önüne geçer — yoldaş değil, oyuncunun yerine geçen şey
//      olur ve oynanış "pet'i besle, izle" hâline döner.
//   2) Güç tavansız kalır — balina sınırsız güç satın alır ve "skill puanı
//      parayla alınamaz" duruşu anlamsızlaşır.
// İkisi de hiçbir hata üretmez, sadece oyunu bozar. Bu dosya ikisini de
// sayıyla engelliyor.
//
// Çalıştır:  npx tsx src/game/pets.test.mts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PETS, petById, petCap, petEffect, petLevelCost, petSpent, petTotalCost,
  collectionTotalCost, canBind, bindKillsNeeded, BIND, FUSE_COPIES,
  MYTHIC_CAP, PET_CAP, ROLE_BASE, RARITY_POWER, MYTHIC_POWER, slot2Unlockable, SLOT2,
  toRunPet, petStatBonus, type RunPet,
} from './pets.js';
import { Game } from './engine.js';
import { ENEMIES, STAGES, TICK } from './config.js';
import { treeTotalCost } from './forge.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n[1] Saflık — DOM ve rastgelelik sızmamış');
{
  const ham = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'pets.ts'), 'utf8');
  // 🔴 SONDA YORUMLARI DA TARIYORDU ve kendi kendini yakaladı: `pets.ts`in
  // başlığı "Math.random yasak" diye YAZIYOR, tarayıcı da bunu ihlal sandı.
  // Aynı hata sınıfı bu projede tekrar tekrar çıkıyor — alet, ölçtüğünü
  // sandığı şeyi ölçmüyor. Yorumlar SOYULUYOR, kod taranıyor.
  const src = ham
    .replace(/\/\*[\s\S]*?\*\//g, '')   // blok yorumlar
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // satır yorumları (http:// zarar görmesin)
  // ⚠️ Bu dosyayı BACKEND de içe aktarıyor (`@game/pets`). Tarayıcıya ait tek
  // bir sembol bile sunucuyu açılışta düşürür.
  for (const yasak of ['Math.random', 'window.', 'document.', 'new Image', 'localStorage']) {
    check(`\`${yasak}\` geçmiyor`, !src.includes(yasak));
  }
}

console.log('\n[2] Maliyet muhasebesi BİREBİR');
{
  // `petSpent` ile tek tek toplanan `petLevelCost` aynı sayıyı vermeli —
  // ayrışırlarsa oyuncu ya fazla öder ya bedava seviye alır.
  let sapma: string[] = [];
  for (const p of PETS) {
    for (const mythic of [false, true]) {
      if (mythic && p.rarity !== 'legendary') continue;
      const cap = petCap(p, mythic);
      let elle = 0;
      for (let i = 0; i < cap; i++) elle += petLevelCost(p, i, mythic);
      if (elle !== petSpent(p, cap, mythic)) sapma.push(`${p.id}${mythic ? '*' : ''}`);
      if (elle !== petTotalCost(p, mythic)) sapma.push(`${p.id}${mythic ? '*' : ''} total`);
    }
  }
  check('petSpent = Σ petLevelCost = petTotalCost', sapma.length === 0, sapma.join(', ') || `${PETS.length} pet`);

  // Tavandaki seviye SATIN ALINAMAZ olmalı — yoksa tavan tavan değildir
  const asan = PETS.filter((p) => Number.isFinite(petLevelCost(p, petCap(p, false), false)));
  check('tavandaki seviye satın ALINAMIYOR (Infinity)', asan.length === 0, asan.map((p) => p.id).join(', ') || 'tamam');
}

console.log('\n[3] GÜÇ TAVANI — pet oyuncunun önüne geçmiyor');
{
  // ⚠️ ASIL KONTROL BU. `share` oyuncunun kendi hasarının ORANI; 1.0 demek
  // "pet oyuncu kadar vuruyor" demek. İlk sayılarla mythic striker 1,21
  // çıkmıştı — yani pet oyuncuyu GEÇİYORDU. Eşik cömert bırakıldı (0,75)
  // ama 1,0'ın altında kalması pazarlık konusu değil.
  let enYuksek = 0, sahip = '';
  for (const p of PETS) {
    for (const mythic of [false, true]) {
      if (mythic && p.rarity !== 'legendary') continue;
      const s = petEffect(p, petCap(p, mythic), mythic).share;
      if (s > enYuksek) { enYuksek = s; sahip = `${p.id}${mythic ? ' (mythic)' : ''}`; }
    }
  }
  check('hiçbir pet oyuncunun hasarını GEÇMİYOR (<1.0)', enYuksek < 1.0, `en yüksek ${enYuksek.toFixed(3)} — ${sahip}`);
  check('tek pet katkısı makul (<0.75)', enYuksek < 0.75, `${enYuksek.toFixed(3)}`);

  // ⚠️ ÇİFT YUVA EN KÖTÜ HÂLİ. İki yuva açıkken oyuncu iki mythic taşıyabilir.
  // Roster bunu doğal olarak sınırlıyor (her rolde TEK legendary var) ama
  // sınır tesadüfe bırakılmamalı.
  const mythicler = PETS.filter((p) => p.rarity === 'legendary')
    .map((p) => petEffect(p, MYTHIC_CAP, true).share)
    .sort((a, b) => b - a);
  const enKotu = (mythicler[0] ?? 0) + (mythicler[1] ?? 0);
  check('iki yuva dolu bile oyuncunun 1,5 katını geçmiyor', enKotu < 1.5, `${enKotu.toFixed(3)}`);

  // ⚠️ `share` ZATEN SANİYELİK ORAN — `cd`'ye BÖLÜNMEZ. Bu kontrol önce
  // bölüyordu ve yanlıştı: aynı sayıyı hem "vuruş başına" hem "saniyelik"
  // okumak, beklemesi uzun olan channeler'ı otomatik güçlü gösteriyordu.
  // `cd` yalnızca ritim; güç tamamen `share`de.
  const str = petEffect(petById('brute')!, 40, false).share;
  const cha = petEffect(petById('hulk')!, 40, false).share;
  check('alan hasarı tek hedeften DAHA DÜŞÜK', cha < str,
    `channeler ${cha.toFixed(3)} < striker ${str.toFixed(3)} (oyuncu DPS oranı)`);
}

console.log('\n[4] Ekonomi — SONLU ve Forge mertebesinde');
{
  const koleksiyon = collectionTotalCost();
  const forge = treeTotalCost();
  console.log(`     koleksiyon ${koleksiyon.toLocaleString('tr')} · Forge ${forge.toLocaleString('tr')} gold`);
  // ⚠️ SONLU OLMASI ŞART. Sonsuz olsaydı gold → sınırsız güç olurdu.
  check('koleksiyon maliyeti SONLU', Number.isFinite(koleksiyon));
  // Anlamlı bir sink olmalı ama Forge'u gölgede bırakıp erken oyunu da
  // yutmamalı — 1 ile 3 kat arası hedeflendi
  check('koleksiyon Forge\'un 1-3 katı arası', koleksiyon > forge && koleksiyon < forge * 3,
    `${(koleksiyon / forge).toFixed(2)}x`);
  // Giriş kademesi ucuz olmalı — ilk pet bir duvar olmamalı
  const ilk = petTotalCost(PETS.find((p) => p.rarity === 'common')!, false);
  check('common pet tavanı erişilebilir (<5K)', ilk < 5000, `${ilk.toLocaleString('tr')} gold`);
}

console.log('\n[5] Bağlama PARAYLA ALINAMAZ');
{
  const leg = PETS.find((p) => p.rarity === 'legendary')!;
  // Sonsuz gold, sıfır kill → HAYIR
  check('gold sonsuz ama kill yoksa bağlanmıyor',
    !canBind(leg, 0, 1e12, 0).ok, canBind(leg, 0, 1e12, 0).reason);
  // Kill var, gold yok → HAYIR
  check('kill yeter ama gold yoksa bağlanmıyor',
    !canBind(leg, 1e6, 0, 0).ok, canBind(leg, 1e6, 0, 0).reason);
  // İkisi de var → EVET
  check('ikisi de yeterse bağlanıyor',
    canBind(leg, BIND.legendary.kills, BIND.legendary.gold, 0).ok);

  // ⚠️ EŞİK KOPYA BAŞINA ARTMALI. Artmasaydı 2.000 kill bir kez doldurulup
  // dört kopya birden alınır, füzyonun oynanış bedeli sıfırlanırdı.
  const artiyor = bindKillsNeeded(leg, 3) > bindKillsNeeded(leg, 0);
  check('sonraki kopya DAHA ÇOK kill istiyor', artiyor,
    `1. kopya ${bindKillsNeeded(leg, 0).toLocaleString('tr')} → 4. kopya ${bindKillsNeeded(leg, 3).toLocaleString('tr')}`);
  check('füzyon dolunca daha fazla kopya alınamıyor',
    !canBind(leg, 1e9, 1e12, FUSE_COPIES).ok, canBind(leg, 1e9, 1e12, FUSE_COPIES).reason);
}

console.log('\n[6] Roster tutarlı');
{
  // Her pet gerçek bir düşmandan bağlanmalı — yazım hatası sessizce
  // "bağlanamayan pet" üretir ve kimse sebebini anlamaz
  const eksik = PETS.filter((p) => !ENEMIES.some((e) => e.id === p.bindsFrom));
  check('her pet GERÇEK bir düşmandan bağlanıyor', eksik.length === 0,
    eksik.map((p) => `${p.id}→${p.bindsFrom}`).join(', ') || `${PETS.length} pet`);

  const idler = new Set(PETS.map((p) => p.id));
  check('pet id\'leri benzersiz', idler.size === PETS.length);
  const artlar = new Set(PETS.map((p) => p.art));
  check('görsel anahtarları benzersiz', artlar.size === PETS.length);

  // ⚠️ HER ROL ERKEN KADEMEDE BULUNMALI. Bir rol yalnızca epic/legendary'de
  // olsaydı, oyun tarzının dörtte biri ödeme duvarının arkasında kalırdı.
  const roller = ['striker', 'channeler', 'warden', 'forager'] as const;
  const erkenYok = roller.filter((r) =>
    !PETS.some((p) => p.role === r && (p.rarity === 'common' || p.rarity === 'rare')));
  check('her rol common/rare kademesinde MEVCUT', erkenYok.length === 0,
    erkenYok.join(', ') || '4 rol');
}

console.log('\n[7] Mythic yalnızca füzyondan');
{
  const leg = petById('brute')!;
  check('mythic tavanı legendary\'den YÜKSEK', MYTHIC_CAP > PET_CAP.legendary,
    `${PET_CAP.legendary} → ${MYTHIC_CAP}`);
  check('mythic gücü legendary\'den yüksek',
    petEffect(leg, MYTHIC_CAP, true).share > petEffect(leg, PET_CAP.legendary, false).share);
  // Füzyon hissedilir olmalı ama uçurum olmamalı
  const kat = petEffect(leg, MYTHIC_CAP, true).share / petEffect(leg, PET_CAP.legendary, false).share;
  check('füzyon sıçraması 1,2-1,8 kat arası', kat > 1.2 && kat < 1.8, `${kat.toFixed(2)}x`);
  check('MYTHIC_POWER makul', MYTHIC_POWER > 1 && MYTHIC_POWER < 1.5, `${MYTHIC_POWER}`);
}

console.log('\n[8] Saf fonksiyon — aynı girdi aynı çıktı');
{
  // Determinizmin ön koşulu. Bu bozulursa motor aynı seed'de başka sonuç
  // üretir ve sunucunun ödül doğrulaması çöker.
  const p = petById('archer')!;
  const a = JSON.stringify(petEffect(p, 17, false));
  const b = JSON.stringify(petEffect(p, 17, false));
  check('petEffect saf', a === b, a);
  // Tavanın üstü kırpılmalı, patlamamalı
  check('tavan üstü seviye KIRPILIYOR',
    petEffect(p, 999, false).share === petEffect(p, petCap(p, false), false).share);
  check('negatif seviye 0 sayılıyor',
    petEffect(p, -5, false).share === petEffect(p, 0, false).share);
}

console.log('\n[9] İkinci yuva');
{
  check('derinlik yetmezse açılmıyor', !slot2Unlockable(SLOT2.depth - 1, 1e9));
  check('gold yetmezse açılmıyor', !slot2Unlockable(999, SLOT2.gold - 1));
  check('ikisi de yeterse açılıyor', slot2Unlockable(SLOT2.depth, SLOT2.gold));
}

console.log('\n[10] MOTOR — pet gerçekten çalışıyor ve deterministik');
{
  const kos = (pets: RunPet[], seed = 777, stage = STAGES[0]) => {
    const g = new Game(seed, stage, {}, 'campaign', undefined, 1, 0, null, pets);
    g.setViewport(1280, 720);
    for (let i = 0; i < 2400; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;            // ölüm ölçmüyoruz, pet katkısı ölçüyoruz
      g.setInput(Math.cos(i * TICK * 0.7), Math.sin(i * TICK * 0.7));
      g.step();
    }
    return g;
  };

  // ⚠️ EN ÖNEMLİ KONTROL: BOŞ pet listesi hiçbir şeyi değiştirmemeli.
  // `SIM_SEAL`in korunmasının sebebi bu ve sebep sessizce kaybolabilir —
  // biri `updatePets`in başındaki erken çıkışı kaldırırsa mühür kırılır.
  const bos = kos([]);
  const yok = (() => {
    const g = new Game(777);
    g.setViewport(1280, 720);
    for (let i = 0; i < 2400; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      g.setInput(Math.cos(i * TICK * 0.7), Math.sin(i * TICK * 0.7));
      g.step();
    }
    return g;
  })();
  check('BOŞ pet listesi koşuyu DEĞİŞTİRMİYOR (mührün dayanağı)',
    bos.kills === yok.kills && Math.abs(bos.px - yok.px) < 1e-9,
    `${bos.kills} = ${yok.kills} kill`);

  // Pet gerçekten vuruyor mu — vurmuyorsa sistem sessizce ölü demektir.
  //
  // 🔴 BU KONTROL ÖNCE TEK SEEDLE YAPILIYORDU ve GÜRÜLTÜ ÖLÇÜYORDU: pet'li
  // koşu 53, pet'siz 54 kill çıktı ve "pet zarar veriyor" gibi göründü.
  // Sebep pet'in zayıflığı değil — `damageEnemy` kritik zarı atıyor, yani
  // pet bir kez vurunca RNG AKIŞI KAYIYOR ve o seedin geri kalanı bambaşka
  // oluyor. Tek seed bu farkı taşıyamaz. Aynı hata sınıfı bu projede defalarca
  // çıktı; ölçüm ÇOK SEEDLE ve TOPLAM üzerinden yapılıyor.
  //
  // 🔴 İKİ DOLAYLI ÖLÇÜM DENENDİ, İKİSİ DE İŞE YARAMADI — yazılıyor ki
  // üçüncü kez denenmesin:
  //   1) 1. bölümde kill saymak: bölüm SPAWN-BAĞLI, oyuncu doğan herkesi
  //      zaten öldürüyor. Pet'in katkısı %2 göründü ve bu pet'in gücünü
  //      değil doğma hızının tavanını ölçüyordu.
  //   2) b17'de kill saymak: Forge'suz oyuncu orada HİÇBİR ŞEY öldüremiyor,
  //      pet'li de pet'siz de 0. Ölçüm tamamen sessiz kaldı.
  // Doğrusu DOLAYLI DEĞİL DOĞRUDAN: motor her vuruşu `wid` ile kuyruğa
  // atıyor, pet'in vuruşları `wid === 'pet'`. Gürültü yok, seed'e bağlı değil.
  const striker = toRunPet(petById('brute')!, 40, false);
  {
    const g = new Game(777, undefined, {}, 'campaign', undefined, 1, 0, null, [striker]);
    g.setViewport(1280, 720);
    let petVurus = 0, petHasar = 0, toplamHasar = 0;
    for (let i = 0; i < 3600; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      g.setInput(Math.cos(i * TICK * 0.7), Math.sin(i * TICK * 0.7));
      g.step();
      // ⚠️ HER TICK BOŞALTILIYOR: `hits` kuyruğunun 96'lık bir tavanı var ve
      // headless koşuda kimse boşaltmıyor. Sonda kendi sayacını tutmasaydı
      // vuruşların çoğunu kaçırırdı.
      for (const h of g.hits) {
        toplamHasar += h.dmg;
        if (h.wid === 'pet') { petVurus++; petHasar += h.dmg; }
      }
      g.hits.length = 0;
    }
    const oran = toplamHasar > 0 ? petHasar / toplamHasar : 0;
    check('pet GERÇEKTEN vuruyor', petVurus > 0, `${petVurus} vuruş · ${Math.round(petHasar)} hasar`);
    check('pet katkısı toplam hasarın anlamlı ama küçük bir payı (%1-%50)',
      oran > 0.01 && oran < 0.5, `%${(oran * 100).toFixed(1)}`);
  }

  // Determinizm: aynı seed + aynı pet → birebir aynı
  const a = kos([striker]), b = kos([striker]);
  check('aynı seed + aynı pet → BİREBİR aynı',
    a.kills === b.kills && a.px === b.px && a.rareGold === b.rareGold,
    `${a.kills} kill · ${a.rareGold} gold`);

  // Warden iyileştirmeli — canı düşürüp bakıyoruz
  {
    const warden = toRunPet(petById('warrior')!, 40, false);
    const g = new Game(4242, undefined, {}, 'campaign', undefined, 1, 0, null, [warden]);
    g.setViewport(1280, 720);
    g.hp = 10;
    const once = g.hp;
    for (let i = 0; i < 900; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.setInput(0, 0);
      g.step();
    }
    check('warden pet oyuncuyu İYİLEŞTİRİYOR', g.hp > once, `${once} → ${Math.round(g.hp)}`);
    check('warden can tavanını AŞMIYOR', g.hp <= g.stats.maxHp, `${Math.round(g.hp)} / ${Math.round(g.stats.maxHp)}`);
  }

  // Forager motora GİRMEZ — savaşmıyor, katkısı `permanent` kanalından
  {
    const forager = toRunPet(petById('wretch')!, 10, false);
    const g = new Game(999, undefined, {}, 'campaign', undefined, 1, 0, null, [forager]);
    check('forager motora alınmıyor', g.hero.pets.length === 0, `${g.hero.pets.length} pet`);
    const bonus = petStatBonus([forager]);
    check('forager katkısı `permanent` kanalında', (bonus.greed ?? 0) > 0,
      `greed +${(bonus.greed ?? 0).toFixed(3)} · magnet +${Math.round(bonus.magnet ?? 0)}`);
  }

  // Kozmetik kuyruk headless'ta taşmamalı — sunucu bu motoru boşaltmadan koşuyor
  {
    const chan = toRunPet(petById('hulk')!, 40, false);
    const g = new Game(31337, undefined, {}, 'campaign', undefined, 1, 0, null, [chan]);
    g.setViewport(1280, 720);
    for (let i = 0; i < 3000; i++) {
      if (g.phase === 'levelup') g.choose(g.offers[0].id);
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;
      g.setInput(Math.cos(i * TICK * 0.9), Math.sin(i * TICK * 0.9));
      g.step();   // petBlasts'ı kimse boşaltmıyor
    }
    check('petBlasts kuyruğu headless\'ta taşmıyor (≤24)', g.petBlasts.length <= 24, `${g.petBlasts.length}`);
  }
}

console.log(`\n${FAIL.length === 0 ? '✅ PET SİSTEMİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
