// ARENA UÇTAN UCA — iki oyuncu, gerçek HTTP + gerçek WebSocket.
//
// ⚠️ Birim testler odayı DOĞRUDAN çağırıyor; burada hiçbir kısayol yok:
// iki ayrı jeton, iki ayrı soket, sunucunun kendi 60 Hz saati. Test edilen
// şey tam olarak tarayıcının yaptığı şey.
//
// SUNUCU AYAKTA OLMALI:  npx tsx src/index.ts
// Çalıştır:              npx tsx src/e2e-arena.test.mts

import WebSocket from 'ws';
import { ARENA, buildArenaGame, type ArenaSetup, type InputFrame } from '@game/arena';
import { issueToken } from './auth.js';
import { prisma } from './db.js';

const API = 'http://localhost:4100';
const WSB = 'ws://localhost:4100';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

const P = `TEST_E2E_${Date.now()}`;
const A = `${P}_A`, B = `${P}_B`;
await prisma.player.createMany({
  data: [
    { wallet: A, duelRating: 1000, hero: 'knight' },
    { wallet: B, duelRating: 1010, hero: 'ranger' },
  ],
});
const tokA = issueToken(A), tokB = issueToken(B);

const kuyruk = (tok: string) => fetch(`${API}/arena/queue`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
  body: '{}',
}).then((r) => r.json() as Promise<{ state: string; setup?: ArenaSetup }>);

console.log('\n═══ ARENA UÇTAN UCA ═══');

console.log('\n[1] Eşleşme');
const r1 = await kuyruk(tokA);
check('ilk oyuncu bekliyor', r1.state === 'waiting', r1.state);
const r2 = await kuyruk(tokB);
check('ikinci oyuncu EŞLEŞTİ', r2.state === 'matched', r2.state);
const r1b = await kuyruk(tokA);
check('ilki yoklamada eşleşmeyi aldı', r1b.state === 'matched', r1b.state);

const setupA = r1b.setup!;
const setupB = r2.setup!;
check('aynı maç', setupA.matchId === setupB.matchId);
check('aynı seed', setupA.seed === setupB.seed, `${setupA.seed}`);
check('taraflar farklı', setupA.side !== setupB.side, `${setupA.side}/${setupB.side}`);

console.log('\n[2] ⭐ İki soket, gerçek maç');
interface Taraf {
  ws: WebSocket; frames: InputFrame[]; end: null | { winner: number | null; tick: number; kills: number[] };
  hello: boolean;
}
const bagla = (tok: string, id: string): Taraf => {
  const t: Taraf = { ws: new WebSocket(`${WSB}/arena?t=${tok}&m=${id}`), frames: [], end: null, hello: false };
  t.ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'arena:hello') t.hello = true;
    else if (m.t === 'arena:frames') for (const f of m.frames) t.frames.push(f);
    else if (m.t === 'arena:end') t.end = m;
  });
  return t;
};
const ta = bagla(tokA, setupA.matchId);
const tb = bagla(tokB, setupB.matchId);
await bekle(600);
check('iki taraf da bağlandı', ta.hello && tb.hello);

// 4 saniye oyna — iki taraf da hareket etsin
const bitis = Date.now() + 4000;
let i = 0;
while (Date.now() < bitis) {
  const a = (i / 20) * 0.6;
  ta.ws.send(JSON.stringify({ t: 'in', x: Math.cos(a), y: Math.sin(a) }));
  tb.ws.send(JSON.stringify({ t: 'in', x: -Math.cos(a), y: Math.sin(a) }));
  i += 1;
  await bekle(50);
}
await bekle(300);

console.log(`     A ${ta.frames.length} kare · B ${tb.frames.length} kare`);
check('kare akışı geliyor', ta.frames.length > 100, `${ta.frames.length}`);
// ⚠️ EN KRİTİK KONTROL: iki tarafa AYNI kareler gitmeli. Farklı gitseydi
// iki tarayıcı farklı dünya simüle ederdi ve kimse hata görmezdi.
const ortak = Math.min(ta.frames.length, tb.frames.length);
const ayni = JSON.stringify(ta.frames.slice(0, ortak)) === JSON.stringify(tb.frames.slice(0, ortak));
check('iki tarafa BİREBİR aynı kareler gitti', ayni, `${ortak} kare`);

// ⚠️ Girdi gerçekten iletiliyor mu — hep sıfır gelseydi test boşuna geçerdi
const hareket = ta.frames.filter((f) => f[0] !== 0 || f[1] !== 0).length;
const rakipHareket = ta.frames.filter((f) => f[2] !== 0 || f[3] !== 0).length;
check('kendi girdim akışta', hareket > 50, `${hareket} kare`);
check('RAKİBİN girdisi de akışta', rakipHareket > 50, `${rakipHareket} kare`);

console.log('\n[3] ⭐ İstemci akışı oynatınca sunucuyla AYNI dünyayı kuruyor mu');
{
  // İstemcinin yaptığı şeyin aynısı: kurulumdan oyun kur, gelen kareleri uygula
  const ga = buildArenaGame(setupA);
  const gb = buildArenaGame(setupB);
  const oynat = (g: ReturnType<typeof buildArenaGame>, fs: InputFrame[]) => {
    for (const f of fs) {
      if (g.phase === 'dead' || g.phase === 'won') break;
      if (g.phase === 'levelup') { if (g.offers.length) g.choose(g.offers[0].id); continue; }
      g.setInput(f[0], f[1]); g.setRivalInput(f[2], f[3]); g.step();
    }
    return [g.hero.kills, g.rival!.kills, Math.round(g.hero.px), Math.round(g.rival!.px),
      Math.round(g.hero.hp), Math.round(g.rival!.hp), g.enemies.length].join('|');
  };
  const sa = oynat(ga, ta.frames.slice(0, ortak));
  const sb = oynat(gb, tb.frames.slice(0, ortak));
  console.log(`     ${sa}`);
  // ⚠️ Lockstep'in tamamı bu satıra bakıyor.
  check('iki istemci AYNI dünyayı simüle etti', sa === sb);
  check('dünya gerçekten ilerledi', !sa.startsWith('0|0|'), sa.slice(0, 20));
}

console.log('\n[4] Bağlantı kopunca maç DURMUYOR');
{
  const oncekiKare = tb.frames.length;
  ta.ws.close();
  await bekle(1200);
  check('kopan tarafın rakibi kare almaya DEVAM ediyor',
    tb.frames.length > oncekiKare, `${oncekiKare} → ${tb.frames.length}`);
  check('maç bitmedi', tb.end === null);
}

console.log('\n[5] Temizlik');
{
  tb.ws.close();
  await bekle(800);
  const kalan = await fetch(`${API}/arena/queue`, {
    method: 'DELETE', headers: { authorization: `Bearer ${tokA}` },
  }).then((r) => r.ok);
  check('kuyruktan çıkış çalışıyor', kalan);
}

await prisma.duel.deleteMany({ where: { challenger: { startsWith: P } } });
await prisma.duel.deleteMany({ where: { defender: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ ARENA UÇTAN UCA ÇALIŞIYOR' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
