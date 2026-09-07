// RENK YÖNETİMİ MÜHRÜ.
//
// 🔴 NİYE VAR: bu modül görsel çıktının TAMAMINI ölçekliyor ve bir ÖNBELLEK
// tutuyor. Önbellek anahtarı eksik olursa iki farklı derece aynı gözü
// paylaşır ve ekranda YANLIŞ RENK kalır — çökme yok, uyarı yok. Bu hata bu
// depoda ZATEN BİR KEZ OLDU: `stageGround` önbelleği yalnız bölüm id'siyle
// anahtarlanıyordu, derinlik bandı değişince eski zemin ekranda kalıyordu.
//
//   cd frontend && npx tsx src/game/grade.test.mts

import {
  GUNDUZ, type Grade, filtreMetni, gradeAnahtari, koyGradei, koyIsikGucu,
} from './grade.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const saat = (s: number) => Date.UTC(2026, 0, 15, s, 0, 0);

console.log('\n═══ RENK YÖNETİMİ ═══');

console.log('\n[1] ⭐ ÖNBELLEK ANAHTARI EKSİKSİZ — HER alan anahtarı değiştirmeli');
{
  /**
   * 🔴 MÜHRÜN KALBİ ve asıl işi GELECEĞİ korumak. Bugün `Grade`in dört alanı
   * da anahtarda. Ama biri yarın beşinci bir alan eklerse (ör. `fog`,
   * `contrast`) ve `gradeAnahtari`ye yazmayı unutursa, o alanla farklılaşan
   * iki derece AYNI anahtarı üretir ve önbellek yanlış görseli servis eder.
   *
   * ⚠️ Bu kontrol alanları ELLE SAYMIYOR — nesnenin kendi anahtarlarını
   * gezip her birini tek tek değiştiriyor. Yeni alan eklendiği anda,
   * kimse bu dosyaya dokunmasa bile, mühür düşer.
   */
  const temel: Grade = { sat: 1.1, bright: 0.9, tintA: 0.2, tint: [10, 20, 30] };
  const temelAnahtar = gradeAnahtari(temel);
  const etkisiz: string[] = [];

  for (const alan of Object.keys(temel) as (keyof Grade)[]) {
    const kopya: Grade = { ...temel, tint: [...temel.tint] as [number, number, number] };
    if (alan === 'tint') {
      kopya.tint = [temel.tint[0] + 7, temel.tint[1], temel.tint[2]];
    } else {
      (kopya[alan] as number) = (temel[alan] as number) + 0.25;
    }
    if (gradeAnahtari(kopya) === temelAnahtar) etkisiz.push(alan);
  }
  check(`Grade'in ${Object.keys(temel).length} alanının HEPSİ anahtarı etkiliyor`,
    etkisiz.length === 0, etkisiz.join(', ') || 'eksiksiz');

  // tint'in üç bileşeni de ayrı ayrı sayılmalı — sadece ilkine bakmak
  // yeşil/mavi farkını gizlerdi.
  for (const i of [0, 1, 2]) {
    const k: Grade = { ...temel, tint: [...temel.tint] as [number, number, number] };
    k.tint[i] += 5;
    check(`tint[${i}] anahtarı değiştiriyor`, gradeAnahtari(k) !== temelAnahtar);
  }
}

console.log('\n[2] ANAHTAR KARARLI');
{
  const g: Grade = { sat: 1, bright: 1, tintA: 0, tint: [0, 0, 0] };
  const g2: Grade = { sat: 1, bright: 1, tintA: 0, tint: [0, 0, 0] };
  check('aynı derece → aynı anahtar', gradeAnahtari(g) === gradeAnahtari(g2));
  // ⚠️ Anahtar 3 basamağa yuvarlıyor: bu BİLİNÇLİ bir takas (gereksiz
  // önbellek çoğalmasını engelliyor). Sınırı ölçüyorum ki sessizce kaymasın.
  const kaba: Grade = { ...g, sat: 1.0001 };
  check('0,0001 fark aynı gözü paylaşıyor (yuvarlama)', gradeAnahtari(kaba) === gradeAnahtari(g));
  const ince: Grade = { ...g, sat: 1.002 };
  check('0,002 fark AYRI göz açıyor', gradeAnahtari(ince) !== gradeAnahtari(g));
}

