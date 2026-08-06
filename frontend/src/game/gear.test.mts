// EKİPMAN TESTİ — yatay ilerlemenin kırmızı çizgileri.
//
// Buradaki asıl risk "yanlış sayı" değil, ekipmanın SESSİZCE İKİNCİ BİR
// FORGE'A dönüşmesi: derinlikle büyüyen bir güç tavanı, laneti olmayan bir
// nadirlik merdiveni ya da kendini götüren lanetler. Üçü de sistemi yatay
// olmaktan çıkarır ve kimse fark etmez — sayılar hep "biraz daha iyi" olur.
//
// İkinci risk ekonomik: ekipmandan `greed` gelmesi. Sunucunun nadir-düşüş
// tavanı oyuncunun greed'ini bilmek zorunda; bilmediği bir kaynak eklenirse
// ya dürüst oyuncu kırpılır ya da tavan delinir.
//
// Çalıştır:  npx tsx src/game/gear.test.mts

import {
  GEAR, GEAR_SLOTS, MAX_GEAR_BUDGET, MAX_GEAR_NET, RARITIES, netBudget,
  affixText, gearBonus, gearScore, rarityOf, rarityWeights, rollGear, rollRunGear,
  salvageValue,
} from './gear.js';
import { FORGE, permanentBonus } from './forge.js';
import { STAT_BASE, type StatKey } from './config.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Geniş bir örneklem — tek seed'le bakmak hiçbir şey kanıtlamaz */
const ORNEKLER = (() => {
  const out = [];
  for (let seed = 1; seed <= 400; seed++) {
    for (const depth of [1, 5, 15, 30, 45, 60, 120, 400]) {
      out.push(rollGear(seed * 2654435761, depth, seed % 8));
    }
  }
  return out;
})();

console.log(`\n═══ EKİPMAN ═══  (${ORNEKLER.length} örnek parça)`);

console.log('\n[1] Determinizm — sunucu aynı parçayı üretebiliyor mu');
{
  // ⚠️ EN KRİTİK TEST. İstemci parçayı gösteriyor, sunucu KENDİ üretip
  // veriyor. İkisi ayrışırsa oyuncu ekranda gördüğünden başka bir şey alır.
  const a = rollGear(123456789, 25, 3);
  const b = rollGear(123456789, 25, 3);
  check('aynı girdi aynı parça', JSON.stringify(a) === JSON.stringify(b), a.id);

  const c = rollGear(123456789, 25, 4);
  check('farklı index farklı parça', JSON.stringify(a) !== JSON.stringify(c));

  const d = rollGear(123456790, 25, 3);
  check('farklı seed farklı parça', JSON.stringify(a) !== JSON.stringify(d));

  // Koşu düşüşleri de deterministik olmalı — sunucu bunu çağırıyor
  const r1 = rollRunGear(999, 37);
  const r2 = rollRunGear(999, 37);
  check('koşu düşüşleri deterministik', JSON.stringify(r1) === JSON.stringify(r2),
    `${r1.length} parça`);
}

console.log('\n[2] ⭐ Güç tavanı KAPALI — derinlikle büyümüyor mu');
{
  // ⚠️ Sistemin yatay kalmasını sağlayan TEK yapısal özellik bu. Derinlik
  // bütçeyi büyütseydi ekipman sonsuz güç olurdu.
  let enYuksek = 0;
  let enDerinSkor = 0;
  for (const it of ORNEKLER) {
    const r = rarityOf(it.rarity);
    // Ham güç (lanetler hariç) bütçeyi AŞMAMALI
    let ham = 0;
    for (const a of it.affixes) {
      if (a.kind !== 'boon') continue;
      ham += Math.abs(a.value) / PER(a.stat);
    }
    enYuksek = Math.max(enYuksek, ham - r.budget);
    if (it.depth >= 120) enDerinSkor = Math.max(enDerinSkor, ham);
  }
  check('hiçbir parça kendi bütçesini AŞMIYOR', enYuksek < 0.01, `en büyük taşma ${enYuksek.toFixed(4)}`);

  // Derinlik 400'de üretilen en güçlü parça, en yüksek kademenin bütçesini geçemez
  const tavan = RARITIES[RARITIES.length - 1].budget;
  check('derinlik 400 bile tavanı büyütmüyor', enDerinSkor <= tavan + 0.01,
    `${enDerinSkor.toFixed(2)} ≤ ${tavan}`);

  check('ilan edilen toplam tavan doğru', MAX_GEAR_BUDGET === GEAR_SLOTS.length * tavan,
    `${MAX_GEAR_BUDGET} puan (5 yuva × ${tavan})`);
}

