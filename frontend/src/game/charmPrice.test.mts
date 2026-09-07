// TILSIM FİYAT ÖLÇEKLEMESİ MÜHRÜ.
//
// 🔴 NİYE VAR: fiyat SABİTTİ, gelir ise derinlikle ÜSTEL büyüyordu. İki
// yuvayı doldurmak 410 gold; yeni bir derinliğin ödülü d10'da 560, d100'de
// 12.530. Aynı 410 gold d10'da ödülün %73'ü (ciddi bir karar), d100'de %3'ü
// (düşünmeden alınır) — sink geç oyunda çalışmayı bırakıyordu.
//
// ⚠️ DÜZ ZAM ÖLÇÜMLE ELENDİ: tekrar koşusu 376 gold kazandırıyor, iki dolu
// yuva zaten 410 — erken oyuncu HALİHAZIRDA net zararda. Sorun fiyatın
// düşüklüğü değil, ÖLÇEKLENMEMESİYDİ.
//
// 🔴 EN BÜYÜK RİSK: İKİ TARAFIN FARKLI FİYAT HESAPLAMASI. Arayüz 410
// gösterip sunucu 1.045 keserse oyuncu soyulduğunu düşünür ve haklı olur.
// Bu depoda "aynı kural iki yerde yazılınca ayrışır" dersi defalarca alındı;
// bu mühür ikisinin AYNI fonksiyonu çağırdığını da yokluyor.
//
//   cd frontend && npx tsx src/game/charmPrice.test.mts

import fs from 'node:fs';
import {
  CHARMS, CHARM_SCALE, CHARM_SLOTS, charmCost, charmDepthOf, charmPriceMul,
} from './charms.js';
import { depthGold } from './config.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

console.log('\n═══ TILSIM FİYAT ÖLÇEKLEMESİ ═══');

console.log('\n[1] ÇARPAN EĞRİSİ');
{
  check('çapa ve altında çarpan 1', charmPriceMul(1) === 1 && charmPriceMul(CHARM_SCALE.anchor) === 1,
    `d1=${charmPriceMul(1)} · d${CHARM_SCALE.anchor}=${charmPriceMul(CHARM_SCALE.anchor)}`);
  /**
   * ⚠️ ÇAPA ALTINDA ZAM YOK ve bu kasıtlı: sığ oyuncu zaten en zorlandığı
   * yerde (iki dolu yuva 410 gold, bir tekrar koşusu 376 kazandırıyor —
   * net zararda). Ona zam yapmak tezgâhı tamamen kapatırdı.
   */
  let artan = true;
  for (let d = CHARM_SCALE.anchor; d < 300; d++) {
    if (charmPriceMul(d + 1) < charmPriceMul(d)) artan = false;
  }
  check('çarpan derinlikle azalmıyor', artan);
  check('tavan uygulanıyor', charmPriceMul(100000) === CHARM_SCALE.max, String(charmPriceMul(100000)));
  /**
   * ⚠️ TAVAN ŞART: derinliğin üst sınırı yok (`descentStage` d1000'i bile
   * üretiyor). Tavansız bir çarpan derin oyuncuya tezgâhı tamamen kapatırdı;
   * sink'in işi caydırmak değil, ANLAMLI kalmak.
   */
  check('tavan makul (5-50 arası)', CHARM_SCALE.max >= 5 && CHARM_SCALE.max <= 50, String(CHARM_SCALE.max));
}

