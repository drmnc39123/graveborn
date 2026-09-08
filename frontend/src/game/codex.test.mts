// CODEX MUHRU — rehber DOGRU mu ve DOGRU KALIYOR mu.
//
// 🔴 BIR REHBERIN EN SINSI BOZULMA BICIMI: metin dogru yazilir, sonra
// denge/kod degisir ve rehber hala eski seyi soyler. Oyuncu ona guvenip
// yanlis karar verir ve hatayi kimse fark etmez — cunku hicbir test
// "belgeler dogru mu" diye sormaz. Bu dosya onu soruyor.
//
// IKI KORUMA:
//   1. RAKAM YOK. Govde metninde baslibasina sayi bulunamaz; her rakam
//      `facts` alanindan ve CANLI SABITTEN gelir.
//   2. TASIYICI IDDIALAR KODLA KARSILASTIRILIR. "Guc satilmiyor",
//      "sifir emisyon", "gold tek kaynaktan" — ucu de taranarak dogrulanir.
//      Biri bir gun degisirse rehber yalan soylemeden ONCE burasi kirmizi verir.
//
//   cd frontend && npx tsx src/game/codex.test.mts

import fs from 'node:fs';
import { CODEX, codexSection } from './codex.js';
import { STAGES, MAX_WEAPONS } from './config.js';
import { FORGE, treeTotalCost } from './forge.js';
import { COSMETICS, PULL_COST } from './cosmetics.js';
import { GUILD_COST } from './guild.js';
import { SOL_PRICES } from './solPrice.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

console.log('\n=== THE CODEX ===');
console.log(`     ${CODEX.length} bolum · ${CODEX.reduce((n, s) => n + s.body.length, 0)} paragraf`);

console.log('\n[1] YAPI SAGLAM');
{
  check('her bolumun kimligi tekil',
    new Set(CODEX.map((s) => s.id)).size === CODEX.length);
  check('her bolumde baslik ve etiket var',
    CODEX.every((s) => s.title.length > 5 && s.kicker.length > 2));
  check('her bolumde en az 2 paragraf', CODEX.every((s) => s.body.length >= 2));
  check('paragraflar bos degil', CODEX.every((s) => s.body.every((p) => p.length > 40)));
  check('codexSection kimlikle buluyor', !!codexSection(CODEX[0].id));
  check('codexSection uydurma kimlikte undefined', codexSection('yok_boyle') === undefined);
}

console.log('\n[2] ** GOVDE METNINDE ELLE YAZILMIS RAKAM YOK');
{
  /**
   * 🔴 ASIL KORUMA. "25 stages" diye yazilmis bir cumle, bolum sayisi
   * degistigi gun sessizce yalan olur. Rakamin tek mesru yeri `facts` ve
   * o da import edilmis sabitten turuyor.
   *
   * ⚠️ Sirali ifadeler (1v1) ve ozel adlar disarida degil — bilerek:
   * istisna listesi buyudukce kural erir. "1v1" yerine "one on one"
   * yazmak bedava.
   */
  const kacak: string[] = [];
  for (const s of CODEX) {
    for (const p of s.body) {
      const m = p.match(/\d+/g);
      if (m) kacak.push(`${s.id}: "${p.slice(0, 46)}…" → ${m.join(',')}`);
    }
  }
  check('hicbir paragrafta rakam yok', kacak.length === 0, kacak.join(' | '));

  // ⚠️ CIFT TARAFLI: tarama gercekten rakam buluyor mu
  const sahte = 'The tree costs 564516 gold and has 14 lines';
  check('tarama gercekten rakam yakaliyor (kontrol grubu)',
    (sahte.match(/\d+/g) ?? []).length === 2);
}

console.log('\n[3] ** RAKAMLAR CANLI SABITTEN GELIYOR');
{
  /**
   * `facts` degerlerinin gercekten import edilmis sabitlerden turedigini
   * olcuyoruz: kaynakta elle yazilmis bir sayi kalmamali.
   */
  const src = yorumsuz(oku('src/game/codex.ts'));
  const govde = src.slice(src.indexOf('export const CODEX'));
  // Izin verilenler: dizi indisleri ve `- 1` gibi ifadeler
  const sayilar = (govde.match(/(?<![\w[\]-])\d{2,}/g) ?? []);
  check('kaynakta 2+ haneli elle yazilmis sayi yok', sayilar.length === 0,
    sayilar.join(', '));

  // Ornekleme: birkac deger gercekten sabitle esitmi
  const bul = (id: string, etiket: string) =>
    codexSection(id)?.facts?.find((f) => f.label === etiket)?.value ?? '';
  check('bolum sayisi canli', bul('depth', 'Stages') === String(STAGES.length),
    `${bul('depth', 'Stages')} vs ${STAGES.length}`);
  check('silah yuvasi canli',
    bul('descent', 'Weapon slots') === String(MAX_WEAPONS));
  check('forge hatti canli', bul('power', 'Forge lines') === String(FORGE.length));
  check('forge agaci canli',
    bul('power', 'Whole Forge tree') === `${Math.round(treeTotalCost()).toLocaleString('en-US')} gold`,
    bul('power', 'Whole Forge tree'));
  check('kozmetik sayisi canli', bul('look', 'Relics') === String(COSMETICS.length));
  check('cekilis bedeli canli', bul('look', 'A draw') === `${PULL_COST} gold`);
  check('lonca bedeli canli',
    bul('people', 'Found a guild') === `${GUILD_COST.toLocaleString('en-US')} gold`);
  check('sezon karti fiyati canli',
    bul('sol', 'Season card').startsWith(String(SOL_PRICES.battlepass)));
}