console.log('\n[3] ⭐ Her nadir parça BİR BEDEL taşıyor mu');
{
  // Laneti olmayan bir nadirlik merdiveni = sayıları büyüten ikinci Forge.
  const eksik = ORNEKLER.filter((it) => {
    const r = rarityOf(it.rarity);
    return r.banes > 0 && it.affixes.filter((a) => a.kind === 'bane').length < r.banes;
  });
  check('3. kademe ve üstü LANETSİZ çıkmıyor', eksik.length === 0, `${eksik.length} lanetsiz`);

  const ilkIki = ORNEKLER.filter((it) => it.rarity <= 2 && it.affixes.some((a) => a.kind === 'bane'));
  check('ilk iki kademe bedelsiz (öğrenme alanı)', ilkIki.length === 0);

  // ⚠️ Lanet parçanın KENDİ bonusundan seçilemez — yoksa kendini götürür
  const kendiniGoturen = ORNEKLER.filter((it) => {
    const boon = new Set(it.affixes.filter((a) => a.kind === 'boon').map((a) => a.stat));
    return it.affixes.some((a) => a.kind === 'bane' && boon.has(a.stat));
  });
  check('lanet parçanın KENDİ bonusunu iptal etmiyor', kendiniGoturen.length === 0,
    `${kendiniGoturen.length} kendini götüren`);
}

console.log('\n[4] ⭐ Taban değeri 0 olan istatistikler lanetlenmiyor mu');
{
  // `amount` eksiye inerse silahlar mermi üretemez, `revival` eksi anlamsız,
  // eksi `recovery` sessiz bir zehir olur — oyuncu neden öldüğünü anlamaz.
  const KIRILGAN: StatKey[] = ['amount', 'revival', 'recovery'];
  const kotu = ORNEKLER.filter((it) =>
    it.affixes.some((a) => a.kind === 'bane' && KIRILGAN.includes(a.stat)));
  check('amount/revival/recovery ASLA lanetlenmiyor', kotu.length === 0, `${kotu.length} ihlal`);

  // Her ihtimale karşı: hiçbir toplam, tabanı kırılgan bir istatistiği eksiye düşürmesin
  const hepsi = gearBonus(ORNEKLER);
  for (const s of KIRILGAN) {
    check(`toplamda ${s} eksiye düşmüyor`, (hepsi[s] ?? 0) >= 0, `${(hepsi[s] ?? 0).toFixed(2)}`);
  }
}

