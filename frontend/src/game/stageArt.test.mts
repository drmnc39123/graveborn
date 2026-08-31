// SANAT KATMANI — ilk mühür.
//
// Çalıştır:  npx tsx src/game/stageArt.test.mts
//
// NİYE VAR: 28 test dosyası vardı ve HİÇBİRİ `stageArt`/`stageGround`a
// dokunmuyordu. Arena zemininin, dekorunun ve atmosferinin tamamı burada
// üretiliyor — yani oyunun en çok bakılan yüzeyi test kapsamı DIŞINDAYDI.
//
// ⚠️ Bu dosya PİKSEL ölçmez, VERİ ölçer. Zeminin "güzel" olup olmadığı
// ekranda karar verilir; burada kontrol edilen şey tablonun kendi içinde
// tutarlı olduğu ve derinlik bandının GERÇEKTEN bir fark ürettiği.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  STAGE_ART, artOf, descentArt, descentBant, DESCENT_BANT, tileHash, variantOf, TREE_VARIANTS,
} from './stageArt.js';
import { DESCENT } from './config.js';

const FAIL: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) FAIL.push(name);
};

console.log('\n═══ SANAT KATMANI ═══');

console.log('\n[1] STAGE_ART tablosu kendi içinde tutarlı');
{
  const kayitlar = Object.entries(STAGE_ART);
  check('25 bölümün hepsi tanımlı', kayitlar.length >= 25, `${kayitlar.length} kayıt`);

  const agirlikBozuk = kayitlar.filter(([, a]) => a.ground.length !== a.weights.length);
  check('her kayıtta ground.length === weights.length',
    agirlikBozuk.length === 0,
    agirlikBozuk.length ? agirlikBozuk.map(([k]) => `bölüm ${k}`).join(', ') : `${kayitlar.length} kayıt`);

  const bosZemin = kayitlar.filter(([, a]) => a.ground.length === 0);
  check('hiçbir kayıtta zemin BOŞ değil', bosZemin.length === 0,
    bosZemin.length ? bosZemin.map(([k]) => k).join(', ') : 'hepsi dolu');

  // ⚠️ Sıfır ağırlık bir karoyu SESSİZCE ölü yapar — tabloda görünür ama
  // `pickTile` onu asla seçmez.
  const sifirAgirlik = kayitlar.filter(([, a]) => a.weights.some((w) => w <= 0));
  check('hiçbir karo ağırlığı sıfır/negatif değil', sifirAgirlik.length === 0,
    sifirAgirlik.length ? sifirAgirlik.map(([k]) => k).join(', ') : 'hepsi pozitif');

  // Değer aralıkları — ekranda okunmaz karanlık ya da beyaz patlama olmasın
  const aralikDisi = kayitlar.filter(([, a]) =>
    a.grade.bright <= 0 || a.grade.bright > 1.4 || a.grade.sat < 0 || a.fog < 0 || a.fog > 1);
  check('grade/fog değerleri makul aralıkta', aralikDisi.length === 0,
    aralikDisi.length ? aralikDisi.map(([k]) => k).join(', ') : 'hepsi aralıkta');
}

console.log('\n[2] Dekor varlıkları diskte VAR');
{
  // ⚠️ `guards.test [6]` kök sabitli şablonları tarıyor ama ağaç AİLESİ
  // (`spr_dark_tree_${i}`) orada kapsam dışı — 16 varyantın hepsi burada.
  const eksik: string[] = [];
  for (let i = 1; i <= TREE_VARIANTS; i++) {
    const p = variantOf('/art/stage/trees/spr_dark_tree_1.png', (i - 0.5) / TREE_VARIANTS);
    if (!existsSync(join('public', p))) eksik.push(p);
  }
  check('16 ağaç varyantının hepsi diskte', eksik.length === 0,
    eksik.length ? eksik.join(', ') : `${TREE_VARIANTS} varyant`);

  // Tablodaki her dekor/overlay/zemin dosyası
  const yollar = new Set<string>();
  for (const a of Object.values(STAGE_ART)) {
    a.ground.forEach((p) => yollar.add(p));
    a.overlay.forEach((o) => yollar.add(o.src));
    a.decor.forEach((d) => yollar.add(d.src));
  }
  const yok = [...yollar].filter((p) => !existsSync(join('public', p)));
  check('tablodaki HER görsel diskte var', yok.length === 0,
    yok.length ? yok.join(', ') : `${yollar.size} dosya`);
}

