// CRYPT DEED TESTİ — asıl soru: bu bir musluk mu?
//
// Deed planda "pasif gold üretimi" diye yazılmıştı. O hâliyle yapılsaydı
// ekonominin tamamını (ölçülmüş 6.124 gold/saat, Forge ağacı 42 saat) bozardı.
// Yeniden dağıtım olarak yapıldı; bu testin BİRİNCİ işi o iddiayı rakamla
// tutmak: ödenen ASLA kasaya girenden fazla olamaz.
//
// Çalıştır:  npx tsx src/game/crypt.test.mts

import fs from 'node:fs';
import {
  CRYPT_CUT, CRYPT_TIERS, CRYPT_WEEKLY_CAP, cryptBreakEven, cryptContribution,
  cryptDraw, cryptPaybackWeeks, cryptShare, cryptTier, cryptUpgradeCost,
  cryptWeeklyCap, nextCryptTier,
} from './crypt.js';
import { treeTotalCost } from './forge.js';

/** Zincir taramasi icin — dosya yoksa bos string, tarama patlamasin */
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ THE CRYPT DEED ═══');

console.log('\n[1] Kademeler');
{
  check('üç kademe var', CRYPT_TIERS.length === 3);
  let artan = true;
  for (let i = 1; i < CRYPT_TIERS.length; i++) {
    if (CRYPT_TIERS[i].cost <= CRYPT_TIERS[i - 1].cost) artan = false;
    if (CRYPT_TIERS[i].weight <= CRYPT_TIERS[i - 1].weight) artan = false;
  }
  check('fiyat ve ağırlık monoton artıyor', artan);

  // ⚠️ Ağırlık fiyattan YAVAŞ büyümeli — yoksa en pahalı kademe her zaman en
  // kârlı olur ve alt kademeler ölü doğar (kimse 1 ve 2'yi almaz).
  let yavas = true;
  for (let i = 1; i < CRYPT_TIERS.length; i++) {
    const fiyatKat = CRYPT_TIERS[i].cost / CRYPT_TIERS[i - 1].cost;
    const agirlikKat = CRYPT_TIERS[i].weight / CRYPT_TIERS[i - 1].weight;
    if (agirlikKat >= fiyatKat) yavas = false;
    console.log(`     T${i} → T${i + 1}: fiyat ×${fiyatKat.toFixed(2)} · ağırlık ×${agirlikKat.toFixed(2)}`);
  }
  check('ağırlık fiyattan YAVAŞ büyüyor (alt kademeler ölü değil)', yavas);

  check('geç oyun içeriği (1. kademe Forge ağacının ¼\'ünden pahalı)',
    CRYPT_TIERS[0].cost > treeTotalCost() / 4,
    `${CRYPT_TIERS[0].cost.toLocaleString('tr')} vs ağaç ${treeTotalCost().toLocaleString('tr')}`);

  // Yükseltme FARKI ödenmeli, baştan değil
  check('yükseltme farkı ödüyor', cryptUpgradeCost(1) === CRYPT_TIERS[1].cost - CRYPT_TIERS[0].cost,
    `${cryptUpgradeCost(1).toLocaleString('tr')}`);
  check('son kademeden sonrası yok', !nextCryptTier(3) && cryptUpgradeCost(3) === Infinity);
  check('bilinmeyen kademe undefined', cryptTier(9) === undefined);
}

console.log('\n[2] ⭐ MUSLUK DEĞİL — ödenen ≤ kasaya giren');
{
  // Gerçekçi bir tur: 40 oyuncu harcıyor, 6'sının deed'i var
  const harcamalar = Array.from({ length: 40 }, (_, i) => 500 + i * 137);
  const kasa = harcamalar.reduce((s, x) => s + cryptContribution(x), 0);
  const toplamHarcama = harcamalar.reduce((s, x) => s + x, 0);

  const sahipler = [1, 1, 2, 2, 3, 1].map((t) => cryptTier(t)!);
  const toplamAgirlik = sahipler.reduce((s, t) => s + t.weight, 0);
  const odenen = sahipler.reduce((s, t) => s + cryptShare(kasa, t.weight, toplamAgirlik), 0);

  console.log(`     harcanan ${toplamHarcama.toLocaleString('tr')} → kasa ${kasa.toLocaleString('tr')} → ödenen ${odenen.toLocaleString('tr')}`);
  check('ÖDENEN ≤ KASA (yeni gold ÜRETİLMİYOR)', odenen <= kasa, `${odenen} ≤ ${kasa}`);
  check('kasa harcamanın %10\'u (sink %90 imha edilmeye devam)',
    Math.abs(kasa / toplamHarcama - CRYPT_CUT) < 0.01,
    `%${(100 * kasa / toplamHarcama).toFixed(1)}`);
  check('artan kuruş kasada kalıyor (devrediyor)', kasa - odenen >= 0, `${kasa - odenen} kuruş`);

  // ⚠️ En sert kontrol: tek sahip bile kasanın TAMAMINDAN fazlasını alamaz
  const tek = cryptShare(kasa, 6, 6);
  check('tek sahip bile kasadan fazlasını alamıyor', tek <= kasa, `${tek} ≤ ${kasa}`);
}