console.log('\n[4b] ⭐ Tam sayı istatistikleri KESİRLİ çıkmıyor mu');
{
  // ⚠️ BU TEST BİR HATA YAKALADI. Ekipman "+0,34 projectiles" veriyordu.
  // Motorda karşılığı TUTARSIZ: `wCount()` bazı silahlarda döngü sınırı
  // (`i < 1.34` iki kez döner → TAM bir mermi bedava), bazılarında eşik
  // (`wCount >= 2` → 1,34 yetmez → HİÇBİR ŞEY). Aynı ek, silaha göre ya
  // bedava güç ya ölü satır oluyordu.
  const TAM: StatKey[] = ['amount', 'revival', 'armor'];
  const kesirli = ORNEKLER.flatMap((it) => it.affixes)
    .filter((a) => TAM.includes(a.stat) && !Number.isInteger(a.value));
  check('amount/revival/armor HEP tam sayı', kesirli.length === 0,
    kesirli.slice(0, 3).map((a) => `${a.stat}=${a.value}`).join(', '));

  // Sıfıra yuvarlanan bir ek listede DURMAMALI — ölü satır demek
  const sifir = ORNEKLER.flatMap((it) => it.affixes).filter((a) => a.value === 0);
  check('sıfıra yuvarlanan ek listede kalmıyor', sifir.length === 0, `${sifir.length}`);

  // +1 mermi GERÇEKTEN nadir olmalı: 1 mermi ≈ 2,9 puan, yani düşük
  // kademelerin bütçesi yetmez.
  const mermili = ORNEKLER.filter((it) => it.affixes.some((a) => a.stat === 'amount'));
  const dusukKademe = mermili.filter((it) => it.rarity <= 2);
  console.log(`     +mermi taşıyan parça: %${((mermili.length / ORNEKLER.length) * 100).toFixed(1)}`);
  check('düşük kademede +mermi ÇIKMIYOR (bütçe yetmiyor)', dusukKademe.length === 0,
    `${dusukKademe.length}`);
  check('yüksek kademede +mermi çıkabiliyor', mermili.length > 0, `${mermili.length} parça`);

  // Okunuş da temiz olmalı — "+0.0988 regen" ekranda görünmemeli
  const uzun = ORNEKLER.flatMap((it) => it.affixes)
    .filter((a) => /\d\.\d{3,}/.test(affixText(a)));
  check('okunuşta 2 basamaktan uzun ondalık YOK', uzun.length === 0,
    uzun.slice(0, 3).map(affixText).join(', '));
}

console.log('\n[5] ⭐ EKONOMİ: greed yok, gold yok');
{
  // ⚠️ Sunucunun `greedCeiling`'i ekipmanı bilmiyor. Ekipmandan greed
  // gelseydi ya tavan delinir ya dürüst oyuncu sessizce kırpılırdı.
  const greedli = ORNEKLER.filter((it) => it.affixes.some((a) => a.stat === 'greed'));
  check('hiçbir parçada greed YOK', greedli.length === 0, `${greedli.length} parça`);

  // Parçalama TOZ ödüyor — gold değil. Gold ödeseydi Wilderness bir musluk olurdu.
  const alanlar = Object.keys(RARITIES[0]);
  check('nadirlik tablosunda gold alanı YOK', !alanlar.includes('gold'), alanlar.join(', '));
  check('parçalama toz veriyor', RARITIES.every((r) => r.salvage > 0));
  check('nadir parça daha çok toz',
    RARITIES.every((r, i) => i === 0 || r.salvage > RARITIES[i - 1].salvage),
    RARITIES.map((r) => r.salvage).join(' < '));
}

console.log('\n[6] Ters istatistik (cooldown) — işaret doğru mu');
{
  // ⚠️ Motorda cooldown KÜÇÜK olan iyi. Boon eksi, lanet artı olmalı;
  // `permanentBonus` da tam olarak böyle yazıyor.
  const cdBoon = ORNEKLER.flatMap((it) => it.affixes)
    .filter((a) => a.stat === 'cooldown' && a.kind === 'boon');
  const cdBane = ORNEKLER.flatMap((it) => it.affixes)
    .filter((a) => a.stat === 'cooldown' && a.kind === 'bane');
  check('cooldown bonusu EKSİ değer taşıyor', cdBoon.length > 0 && cdBoon.every((a) => a.value < 0),
    `${cdBoon.length} örnek`);
  check('cooldown laneti ARTI değer taşıyor', cdBane.length > 0 && cdBane.every((a) => a.value > 0),
    `${cdBane.length} örnek`);

  // Forge ile aynı yön: ikisi de motorun aynı kanalına gidiyor
  const forgeCd = permanentBonus({ cooldown: 5 }).cooldown ?? 0;
  check('Forge ile AYNI yön', forgeCd < 0 && cdBoon[0].value < 0, `forge ${forgeCd}`);

  // Okunuş `kind`'dan gelmeli: oyuncu "−%8 cooldown" görüp kötü sanmamalı
  check('okunuşta cooldown bonusu ARTI görünüyor',
    affixText(cdBoon[0]).startsWith('+'), affixText(cdBoon[0]));
  check('okunuşta cooldown laneti EKSİ görünüyor',
    affixText(cdBane[0]).startsWith('−'), affixText(cdBane[0]));
}