console.log('\n[3] Derinlik bandı — inmek GÖRÜNÜYOR mu');
{
  check('bant sınırları doğru',
    descentBant(1) === 0 && descentBant(DESCENT_BANT) === 0
    && descentBant(DESCENT_BANT + 1) === 1 && descentBant(DESCENT_BANT * 3 + 1) === 3,
    `d1→${descentBant(1)} d${DESCENT_BANT}→${descentBant(DESCENT_BANT)} ` +
    `d${DESCENT_BANT + 1}→${descentBant(DESCENT_BANT + 1)}`);

  // ⚠️ BANT 0 TABANA DOKUNMAMALI. Her bölümün kimliği ilk 10 derinlikte
  // korunuyor; burada bir sapma olsaydı kampanya görüntüsü de kayardı.
  const taban = artOf(1);
  check('bant 0 taban sanatını AYNEN döndürüyor', descentArt(1, 1) === taban);
  check('bant 0 tüm aralıkta aynı', descentArt(1, DESCENT_BANT) === taban);

  // ── ASIL SORU: derinlik 1 ile derinlik 60 FARKLI mı? ──
  // Bu testin varlık sebebi: eskiden BİREBİR aynıydılar.
  const d1 = descentArt(1, 1);
  const d60 = descentArt(1, 60);
  const imza = (a: typeof d1) => JSON.stringify([a.ground, a.grade, a.tint, a.fog, a.decor.map((d) => d.src)]);
  check('d1 ile d60 GÖRSEL OLARAK FARKLI', imza(d1) !== imza(d60));

  check('derine inildikçe KARARIYOR', d60.grade.bright < d1.grade.bright,
    `${d1.grade.bright.toFixed(2)} → ${d60.grade.bright.toFixed(2)}`);
  check('derine inildikçe SİS ARTIYOR', d60.fog > d1.fog,
    `${d1.fog.toFixed(2)} → ${d60.fog.toFixed(2)}`);
  check('derin bantta zemin KATAKOMBA dönüyor',
    d60.ground.some((p) => p.includes('catacomb_floor')) && !d1.ground.some((p) => p.includes('catacomb_floor')));
  check('derin bantta katakomp duvarı dekora giriyor',
    d60.decor.some((d) => d.src.includes('catacomb_wall')));

  // ⚠️ TABANLAR GERÇEKTEN TUTUYOR MU. Sınırsız düşen bir parlaklık, derin
  // bantta oyuncunun düşmanı görememesi demek — bu ekranda ölçülemez bir
  // hata değil, oynanamaz bir oyun olur.
  let enKaranlik = 1, enSisli = 0;
  for (let d = 1; d <= 400; d++) {
    const a = descentArt(1, d);
    enKaranlik = Math.min(enKaranlik, a.grade.bright);
    enSisli = Math.max(enSisli, a.fog);
  }
  check('parlaklık tabanı tutuyor (d400e kadar)', enKaranlik >= 0.34, `en düşük ${enKaranlik.toFixed(2)}`);
  check('sis tavanı tutuyor (d400e kadar)', enSisli <= 0.55, `en yüksek ${enSisli.toFixed(2)}`);

  // ⚠️ MOR YASAĞI — paletin tek mutlak kuralı. Bant tintleri elle seçildi,
  // ara değer hesaplanmadı; yine de mühürleniyor.
  const morMu = (r: number, g: number, b: number) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === mn) return false;
    const d = mx - mn;
    let h = 0;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = ((h * 60) % 360 + 360) % 360;
    return h >= 265 && h <= 345;
  };
  const morBantlar: number[] = [];
  for (let d = 1; d <= 200; d++) {
    const [r, g, b] = descentArt(1, d).tint;
    if (morMu(r, g, b)) morBantlar.push(d);
  }
  check('hiçbir bandın tonu MOR değil', morBantlar.length === 0,
    morBantlar.length ? `d${morBantlar[0]}` : '200 derinlik tarandı');

  // ⚠️ SAF OLMAK ZORUNDA: aynı girdi aynı çıktı. Sanat katmanı motorun
  // rng'sine dokunsaydı aynı seed farklı koşu üretirdi.
  const a1 = imza(descentArt(3, 47));
  const a2 = imza(descentArt(3, 47));
  check('descentArt SAF (aynı girdi → aynı çıktı)', a1 === a2);
}

