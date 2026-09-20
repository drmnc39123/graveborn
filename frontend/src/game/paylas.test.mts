// KOŞU PAYLAŞIMI MÜHRÜ.
//
// 🔴 NİYE VAR (2026-09-20): oyuncudan "derinliğini paylaş" isteniyor ama
// ölüm ekranında paylaşma yolu YOKTU. Paylaşılan cümle oyuncunun gerçekten
// yaptığı şeyi söylemeli; yanlış sayı paylaşan oyuncu bir daha paylaşmaz.
//
//   cd frontend && npx tsx src/game/paylas.test.mts

import fs from 'node:fs';
import { SITE, paylasimLinki, paylasimMetni, paylasimXLinki, type KosuOzeti } from './paylas.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const temel: KosuOzeti = {
  mode: 'descent', stageName: 'The Sunken Ossuary', depth: 17, deepestCleared: 16,
  level: 9, kills: 412, kazandi: false, kod: null,
};

console.log('\n=== KOSU PAYLASIMI ===');

console.log('\n[1] ** METIN KOSUNUN GERCEGINI SOYLUYOR');
{
  const d = paylasimMetni(temel);
  check('descent derinligi metinde', d.includes('depth 17'), d);
  check('seviye ve oldurme metinde', d.includes('LV 9') && d.includes('412'));
  const kamp = paylasimMetni({ ...temel, mode: 'campaign', kazandi: true });
  check('kazanilan bolum adiyla anlatiliyor', kamp.includes('cleared The Sunken Ossuary'), kamp);
  const olum = paylasimMetni({ ...temel, mode: 'campaign', kazandi: false });
  check('kaybedilen kosu KAZANDIM demiyor', !/cleared|I made it/.test(olum), olum);
  // ⚠️ Derinlik 0 diye bir şey yok — ölüm ekranındaki eski hatanın ikizi
  check('derinlik en az 1', paylasimMetni({ ...temel, depth: 0 }).includes('depth 1'));
}

console.log('\n[2] ** BAGLANTI: KODU OLANIN KENDI KARTI');
{
  check('kod varsa /s/<kod>', paylasimLinki('AB12CD') === `${SITE}/s/AB12CD`);
  check('kod yoksa duz site', paylasimLinki(null) === SITE && paylasimLinki(undefined) === SITE);
  // 🔴 Kod uydurulursa kırık bağlantı paylaşılır — kontrol grubu
  check('bos kod /s/ URETMIYOR', !paylasimLinki('').includes('/s/'));
  const x = paylasimXLinki(temel);
  check('x.com/intent adresi', x.startsWith('https://x.com/intent/tweet?text='));
  check('metin ve adres kodlanmis', x.includes(encodeURIComponent('depth 17')) && x.includes(encodeURIComponent(SITE)));
}

console.log('\n[3] ** VAAT YOK');
{
  const hepsi = [
    paylasimMetni(temel),
    paylasimMetni({ ...temel, mode: 'campaign', kazandi: true }),
    paylasimMetni({ ...temel, mode: 'campaign', kazandi: false }),
  ].join(' ').toLowerCase();
  check('token/airdrop/kazanc sozu yok', !/token|airdrop|\$grave|earn|reward|profit|invest/.test(hepsi), hepsi.slice(0, 60));
}

console.log('\n[4] ** KOSU EKRANINA BAGLI');
{
  const oyun = yorumsuz(oku('../components/GameCanvas.tsx'));
  check('olum ekraninda paylas dugmesi', /SHARE THIS RUN/.test(oyun));
  check('dugme paylasimXLinki kullaniyor', /window\.open\(paylasimXLinki\(/.test(oyun));
  check('yeni sekme noopener', /'_blank', 'noopener,noreferrer'/.test(oyun));
  // 🔴 Demo'nun kuralı: sıfır backend çağrısı
  check('demo modda kod ISTENMIYOR', /getMode\(\) === 'demo'\) return;/.test(oyun));
  // ⚠️ Koşu 60 Hz çiziyor — kod yalnız koşu bitince isteniyor
  check('kod yalnizca kosu bitince isteniyor',
    /hud\?\.phase !== 'dead' && hud\?\.phase !== 'won'\) return;/.test(oyun));
}

if (FAIL.length) { console.log(`\n${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`); process.exit(1); }
console.log('\nKOSU PAYLASIMI SAGLAM');