console.log('\n[7] Ölü satır yok — her ek bir şey ifade ediyor mu');
{
  // Düz rastgele bölme "+%29 hasar, +%0 alan" üretiyordu; taban pay bunu kapattı.
  const olu = ORNEKLER.flatMap((it) => it.affixes).filter((a) => Math.abs(a.value) < 1e-6);
  check('sıfır değerli ek YOK', olu.length === 0, `${olu.length} ölü satır`);

  // Yüzdelik satırlar yuvarlanınca da görünür kalmalı — "+0%" bir hata
  const gorunmez = ORNEKLER.flatMap((it) => it.affixes)
    .filter((a) => affixText(a).includes('0%') && !affixText(a).match(/[1-9]0%/));
  check('yuvarlandığında "+0%" olan satır YOK', gorunmez.length === 0,
    gorunmez.slice(0, 3).map(affixText).join(', '));

  // Aynı parçada aynı istatistik iki kez olmamalı
  const tekrarli = ORNEKLER.filter((it) => {
    const s = it.affixes.map((a) => a.stat);
    return new Set(s).size !== s.length;
  });
  check('aynı parçada tekrar eden istatistik YOK', tekrarli.length === 0, `${tekrarli.length}`);
}

console.log('\n[8] Yuvalar birbirinden AYRI mı');
{
  // Beş yuva aynı havuzu paylaşsaydı "yuva" diye bir şey olmazdı.
  const havuzlar = new Map<string, Set<string>>();
  for (const it of ORNEKLER) {
    if (!havuzlar.has(it.slot)) havuzlar.set(it.slot, new Set());
    for (const a of it.affixes) {
      if (a.kind === 'boon') havuzlar.get(it.slot)!.add(a.stat);
    }
  }
  check('beş yuvanın hepsi düşüyor', havuzlar.size === GEAR_SLOTS.length,
    [...havuzlar.keys()].join(', '));
  for (const [slot, set] of havuzlar) {
    console.log(`     ${slot.padEnd(7)} → ${[...set].sort().join(', ')}`);
  }
  const grasp = havuzlar.get('grasp')!;
  const shroud = havuzlar.get('shroud')!;
  const ortak = [...grasp].filter((s) => shroud.has(s));
  check('saldırı ve hayatta kalma yuvaları ÖRTÜŞMÜYOR', ortak.length === 0, ortak.join(','));
}

console.log('\n[9] Nadirlik dağılımı — derinlik dağılımı kaydırıyor mu');
{
  const dagilim = (depth: number) => {
    const say = [0, 0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) say[rollGear(i * 2654435761, depth, i % 8).rarity - 1]++;
    return say.map((n) => (n / 4000) * 100);
  };
  const sig = dagilim(3);
  const derin = dagilim(60);
  console.log(`     derinlik 3  → ${sig.map((v, i) => `${RARITIES[i].name} %${v.toFixed(1)}`).join('  ')}`);
  console.log(`     derinlik 60 → ${derin.map((v, i) => `${RARITIES[i].name} %${v.toFixed(1)}`).join('  ')}`);

  check('sığda çoğunluk en düşük kademe', sig[0] > 45, `%${sig[0].toFixed(1)}`);
  check('derinde en yüksek kademe kayda değer', derin[4] > 8, `%${derin[4].toFixed(1)}`);
  // ⚠️ Sığda da mucize olabilmeli — yeni oyuncunun da hikâyesi olsun
  check('sığda da Graveborn MÜMKÜN', sig[4] > 0, `%${sig[4].toFixed(2)}`);
  check('derinde de en düşük kademe düşüyor (çöp var)', derin[0] > 0, `%${derin[0].toFixed(1)}`);

  // Ağırlıklar hep pozitif olmalı — negatif ağırlık seçimi bozar
  for (const d of [0, 1, 60, 500]) {
    check(`derinlik ${d} ağırlıkları pozitif`, rarityWeights(d).every((v) => v > 0));
  }
}

