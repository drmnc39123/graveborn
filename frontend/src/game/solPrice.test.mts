// SOL FIYAT RAYI MUHRU.
//
// NIYE VAR: bu dosya gercek parayla ilgili tek fiyat kaynagi. Bir yuvarlama
// hatasi ya da kacan bir esik, hazineye urunun altinda odeme gecirir ve
// bunu kimse fark etmez - defterde her sey "odendi" gorunur.
//
//   cd frontend && npx tsx src/game/solPrice.test.mts

import fs from 'node:fs';
import {
  LAMPORTS_PER_SOL, SOL_RATE, goldToLamports, rateLabel, solCost, solLabel, solSellable,
} from './solPrice.js';
import { PULL_COST } from './cosmetics.js';
import { GUILD_COST } from './guild.js';
import { ossuaryCost } from './ossuary.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

console.log('\n=== SOL FIYAT RAYI ===');
console.log(`     ${rateLabel()} - SOL rayi %${Math.round((SOL_RATE.markup - 1) * 100)} daha pahali`);

console.log('\n[1] KUR VE MARKUP');
{
  // SOL RAYI GOLD RAYINDAN PAHALI OLMAK ZORUNDA. Esit fiyat, "gold
  // toplamanin bir anlami yok" demenin en kisa yolu olurdu.
  check('markup 1\'in ustunde', SOL_RATE.markup > 1, `x${SOL_RATE.markup}`);
  check('markup absurt degil (<2x)', SOL_RATE.markup < 2);
  const solunGoldu = SOL_RATE.goldPerSol;
  // ~6.124 gold/saat olculdu; 1 SOL makul bir oyun suresine karsilik gelmeli
  const saat = solunGoldu / 6124;
  check('1 SOL makul bir oyun suresi (10-200 saat)', saat > 10 && saat < 200,
    `${saat.toFixed(0)} saat`);
}

console.log('\n[2] * YUVARLAMA HAZINENIN LEHINE');
{
  // ASAGI YUVARLAMAK urunun ALTINDA odeme gecirir ve tam sayi bolmesinde
  // sessizce olur. Cift tarafli: yukari yuvarlandigini gercekten olcelim.
  let hepsiYukari = true;
  for (const g of [1, 7, 449, 450, 4501, 25_001, 158_799]) {
    const ham = (g * SOL_RATE.markup * LAMPORTS_PER_SOL) / SOL_RATE.goldPerSol;
    if (goldToLamports(g) < ham) hepsiYukari = false;
  }
  check('hicbir fiyat ham degerin ALTINA inmiyor', hepsiYukari);
  check('adima yuvarlaniyor',
    [450, 4500, 25_000].every((g) => goldToLamports(g) % SOL_RATE.stepLamports === 0));
  check('sifir gold sifir lamport', goldToLamports(0) === 0);
  check('bozuk girdi cokertmiyor',
    goldToLamports(Number.NaN) === 0 && goldToLamports(-99) === 0);
  // Monoton olmali: daha pahali urun daha cok SOL
  let monoton = true;
  for (let g = 1000; g < 400_000; g += 3_331) {
    if (goldToLamports(g + 3_331) < goldToLamports(g)) monoton = false;
  }
  check('fiyat gold ile azalmiyor', monoton);
}

console.log('\n[3] * ESIK - kucuk urun SOL rayina KONULMAZ');
{
  // Tek cekilis ~0,002 SOL eder; ag ucreti yaninda anlamsiz kalan bir tutar.
  // Esigin altini ESIGE YUVARLAMAK kurun kendisini yalanlardi.
  check('tek cekilis esigin ALTINDA (demet gerekiyor)', !solSellable(PULL_COST),
    solLabel(goldToLamports(PULL_COST)));
  check('10\'lu cekilis esigin USTUNDE', solSellable(PULL_COST * 10),
    solLabel(goldToLamports(PULL_COST * 10)));
  check('esigin altinda solCost null donuyor', solCost(PULL_COST) === null);
  check('esigin ustunde solCost sayi donuyor', typeof solCost(PULL_COST * 10) === 'number');
}

console.log('\n[4] URUNLER MAKUL BANTTA');
{
  const satirlar: [string, number][] = [
    ['10\'lu cekilis', PULL_COST * 10],
    ['lonca kurma', GUILD_COST],
    ['Ossuary L10', ossuaryCost(9)],
    ['Ossuary L50', ossuaryCost(49)],
  ];
  for (const [ad, gold] of satirlar) {
    const l = goldToLamports(gold);
    console.log(`     ${ad.padEnd(16)} ${gold.toLocaleString('en-US').padStart(9)} G -> ${solLabel(l)}`);
  }
  const demet = goldToLamports(PULL_COST * 10);
  // Durtusel alim bandi: 0,01 - 0,1 SOL. Disina cikan bir giris urunu
  // ya cok ucuz (anlamsiz) ya cok pahali (kimse denemez) olur.
  check('giris urunu durtusel bantta (0,01-0,1 SOL)',
    demet >= 0.01 * LAMPORTS_PER_SOL && demet <= 0.1 * LAMPORTS_PER_SOL, solLabel(demet));
  const lonca = goldToLamports(GUILD_COST);
  check('lonca kurma 0,05-0,5 SOL bandinda',
    lonca >= 0.05 * LAMPORTS_PER_SOL && lonca <= 0.5 * LAMPORTS_PER_SOL, solLabel(lonca));
}

console.log('\n[5] ** GUC SATILMIYOR - rayin var olus sarti');
{
  /**
   * Olculdu (balance.probe): Forge agaci derinligi 8,2 -> 16,6 ve kosu
   * gold'unu 268 -> 915 yapiyor. Forge'u SOL'a acmak (a) THE PIT'i
   * dogrudan pay-to-win yapardi (arena `permanent` = Forge+ekipman+beceri),
   * (b) SOL -> Forge -> 3,4x gold -> marketplace -> $GRAVE zincirini acardi.
   */
  const forge = oku('src/components/ForgePanel.tsx');
  check('Forge panelinde SOL rayi YOK', !/solPrice|goldToLamports|solCost/.test(forge));
  const stall = oku('src/components/StallPanel.tsx');
  check('Stall (kosu ici guc) SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(stall));
  const gear = oku('src/components/GearPanel.tsx');
  check('Gear/Reforge SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(gear));
  const skill = oku('src/components/SkillPanel.tsx');
  check('Paths (beceri) SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(skill));
  const pet = oku('src/components/PetPanel.tsx');
  check('Binding (pet gucu) SOL rayinda DEGIL', !/solPrice|goldToLamports/.test(pet));

  // CIFT TARAFLI: tarama her seye "evet" diyor olabilirdi - kontrol grubu
  check('tarama gercekten calisiyor (kontrol grubu)',
    /costOf|FORGE/.test(forge) && forge.length > 500);

  // ANA SAYFADAKI SOZ: "Depth is gated by survival, not by spending."
  const home = oku('src/components/HomeSections.tsx');
  check('SSS hala "not by spending" diyor (soz ayakta)',
    /not by spending/.test(home));
}

console.log(`\n${FAIL.length === 0 ? 'SOL FIYAT RAYI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