console.log('\n[4] Boss katı — checkpoint görsel olarak ayrışıyor');
{
  const bossKat = DESCENT.bossEvery;
  check('boss her N derinlikte bir', bossKat > 0, `bossEvery = ${bossKat}`);

  // ⚠️ KIYAS AYNI BANT İÇİNDEN OLMAK ZORUNDA. İlk yazımda d20 ile d21
  // kıyaslanmıştı ve test kırmızı yandı — ikisi FARKLI bantta (d20→bant 1,
  // d21→bant 2), yani ölçülen şey boss katı değil bant geçişiydi.
  // Testin kendi hatasıydı, kodun değil.
  const d = DESCENT_BANT + bossKat;              // bant 1 içinde bir boss katı
  const bossDerinlik = d - (d % bossKat);
  const normalDerinlik = bossDerinlik + 1;
  check('kıyas aynı banttan',
    descentBant(bossDerinlik) === descentBant(normalDerinlik),
    `d${bossDerinlik} ve d${normalDerinlik} → bant ${descentBant(bossDerinlik)}`);

  const boss = descentArt(1, bossDerinlik);
  const normal = descentArt(1, normalDerinlik);
  const isik = (a: typeof boss) => a.decor.some((x) => /candle|torch/.test(x.src));
  check('boss katında MUM/MEŞALE var', isik(boss));
  check('normal katta YOK', !isik(normal));

  // Işıklar listenin BAŞINDA olmalı: `drawStageDecor` ilk eşleşende duruyor
  check('ışıklar dekor listesinin başında', /candle|torch/.test(boss.decor[0].src),
    boss.decor[0].src.split('/').pop());
}

console.log('\n[5] tileHash — kozmetik rastgelelik deterministik');
{
  check('aynı koordinat aynı değeri veriyor', tileHash(12, 34, 5) === tileHash(12, 34, 5));
  check('farklı tuz farklı değer veriyor', tileHash(12, 34, 5) !== tileHash(12, 34, 6));
  let min = 1, max = 0;
  for (let x = 0; x < 200; x++) for (let y = 0; y < 20; y++) {
    const v = tileHash(x, y, 1);
    min = Math.min(min, v); max = Math.max(max, v);
  }
  check('değerler 0..1 aralığında ve dağılıyor', min >= 0 && max < 1 && max - min > 0.9,
    `${min.toFixed(3)} … ${max.toFixed(3)}`);
}

console.log('\n[6] Haftalık boss odasının KENDİ sanatı var');
{
  // 🐛 `worldBoss.ts` `bossRoomStage` `id: 0` veriyor. `STAGE_ART[0]` yokken
  // `artOf` sessizce `STAGE_ART[1]`e düşüyordu — yani oyunun en görünür
  // haftalık etkinliği bölüm 1'in ORMANINDA geçiyordu. Yedek hata vermediği
  // için kimse fark etmemişti: "kod doğru, yanlış şey çiziliyor".
  const oda = artOf(0);
  const hollowWood = artOf(1);
  check('boss odası artık bölüm 1e DÜŞMÜYOR', oda !== hollowWood);
  check('zemini taş (çim DEĞİL)',
    oda.ground.every((p) => !p.includes('grass')) && oda.ground.some((p) => p.includes('catacomb')));
  check('odada IŞIK var — kimliği bu',
    oda.decor.some((d) => d.src.includes('torch') || d.src.includes('candle')));
  // ⚠️ 0'ı tanımlamak YEDEĞİ bozmamalı: bilinmeyen bölüm hâlâ 1'e düşsün
  check('bilinmeyen bölüm hâlâ yedeğe düşüyor', artOf(999) === hollowWood);
}