console.log('\n[10] Koşu düşüşü — tavan ve ritim');
{
  check('derinlik 4 → parça YOK', rollRunGear(7, 4).length === 0);
  check('derinlik 5 → 1 parça', rollRunGear(7, 5).length === 1);
  check('derinlik 37 → 7 parça', rollRunGear(7, 37).length === 7, `${rollRunGear(7, 37).length}`);
  // ⚠️ Tavan olmadan derin bir koşu envanteri tek seferde doldururdu
  check('tavan uygulanıyor', rollRunGear(7, 10000).length === GEAR.maxPerRun,
    `${rollRunGear(7, 10000).length} = ${GEAR.maxPerRun}`);
  check('negatif derinlik patlamıyor', rollRunGear(7, -50).length === 0);
}

console.log('\n[11] Motora bağlanma');
{
  const set = GEAR_SLOTS.map((_, i) => rollGear(4242, 60, i));
  const b = gearBonus(set);
  check('bonus haritası üretiliyor', Object.keys(b).length > 0, Object.keys(b).join(', '));
  // Motorun okuduğu istatistikler dışında bir anahtar OLMAMALI
  const bilinmeyen = Object.keys(b).filter((k) => !(k in STAT_BASE));
  check('motorun bilmediği istatistik YOK', bilinmeyen.length === 0, bilinmeyen.join(','));

  const bos = gearBonus([]);
  check('boş ekipman boş bonus', Object.keys(bos).length === 0);

  // Toplama gerçekten topluyor mu
  const iki = gearBonus([set[0], set[0]]);
  const tek = gearBonus([set[0]]);
  const k = Object.keys(tek)[0] as StatKey;
  check('aynı parça iki kez toplanıyor',
    Math.abs((iki[k] ?? 0) - (tek[k] ?? 0) * 2) < 1e-6, `${k}: ${tek[k]} → ${iki[k]}`);
}

console.log('\n[12] 📏 ÖLÇÜM — ekipman Forge\'u gölgeliyor mu');
{
  // ⚠️ Ekipman Forge'un YERİNE geçmemeli, YANINDA durmalı. Gölgelerse
  // gold'un tek kalıcı çıkışı anlamsızlaşır ve ekonomi çöker.
  const tamAgac: Record<string, number> = {};
  for (const u of FORGE) tamAgac[u.id] = u.maxLevel;
  const forge = permanentBonus(tamAgac);

  // En iyi ihtimalle: 5 yuva da Graveborn (istatistiksel olarak imkânsıza yakın)
  let enIyi: Record<string, number> = {};
  for (let s = 0; s < 4000; s++) {
    const set = GEAR_SLOTS.map((_, i) => rollGear(s * 2654435761, 400, i));
    const b = gearBonus(set);
    if ((b.might ?? 0) > (enIyi.might ?? 0)) enIyi = b as Record<string, number>;
  }
  const oran = (enIyi.might ?? 0) / (forge.might ?? 1);
  console.log(`     tam Forge ağacı  → +%${((forge.might ?? 0) * 100).toFixed(0)} hasar`);
  console.log(`     4000 denemenin EN İYİ ekipman seti → +%${((enIyi.might ?? 0) * 100).toFixed(0)} hasar`);
  check('en iyi ekipman bile Forge ağacının ALTINDA', oran < 1,
    `ekipman/Forge = ${oran.toFixed(2)}`);
  check('ama önemsiz de değil', oran > 0.15, `${(oran * 100).toFixed(0)}%`);
}