console.log('\n[4] ** TASIYICI IDDIALAR KODLA CELISMIYOR');
{
  const idx = yorumsuz(oku('../backend/src/index.ts'));

  /**
   * 🔴 IDDIA: "You cannot pay for power. The Forge, the Stall, gear, paths
   * and pets take gold and nothing else."
   * Biri bir gun `/forge/buy-sol` eklerse rehber YALAN soyler. Once burasi
   * kirmizi versin.
   */
  const solUclari = [...idx.matchAll(/app\.post\('([^']*-sol)'/g)].map((m) => m[1]);
  const gucSatan = solUclari.filter((u) => /forge|charm|gear|skill|pet/.test(u));
  check('"guc satilmiyor" iddiasi DOGRU', gucSatan.length === 0,
    gucSatan.join(', ') || solUclari.join(' · '));
  check('SOL uclari gercekten tarandi (kontrol grubu)', solUclari.length >= 4,
    `${solUclari.length} uc`);

  const metin = CODEX.flatMap((s) => s.body).join(' ');
  check('metin bu iddiayi gercekten kuruyor',
    /cannot pay for power/i.test(metin));

  /**
   * 🔴 IDDIA: "The game does not print tokens... zero emission."
   * Hazine sabit kurdan gold ALMAMALI; alsaydi oyun token BASMIS olurdu.
   */
  const market = yorumsuz(oku('../backend/src/market.ts'));
  check('"sifir emisyon" iddiasi DOGRU — alim ucu hala kapali ya da korumali',
    /token_yok/.test(market) || /paymentSig/.test(market));
  check('metin sifir emisyonu soyluyor', /does not print tokens/i.test(metin));

  /**
   * 🔴 IDDIA: "Gold has exactly one source: running."
   * Defterde gold URETEN tek tur `run` olmali. `crypt` yeniden dagitim,
   * `market_cancel` kendi gold'unun iadesi, `admin_grant` elle telafi.
   */
  const crypt = yorumsuz(oku('../backend/src/crypt.ts'));
  check('defter turleri hala siniflandirilmis (musluk/sink)',
    /SINK_KINDS/.test(crypt) && /NON_SINK_KINDS/.test(crypt));
  check('metin gold\'un tek kaynagini soyluyor',
    /exactly one source/i.test(metin));

  /**
   * 🔴 IDDIA: "your wallet asks you exactly one thing: to send SOL.
   * There is no message to sign."
   */
  const lib = yorumsuz(oku('src/lib/solPay.ts'));
  check('"imza mesaji yok" iddiasi DOGRU', !/signMessage/.test(lib));
  check('metin bunu soyluyor', /no message to sign/i.test(metin));

  /**
   * 🔴 IDDIA: "the payment is remembered on your device and the button
   * turns into 'finish payment'"
   */
  const btn = oku('src/components/SolPayButton.tsx');
  check('"finish payment" iddiasi DOGRU', /FINISH PAYMENT/.test(btn));
}

console.log('\n[5] HICBIR SISTEM ANLATILMADAN KALMADI');
{
  /**
   * ⚠️ Navbar'daki her grup rehberde KARSILIK bulmali. Bir grup
   * anlatilmadan kalirsa oyuncu tam da aradigi yerde bosluk gorur.
   */
  const dock = oku('src/components/BuildingDock.tsx');
  const gruplar = [...dock.matchAll(/label: '([A-Z ]+)', color/g)].map((m) => m[1]);
  check('navbar gruplari okundu (kontrol grubu)', gruplar.length >= 4, gruplar.join(', '));

  const hepsi = CODEX.map((s) => `${s.kicker} ${s.title} ${s.body.join(' ')}`).join(' ').toLowerCase();
  const eksik = ['forge', 'reliquary', 'guild', 'duel', 'pit', 'barrow', 'marketplace', 'descent']
    .filter((k) => !hepsi.includes(k));
  check('her ana sistem metinde geciyor', eksik.length === 0, eksik.join(', '));
}

console.log('\n[6] OYUNCUYA GIDEN METIN INGILIZCE');
{
  const hepsi = CODEX.map((s) => `${s.kicker} ${s.title} ${s.body.join(' ')} `
    + (s.facts ?? []).map((f) => `${f.label} ${f.value}`).join(' ')).join(' ');
  check('Turkce karakter yok', !/[çğıöşüÇĞİÖŞÜ]/.test(hepsi));
}

console.log('\n[7] PANEL VE DUGME BAGLI');
{
  const panel = oku('src/components/CodexPanel.tsx');
  check('panel CODEX\'ten ciziyor', /CODEX\.map|CODEX\.find/.test(panel));
  // ⚠️ Metin bilesende OLMAMALI — ikinci bir kopya olurdu
  check('panelde gomulu paragraf yok', !/body: \[/.test(panel));
  check('panel facts blogunu ciziyor', /bolum\.facts/.test(panel));

  const dock = oku('src/components/BuildingDock.tsx');
  check('navbar\'da ? dugmesi var', /onOpen\('codex'\)/.test(dock));
  // ⚠️ DAR EKRANDA DA DURMALI: telefonda gizlenecek ilk sey baglantilar
  // olabilir, oyunu ANLATAN sey olamaz.
  check('? dugmesi dar ekranda gizlenmiyor',
    !/\{!dar && [\s\S]{0,80}onOpen\('codex'\)/.test(dock));

  const page = oku('src/app/play/page.tsx');
  check('sayfa codex panelini aciyor', /acik === 'codex'/.test(page));
  // ⚠️ Rehber cuzdan istememeli
  check('rehber cuzdansiz da aciliyor', !/codex'[\s\S]{0,120}panelUnlocked/.test(page));

  check('uydurma desen bulunmuyor (kontrol grubu)', !/codexZZZ/.test(panel + dock + page));
}

console.log(`\n${FAIL.length === 0 ? 'CODEX SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