console.log('\n[7] AYIRT EDİLEBİLİRLİK — "26 bölüm, tek görünüş" mührü');
{
  // 🔴 NİYE VAR (ölçüldü): tablo ayrım TASARLAMIŞTI ama GENLİĞİ yoktu.
  // 26 tint'in ortalama ikili RGB mesafesi 13,5 ve en yakın çiftler 2,0
  // uzaktaydı ([14,16,22] · [14,16,20] · [16,16,20] · [14,14,20]). Yani
  // isimleri farklı, ekranda aynı bölümlerdi.
  //
  // ⚠️ BU TEST "GÜZEL Mİ" DEMİYOR, "AYIRT EDİLEBİLİR Mİ" DİYOR. Güzellik
  // ekranda karara bağlanır; burada ölçülen şey iki bölümün birbirinin
  // yerine geçip geçemeyeceği.
  const mesafe = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  const tintler = Object.values(STAGE_ART).map((a) => a.tint);
  const ikili: number[] = [];
  for (let i = 0; i < tintler.length; i++) {
    for (let j = i + 1; j < tintler.length; j++) ikili.push(mesafe(tintler[i], tintler[j]));
  }
  const ort = ikili.reduce((s, v) => s + v, 0) / ikili.length;
  // ⚠️ EŞİK 40 DEĞİL 24 — ve bu bir gevşetme değil, geometri. Tintlerin
  // hepsi KOYU olmak zorunda (en yüksek kanal 64), yani noktalar 64³'lük
  // küçük bir küpte yaşıyor. O küpte teorik en iyi ortalama ~44; 24 eşiği
  // ölçülen 29,4'ün altında güvenli bir taban bırakıyor. Daha yükseğe
  // zorlamak tintleri doymuş primerlere iter ve sahne çiğ görünür.
  check('bölüm tintleri ayırt edilebilir (ort. mesafe ≥ 24)', ort >= 24,
    `ortalama ${ort.toFixed(1)}`);
  check('hiçbir iki bölüm neredeyse AYNI değil (en yakın ≥ 4)',
    Math.min(...ikili) >= 4, `en yakın ${Math.min(...ikili).toFixed(1)}`);

  // ⚠️ İNİŞ, GÖRSEL OLARAK DURMAMALI. `descentArt` bant listesini
  // `Math.min(bant, BANT_TINT.length)` ile kırpıyordu ve liste 4 uzunluktaydı:
  // **derinlik 40'tan sonrası sonsuza kadar tek renkti.** Test artık d80'e
  // kadar her 10 derinlikte bir DEĞİŞİM olduğunu zorluyor.
  const bantTintleri: number[][] = [];
  for (let d = 5; d <= 85; d += 10) bantTintleri.push([...descentArt(1, d).tint]);
  const adimlar = bantTintleri.slice(1).map((t, i) => mesafe(t, bantTintleri[i]));
  check('her bant bir öncekinden GÖRÜNÜR ölçüde farklı (≥ 10)',
    adimlar.every((v) => v >= 10),
    `adımlar ${adimlar.map((v) => v.toFixed(0)).join(' · ')}`);
  check('d40 ile d80 aynı DEĞİL — iniş görsel olarak durmuyor',
    mesafe(descentArt(1, 40).tint, descentArt(1, 80).tint) >= 10,
    `mesafe ${mesafe(descentArt(1, 40).tint, descentArt(1, 80).tint).toFixed(1)}`);

  // ⚠️ MERDİVEN MONOTON OLMAMALI. Sürekli kararan bir dizi, 8 bandı yine
  // tek bir "gittikçe karanlık" hissine indirir. En az bir band bir
  // öncekinden AÇIK olmalı — iniş karakter değiştirsin, sadece kısılmasın.
  const lum = (t: readonly number[]) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
  const artan = bantTintleri.slice(1).filter((t, i) => lum(t) > lum(bantTintleri[i]));
  check('bant merdiveni monoton karartma DEĞİL', artan.length >= 1,
    `${artan.length} bant bir öncekinden açık`);

  // ⚠️ ORTALAMA PARLAKLIK KORUNUYOR. Ayrımı açmanın bedeli sahneyi
  // topluca aydınlatmak/karartmak OLMAMALI; ölçülen taban 18,8 idi.
  const ortLum = tintler.reduce((s, t) => s + lum(t), 0) / tintler.length;
  check('tint ortalama luminansı taban aralığında (14-24)',
    ortLum >= 14 && ortLum <= 24, `ortalama ${ortLum.toFixed(1)}`);

  // ⚠️ MOR YASAĞI BÖLÜM TABLOSUNDA DA GEÇERLİ. Yukarıdaki [3] yalnız
  // BANT tintlerini tarıyordu; genlik büyütülürken tam da burada üç tint
  // mor bölgeye kaymıştı (ör. [20,14,16] → [22,6,11], hue ~337°).
  const morMuRGB = (r: number, g: number, b: number) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === mn) return false;
    const d = mx - mn;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = ((h * 60) % 360 + 360) % 360;
    return h >= 265 && h <= 345;
  };
  const morBolumler = tintler.filter((t) => morMuRGB(t[0], t[1], t[2]));
  check('hiçbir BÖLÜM tonu MOR değil', morBolumler.length === 0,
    morBolumler.length ? JSON.stringify(morBolumler[0]) : `${tintler.length} bölüm tarandı`);
}

console.log(`\n${FAIL.length === 0 ? '✅ SANAT KATMANI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