console.log('\n[13] ⭐ NET güç merdiveni MONOTON mu');
{
  // ⚠️ BU TEST BİR HATA YAKALADI ve kalması ŞART. İlk tabloda Graveborn'un
  // NET gücü (2,80) Cursed'in altındaydı (3,30): en nadir parça bir alttakinden
  // zayıftı. Öyle bir kademe bir seçim değil TUZAKTIR — oyuncu en nadir şeyi
  // bulup takmamayı öğrenir. Ham güç uçlara gidebilir, net güç TIRMANMALI.
  const ort = (t: number) => {
    const xs = ORNEKLER.filter((it) => it.rarity === t);
    return xs.reduce((s, it) => s + gearScore(it), 0) / (xs.length || 1);
  };
  const netler = [1, 2, 3, 4, 5].map(ort);
  for (const t of [1, 2, 3, 4, 5]) {
    const r = RARITIES[t - 1];
    console.log(`     ${r.name.padEnd(10)} ham ${r.budget.toFixed(1)} · lanet ${(r.banes * r.banePoints).toFixed(1)} · NET ${netler[t - 1].toFixed(2)}`);
  }
  check('net güç her kademede ARTIYOR',
    netler.every((v, i) => i === 0 || v > netler[i - 1]),
    netler.map((v) => v.toFixed(2)).join(' → '));
  check('ham güç de artıyor',
    RARITIES.every((r, i) => i === 0 || r.budget > RARITIES[i - 1].budget),
    RARITIES.map((r) => r.budget).join(' → '));
  // ⚠️ Ama net, hamdan BELİRGİN yavaş büyümeli — yoksa lanetler dekoratif olur
  const hamKat = RARITIES[4].budget / RARITIES[0].budget;
  const netKat = netler[4] / netler[0];
  check('lanetler gerçekten frenliyor (net artışı < ham artışı)', netKat < hamKat * 0.75,
    `ham ×${hamKat.toFixed(1)} vs net ×${netKat.toFixed(1)}`);

  // ⚠️ SERT TAVAN NET DEĞİL HAM BÜTÇE. Tam sayı kuantalaması lanetleri
  // biraz UCUZLATABİLİYOR (1,28 puanlık armor laneti 1 armor'a inince
  // 1,25 puan ediyor), yani net skor `netBudget`'ı birkaç yüzde geçebilir.
  // Yapısal garanti "net ≤ ham bütçe"; `netBudget` bir TASARIM HEDEFİ.
  check('net skor HAM bütçeyi asla aşmıyor',
    ORNEKLER.every((it) => gearScore(it) <= rarityOf(it.rarity).budget + 0.01),
    `en yüksek net ${Math.max(...ORNEKLER.map(gearScore)).toFixed(2)}`);
  const sapma = Math.max(...[3, 4, 5].map((t) => {
    const r = RARITIES[t - 1];
    return Math.abs(netler[t - 1] - netBudget(r)) / netBudget(r);
  }));
  check('net skor tasarım hedefinin %15 yakınında', sapma < 0.15,
    `en büyük sapma %${(sapma * 100).toFixed(1)} · hedef net tavan ${MAX_GEAR_NET.toFixed(1)} puan`);

  // Parçalama değeri kademeye bağlı, ek sayısına değil
  check('parçalama değeri kademeden geliyor',
    salvageValue(ORNEKLER.find((it) => it.rarity === 5)!) === RARITIES[4].salvage);
}

function PER(stat: StatKey): number {
  // Test tarafında bağımsız kopya: gear.ts'in tablosu değişirse bu test
  // sessizce onaylamasın diye DEĞERLERİ BURAYA yazmıyoruz — parçadan türetiyoruz.
  const ornek = ORNEKLER.flatMap((it) => it.affixes).filter((a) => a.stat === stat);
  const b = ornek.find((a) => a.kind === 'boon');
  if (!b) return 1;
  // 1 puanlık en düşük kademe parçası: değer = 1 × perPoint
  const tekPuan = ORNEKLER.find((it) => it.rarity === 1 && it.affixes[0].stat === stat);
  return tekPuan ? Math.abs(tekPuan.affixes[0].value) / RARITIES[0].budget : Math.abs(b.value);
}

console.log(`\n${FAIL.length === 0 ? '✅ EKİPMAN YATAY KALIYOR' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
