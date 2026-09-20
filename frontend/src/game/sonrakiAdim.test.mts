// SIRADAKİ ADIM MÜHRÜ.
//
// 🔴 NİYE VAR: koşu sonu kartı oyuncuyu bir yere GÖNDERİYOR. Gidip bir şey
// yapamazsa kart yalan söylemiş olur — rozetlerle aynı güven kuralı
// (bkz. `game/rozet.ts`). Bu mühür "öneri ancak yapılabilir bir iş varken
// çıkar" ve "öncelik sırası sabittir" kurallarını ölçüyor.
//
//   cd frontend && npx tsx src/game/sonrakiAdim.test.mts

import fs from 'node:fs';
import { sonrakiAdim } from './sonrakiAdim.js';
import { FORGE, costOf } from './forge.js';
import { emptyProgress, type Progress } from './progress.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const GUN = '2026-09-20';
const DUN = '2026-09-19';
const EN_UCUZ = Math.min(...FORGE.map((u) => costOf(u, 0)));
/** Bugün serisini almış, parası yetmeyen oyuncu — hiçbir önerisi olmayan taban */
const sakin = (): Progress => {
  const p = { ...emptyProgress(), gold: EN_UCUZ - 1 };
  p.streak = { days: 1, last: GUN };
  return p;
};

console.log('\n=== SIRADAKI ADIM ===');

console.log('\n[1] ** YAPILACAK BIR SEY YOKSA ONERI YOK');
{
  check('bos durumda null', sonrakiAdim({ progress: sakin(), ozet: { quests: { claimable: 0 } }, gun: GUN }) === null);
  check('progress yokken null', sonrakiAdim({ progress: null, ozet: null, gun: GUN }) === null);
  // 🔴 Demo: sunucu özeti yok → görev önerisi UYDURULMUYOR
  const demo = sonrakiAdim({ progress: sakin(), ozet: null, gun: GUN });
  check('demo\'da gorev onerisi yok', demo === null || demo.panel !== 'daily', demo?.panel ?? 'null');
}

console.log('\n[2] ** ONERI GERCEKTEN YAPILABILIR');
{
  const zengin = sakin();
  zengin.gold = EN_UCUZ;
  const a = sonrakiAdim({ progress: zengin, ozet: { quests: { claimable: 0 } }, gun: GUN });
  check('parasi yetince FORGE oneriliyor', a?.panel === 'upgrade', a?.panel ?? 'null');
  const fakir = sakin();
  fakir.gold = EN_UCUZ - 1;
  check('bir gold eksikken FORGE ONERILMIYOR',
    sonrakiAdim({ progress: fakir, ozet: { quests: { claimable: 0 } }, gun: GUN }) === null,
    `${fakir.gold} < ${EN_UCUZ}`);

  const seri = sakin();
  seri.streak = { days: 2, last: DUN };
  check('seri bekliyorsa TAVERN', sonrakiAdim({ progress: seri, ozet: null, gun: GUN })?.panel === 'tavern');
  const seriAlindi = sakin();
  check('seri bugun alinmissa TAVERN YOK',
    sonrakiAdim({ progress: seriAlindi, ozet: null, gun: GUN })?.panel !== 'tavern');
}

console.log('\n[3] ** ONCELIK SIRASI SABIT');
{
  // Üçü de hazır: kaybolabilen önce
  const hepsi = sakin();
  hepsi.gold = 10_000_000;
  hepsi.streak = { days: 2, last: DUN };
  const ozet = { quests: { claimable: 3 } };
  check('1. gorev odulu', sonrakiAdim({ progress: hepsi, ozet, gun: GUN })?.panel === 'daily');
  check('2. seri (gorev bitince)',
    sonrakiAdim({ progress: hepsi, ozet: { quests: { claimable: 0 } }, gun: GUN })?.panel === 'tavern');
  const seriYok = { ...hepsi, streak: { days: 1, last: GUN } };
  check('3. forge (ikisi de yokken)',
    sonrakiAdim({ progress: seriYok, ozet: { quests: { claimable: 0 } }, gun: GUN })?.panel === 'upgrade');
  // Metin sayıyı doğru söylüyor mu — "3 quest rewards"
  check('metin sayiyi soyluyor',
    (sonrakiAdim({ progress: hepsi, ozet, gun: GUN })?.metin ?? '').includes('3 quest rewards'));
  check('tekil/cogul ayrimi',
    (sonrakiAdim({ progress: hepsi, ozet: { quests: { claimable: 1 } }, gun: GUN })?.metin ?? '')
      .includes('A quest reward'));
}

console.log('\n[4] ** ODEME EKRANI BUNU CIZIYOR');
{
  const play = yorumsuz(oku('../app/play/page.tsx'));
  check('oneri saf fonksiyondan',
    /sonrakiAdim\(\{ progress, ozet, gun: utcDay\(new Date\(\)\) \}\)/.test(play));
  check('dugme paneli aciyor ve odemeyi kapatiyor',
    /setPayout\(null\); hedefiAc\(adim\.panel\);/.test(play));
  check('oneri yoksa satir cizilmiyor', /\{adim && \(/.test(play));
  // ⚠️ CONTINUE kaybolmamalı: öneriyi istemeyen oyuncunun çıkışı o
  check('CONTINUE duruyor', /CONTINUE/.test(play));
}

if (FAIL.length) { console.log(`\n${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`); process.exit(1); }
console.log('\nSIRADAKI ADIM SAGLAM');