console.log('\n[3] Bozuk girdi');
{
  check('negatif harcama kasaya bir şey koymuyor', cryptContribution(-500) === 0);
  check('boş kasadan pay çıkmıyor', cryptShare(0, 5, 10) === 0);
  check('sıfır ağırlık pay almıyor', cryptShare(1000, 0, 10) === 0);
  check('sıfır toplam ağırlıkta bölme yok', cryptShare(1000, 5, 0) === 0);
  check('pay TAM SAYI', Number.isInteger(cryptShare(1000, 3, 7)), `${cryptShare(1000, 3, 7)}`);
  // ⚠️ Yukarı yuvarlama "ödenen > kasa" üretirdi — aşağı yuvarlandığını doğrula
  check('pay AŞAĞI yuvarlanıyor', cryptShare(1000, 3, 7) === Math.floor(3000 / 7));
}

console.log('\n[4] Amortisman — deed kendini ödüyor mu');
{
  // Küçük topluluk (tek sahip) vs kalabalık (20 eşdeğer sahip)
  for (const [ad, benim, toplam] of [
    ['tek sahip', 1, 1], ['5 eşdeğer sahip', 1, 5], ['20 eşdeğer sahip', 1, 20],
  ] as const) {
    const be = cryptBreakEven(1, benim, toplam);
    console.log(`     T1 · ${ad}: ${Math.round(be).toLocaleString('tr')} gold TOPLUM harcaması gerekiyor`);
  }
  const tekBe = cryptBreakEven(1, 1, 1);
  // Tek sahipken 1. kademe kendini 600K harcamayla ödemeli (fiyat / %10)
  check('tek sahipte amortisman = fiyat ÷ kesinti', Math.round(tekBe) === Math.round(CRYPT_TIERS[0].cost / CRYPT_CUT),
    `${Math.round(tekBe).toLocaleString('tr')}`);
  // ⚠️ Amortisman "asla" olmamalı ama KOLAY da olmamalı: tek sahip bile
  // Forge ağacının iki katı kadar topluluk harcaması beklemeli.
  check('amortisman kolay değil (ağacın 2 katından fazla harcama)', tekBe > treeTotalCost() * 2,
    `${Math.round(tekBe).toLocaleString('tr')} vs ${(treeTotalCost() * 2).toLocaleString('tr')}`);
}

console.log('\n[5] * HAFTALIK CEKIM TAVANI');
{
  /**
   * NIYE VAR: tavansiz cekimde ilk tapu sahibi o gune kadar BIRIKMIS kasanin
   * tamamini tek seferde aliyordu. Olculdu (2026-09-07): 1.000 aktif oyuncu /
   * 10 tapu sahibi dagiliminda T1 haftada 238.155 gold cekiyordu; Forge
   * agacinin TAMAMI 564.516. Yani hic oynamadan 2,4 haftada butun agac.
   * Bu bir temettu degil ikramiyeydi ve tapuyu bir cevirmeye donusturuyordu.
   */
  const t1 = CRYPT_TIERS[0];
  const dev = cryptDraw(50_000_000, t1, t1.weight);   // devasa kasa, tek sahip
  check('devasa kasada bile tavan uygulaniyor',
    dev.amount === cryptWeeklyCap(t1) && dev.capped,
    `${dev.amount.toLocaleString('en-US')} (tavan ${cryptWeeklyCap(t1).toLocaleString('en-US')})`);
  // CIFT TARAFLI: kucuk kasada tavan DEVREYE GIRMEMELI, yoksa tavan bir
  // tavan degil sabit odeme olurdu.
  const kucuk = cryptDraw(5_000, t1, t1.weight);
  check('kucuk kasada tavan devreye GIRMIYOR', kucuk.amount === 5_000 && !kucuk.capped,
    `${kucuk.amount}`);
  check('cekilmeyen pay kasada kaliyor (yakilmiyor)',
    dev.share - dev.amount === 50_000_000 - cryptWeeklyCap(t1));

  /**
   * TAVAN KADEME SECIMINI BOZMAMALI. Tavan bedelin orani oldugu icin
   * amortisman tabani her kademede AYNI olmali; sabit bir gold tavani ucuz
   * kademeyi kayirir ve T3'u olu dogururdu.
   */
  const tabanlar = CRYPT_TIERS.map((t) => cryptPaybackWeeks(t, cryptDraw(9e9, t, t.weight).amount));
  const beklenen = 1 / CRYPT_WEEKLY_CAP;
  check('amortisman tabani her kademede ayni',
    tabanlar.every((h) => Math.abs(h - beklenen) < 0.02),
    tabanlar.map((h) => h.toFixed(1)).join(' / ') + ' hafta');
  check(`hicbir tapu ${beklenen} haftadan hizli amorti edemiyor`,
    tabanlar.every((h) => h >= beklenen - 0.02));

  // Bozuk girdi
  check('tapusuz cekim 0', cryptDraw(1_000_000, undefined, 10).amount === 0);
  check('bos kasada cekim 0', cryptDraw(0, t1, 10).amount === 0);

  /**
   * IKI TARAF AYNI FONKSIYONU CAGIRIYOR. Arayuz 238.155 gosterip sunucu
   * 22.000 oderse oyuncu soyuldugunu dusunur ve hakli olur.
   */
  const srv = oku('../backend/src/crypt.ts');
  check('sunucu cryptDraw ile odemeyi kesiyor', /cryptDraw\(st\.balance/.test(srv));
  check('sunucu ham cryptShare ile odemiyor', !/const pay = cryptShare/.test(srv));
  const panel = oku('src/components/CryptSection.tsx');
  check('arayuz cryptDraw cagiriyor', /cryptDraw\(/.test(panel));
  check('arayuz tavan devredeyken SOYLUYOR', /cekim\.capped/.test(panel));
  check('arayuz satin alma oncesi tahmin gosteriyor', /sonrakiCekim/.test(panel));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/cryptZZZ/.test(srv + panel));
}

console.log(`\n${FAIL.length === 0 ? '✅ CRYPT SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