console.log('\n[2] ⭐ ORAN SABİT KALIYOR — ölçeklemenin bütün amacı');
{
  /**
   * Fiyat/ödül oranı derinlikle kaymamalı. Kaymasaydı bu değişikliğe gerek
   * yoktu; kayıyorsa üs yanlış seçilmiş demektir.
   */
  const ikiYuva = CHARMS.slice().sort((a, b) => b.cost - a.cost)
    .slice(0, CHARM_SLOTS).reduce((s, c) => s + c.cost, 0);
  const oran = (d: number) => (ikiYuva * charmPriceMul(d)) / depthGold(1, d);
  const olculen = [25, 50, 100, 200].map(oran);
  for (const [i, d] of [25, 50, 100, 200].entries()) {
    console.log(`     d${String(d).padStart(3)} → iki yuva ${Math.round(ikiYuva * charmPriceMul(d)).toLocaleString('en-US').padStart(6)} gold · derinlik ödülünün %${(olculen[i] * 100).toFixed(0)}'i`);
  }
  const yayilim = Math.max(...olculen) / Math.min(...olculen);
  check('d25-d200 arası oran sabit (≤1,15x sapma)', yayilim <= 1.15, `${yayilim.toFixed(2)}x`);

  // ⚠️ ÇİFT TARAFLI: ölçekleme OLMASAYDI oran çökerdi — kontrol grubu
  const olceksiz = [25, 50, 100, 200].map((d) => ikiYuva / depthGold(1, d));
  const olceksizYayilim = Math.max(...olceksiz) / Math.min(...olceksiz);
  check('ölçeklemesiz oran GERÇEKTEN çöküyordu (kontrol grubu)',
    olceksizYayilim > 5, `${olceksizYayilim.toFixed(1)}x sapma`);
}

console.log('\n[3] FİYAT SAĞLAM SAYI');
{
  for (const c of CHARMS) {
    for (const d of [0, 25, 50, 200, 100000]) {
      const f = charmCost(c, d);
      if (!Number.isInteger(f) || f < c.cost) FAIL.push(`${c.id}@d${d} bozuk fiyat ${f}`);
    }
  }
  check('her fiyat tam sayı ve taban fiyatın altına inmiyor',
    !FAIL.some((f) => f.includes('bozuk fiyat')));
  /**
   * ⚠️ BOZUK GİRDİ ÇARPANI 1 YAPMALI, NaN DEĞİL: NaN bir fiyat "yetersiz
   * gold" hatasına dönüşür ve tezgâh sessizce kapanırdı — oyuncu sebebini
   * asla öğrenemezdi.
   */
  check('NaN derinlik taban fiyat veriyor', charmCost(CHARMS[0], Number.NaN) === CHARMS[0].cost);
  check('negatif derinlik taban fiyat veriyor', charmCost(CHARMS[0], -50) === CHARMS[0].cost);
  check('undefined depthPaid 0 derinlik', charmDepthOf(undefined) === 0);
  check('boş depthPaid 0 derinlik', charmDepthOf({}) === 0);
  check('depthPaid EN DERİNİ alıyor', charmDepthOf({ 1: 12, 3: 44, 7: 30 }) === 44);
  check('bozuk depthPaid çökertmiyor',
    charmDepthOf({ 1: Number.NaN as unknown as number, 2: 9 }) === 9);
}

console.log('\n[4] ⭐ İKİ TARAF AYNI FİYATI HESAPLIYOR');
{
  /**
   * 🔴 ASIL RİSK BU. Arayüz 410 gösterip sunucu 1.045 keserse oyuncu
   * soyulduğunu düşünür. İkisi de `charms.ts`teki AYNI fonksiyonu
   * çağırmalı; kendi hesabını yazan taraf er ya da geç ayrışır.
   */
  const panel = oku('src/components/StallPanel.tsx');
  check('arayüz charmCost çağırıyor', /charmCost\(/.test(panel));
  check('arayüz derinliği charmDepthOf ile türetiyor', /charmDepthOf\(/.test(panel));
  // ⚠️ Elle yazılmış `c.cost` kalırsa ekran taban fiyatı gösterir ve yalan söyler
  check('arayüzde ham c.cost gösterimi kalmadı', !/\{c\.cost\.toLocaleString/.test(panel));

  const srv = oku('../backend/src/index.ts');
  check('sunucu charmCost çağırıyor', /charmCost\(c,/.test(srv));
  check('sunucu charmDepthOf kullanıyor', /charmDepthOf\(p\.depthPaid\)/.test(srv));
  // ⚠️ Sunucu ham `c.cost` ile kesmemeli — o taban fiyat, ölçeklenmemiş hali
  check('sunucu ham c.cost ile gold düşmüyor', !/gold\s*-=\s*c\.cost/.test(srv));
  check('defter ÖDENEN fiyatı yazıyor', /gold:\s*-fiyat/.test(srv));

  check('uydurma desen bulunmuyor (kontrol grubu)', !/charmZZZ/.test(panel + srv));
}

console.log(`\n${FAIL.length === 0 ? '✅ TILSIM FİYATI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