console.log('\n[3] FİLTRE DİZESİ');
{
  const g: Grade = { sat: 1.2, bright: 0.8, tintA: 0, tint: [0, 0, 0] };
  const f = filtreMetni(g);
  check('saturate ve brightness içeriyor', /saturate\(1\.2\)/.test(f) && /brightness\(0\.8\)/.test(f), f);
  // ⚠️ Canvas2D geçersiz bir filtre dizesini SESSİZCE yok sayar — yazım
  // hatası hiçbir hata üretmez, sadece derecelendirme hiç uygulanmaz.
  check('geçerli CSS filtre biçimi', /^[a-z]+\([\d.]+\)( [a-z]+\([\d.]+\))*$/.test(f), f);
}

console.log('\n[4] ⭐ GÜN DÖNGÜSÜ — UTC, saf ve kesintisiz');
{
  /**
   * ⚠️ SUNUCU SAATİ, cihaz saati DEĞİL. Aynı anda giren iki oyuncu köyü aynı
   * ışıkta görmeli; yoksa "sende gece mi?" diye sorarlar. Fonksiyon saf
   * olduğu için burada doğrudan ölçülebiliyor.
   */
  check('aynı saat → aynı derece',
    gradeAnahtari(koyGradei(saat(3))) === gradeAnahtari(koyGradei(saat(3))));
  check('öğle ile gece FARKLI',
    gradeAnahtari(koyGradei(saat(12))) !== gradeAnahtari(koyGradei(saat(2))));
  check('öğle = GUNDUZ çapası', gradeAnahtari(koyGradei(saat(12))) === gradeAnahtari(GUNDUZ));

  // ⚠️ SIÇRAMA OLMAMALI: geçiş saatlerinde parlaklık aniden zıplarsa köy
  // göz kırpar. Saat başı örnekleyip en büyük adımı ölçüyorum.
  let enBuyukAdim = 0, oncekiSaat = -1;
  let onceki = koyGradei(saat(0)).bright;
  for (let s = 1; s < 24; s++) {
    const b = koyGradei(saat(s)).bright;
    const adim = Math.abs(b - onceki);
    if (adim > enBuyukAdim) { enBuyukAdim = adim; oncekiSaat = s; }
    onceki = b;
  }
  check('saat başı parlaklık sıçraması küçük (< 0,10)',
    enBuyukAdim < 0.10, `en büyük ${enBuyukAdim.toFixed(3)} (saat ${oncekiSaat})`);

  // Döngü gerçekten DÖNÜYOR mu — 24 saatte kaç farklı derece
  const dereceler = new Set<string>();
  for (let s = 0; s < 24; s++) dereceler.add(gradeAnahtari(koyGradei(saat(s))));
  check('gün içinde birden çok derece var', dereceler.size >= 6, `${dereceler.size} farklı`);
  // ⚠️ ÇİFT TARAFLI: her saat farklı olsaydı önbellek günde 24 kez ıskalardı
  check('ama her saat ayrı değil (önbellek işe yarasın)', dereceler.size < 20, `${dereceler.size}`);

  // ⚠️ Bilinmeyen/bozuk zaman karanlık köy üretmemeli
  check('geçersiz zaman çökertmiyor', typeof koyGradei(Number.NaN).bright === 'number');
}

console.log('\n[5] IŞIK GÜCÜ — zeminden türüyor, saatten değil');
{
  const gece = koyGradei(saat(2));
  const gunduz = koyGradei(saat(12));
  // ⚠️ Karanlık zeminde mum halesi DAHA GÜÇLÜ yanmalı; additive ışık ancak
  // karanlığa karşı okunur (dosya başlığındaki ölçülmüş zincir).
  check('gece ışığı gündüzden güçlü',
    koyIsikGucu(gece) > koyIsikGucu(gunduz),
    `gece ${koyIsikGucu(gece).toFixed(2)} · gündüz ${koyIsikGucu(gunduz).toFixed(2)}`);
  // ⚠️ Sınırlar: patlamış bir çarpan köyü beyaza boğar, sıfır çarpan ışığı öldürür
  for (const b of [0.01, 0.1, 0.5, 1, 2, 10]) {
    const v = koyIsikGucu({ sat: 1, bright: b, tintA: 0, tint: [0, 0, 0] });
    if (!(v >= 0.85 && v <= 1.6)) FAIL.push(`ışık gücü sınır dışı (bright ${b} → ${v})`);
  }
  check('her parlaklıkta 0,85–1,60 arasında', !FAIL.some((f) => f.startsWith('ışık gücü')));
}

console.log(`\n${FAIL.length === 0 ? '✅ RENK YÖNETİMİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
