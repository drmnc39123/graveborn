// ARENA SÖZLEŞMESİ — lockstep'in ayakta durduğu tek varsayım.
//
// Buradaki risk hepsinden sinsi: iki taraf da KENDİ İÇİNDE tutarlı çalışır,
// hiç hata vermez, ama farklı dünyalar simüle eder. Oyuncular birbirinin
// olmayan bir maçını oynar ve kimse sebebini bulamaz.
//
// Bu yüzden test tek soruyu soruyor: AYNI KURULUM + AYNI GİRDİ → AYNI DÜNYA?
//
// Çalıştır:  npx tsx src/game/arena.test.mts

import { ARENA, arenaWinner, buildArenaGame, type ArenaSetup, type InputFrame } from './arena.js';
import type { Game } from './engine.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

function kurulum(side: 0 | 1 = 0, seed = 20260806): ArenaSetup {
  return {
    matchId: 'test-match', seed, stageId: 1, side,
    players: [
      { wallet: 'A', heroId: 'knight', permanent: { might: 0.2 }, duelRating: 1000 },
      { wallet: 'B', heroId: 'ranger', permanent: { maxHp: 0.3 }, duelRating: 1010 },
    ],
  };
}

/** Deterministik ama değişken girdi dizisi — sabit girdi çok az şey kanıtlar */
function frames(n: number): InputFrame[] {
  const out: InputFrame[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / 60) * 0.7, b = (i / 60) * -0.4;
    out.push([Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)]);
  }
  return out;
}

function oynat(g: Game, fs: InputFrame[]): string {
  for (const [ax, ay, bx, by] of fs) {
    if (g.phase === 'dead' || g.phase === 'won') break;
    if (g.phase === 'levelup') { g.choose(g.offers[0].id); continue; }
    g.setInput(ax, ay);
    g.setRivalInput(bx, by);
    g.step();
  }
  return [
    g.hero.kills, g.rival!.kills, g.hero.level, g.rival!.level,
    Math.round(g.hero.px), Math.round(g.hero.py),
    Math.round(g.rival!.px), Math.round(g.rival!.py),
    Math.round(g.hero.hp), Math.round(g.rival!.hp),
    g.enemies.length, g.gems.length, g.phase,
  ].join('|');
}

console.log('\n═══ ARENA SÖZLEŞMESİ ═══');

console.log('\n[1] Kurulum iki tarafta da AYNI dünyayı veriyor');
{
  const fs = frames(60 * 30);
  // ⚠️ `side` sadece "hangisi benim" sorusunu cevaplıyor; simülasyon aynı
  // olmak ZORUNDA. Farklı olsaydı iki oyuncu farklı maç oynardı.
  const a = oynat(buildArenaGame(kurulum(0)), fs);
  const b = oynat(buildArenaGame(kurulum(1)), fs);
  console.log(`     ${a}`);
  check('side 0 ve side 1 BİREBİR aynı dünyayı simüle ediyor', a === b);

  // Sunucu da aynı fonksiyonu çağırıyor — üçüncü bir koşu da aynı olmalı
  const c = oynat(buildArenaGame(kurulum(0)), fs);
  check('üçüncü koşu da aynı (sunucu tarafı)', a === c);
}

console.log('\n[2] ⭐ GÖRÜŞ ALANI MÜHÜRLÜ — pencere boyutu dünyayı değiştiremiyor');
{
  // ⚠️ EN SİNSİ HATA BURADA OLURDU. Doğum halkasının yarıçapı görüş
  // alanından geliyor; mühürlü olmasaydı dizüstünde ve masaüstünde oynayan
  // iki oyuncu FARKLI düşmanlar görür, lockstep sessizce çökerdi.
  const fs = frames(60 * 20);
  const g1 = buildArenaGame(kurulum(0));
  g1.setViewport(2560, 1440);          // render katmanı böyle çağırıyor
  const g2 = buildArenaGame(kurulum(0));
  g2.setViewport(800, 600);
  check('farklı pencere boyutu AYNI dünyayı veriyor', oynat(g1, fs) === oynat(g2, fs));

  const g3 = buildArenaGame(kurulum(0));
  check('mühürlü görüş alanı arena sabitinde',
    (g3 as unknown as { viewW: number }).viewW === ARENA.viewW, `${ARENA.viewW}`);
}

console.log('\n[3] Kurulum gerçekten iki AYRI dövüşçü kuruyor');
{
  const g = buildArenaGame(kurulum(0));
  check('rakip sahnede', !!g.rival);
  check('0. oyuncu hero', g.hero.heroId === 'knight', g.hero.heroId);
  check('1. oyuncu rival', g.rival!.heroId === 'ranger', g.rival!.heroId);
  // ⚠️ Bonuslar KARIŞMAMALI: rakibin canı kendi bonusundan gelmeli
  check('her dövüşçü KENDİ bonusunu taşıyor',
    g.rival!.stats.maxHp > g.hero.stats.maxHp,
    `${g.hero.stats.maxHp.toFixed(0)} vs ${g.rival!.stats.maxHp.toFixed(0)}`);
  check('birinci oyuncunun hasarı bonuslu', g.hero.stats.might > 1, `${g.hero.stats.might}`);
}

console.log('\n[4] Kazanan tek yerden okunuyor');
{
  const g = buildArenaGame(kurulum(0));
  check('maç sürerken kazanan yok', arenaWinner(g) === null);
  // ⚠️ `phase` BİRİNCİ oyuncunun gözünden yazılıyor; çevirme tek yerde.
  (g as unknown as { phase: string }).phase = 'dead';
  check('0. oyuncu ölünce kazanan 1', arenaWinner(g) === 1);
  (g as unknown as { phase: string }).phase = 'won';
  check('1. oyuncu ölünce kazanan 0', arenaWinner(g) === 0);
}

console.log('\n[5] Farklı seed farklı maç (test kendini kandırmasın)');
{
  const fs = frames(60 * 15);
  const a = oynat(buildArenaGame(kurulum(0, 111)), fs);
  const b = oynat(buildArenaGame(kurulum(0, 222)), fs);
  check('farklı seed → farklı dünya', a !== b);
}

console.log('\n[6] Protokol sabitleri tutarlı');
{
  check('simülasyon hızı 60 Hz', ARENA.hz === 60);
  check('paket boyu tick sayısını bölüyor', ARENA.batch > 0 && ARENA.batch <= 10,
    `${ARENA.batch} tick/paket → ${(ARENA.hz / ARENA.batch).toFixed(0)} mesaj/sn`);
  // ⚠️ Telden geçen veri: 4 sayı × paket başına tick. Bant genişliği iddiası
  // ölçülebilir olmalı, yoksa "lockstep ucuz" bir slogan olur.
  const bytePerSec = (ARENA.hz / ARENA.batch) * (ARENA.batch * 4 * 8 + 24);
  console.log(`     kaba bant genişliği ≈ ${(bytePerSec / 1024).toFixed(1)} KB/sn`);
  check('bant genişliği 5 KB/sn altında', bytePerSec < 5120, `${bytePerSec.toFixed(0)} B/sn`);
  check('maç süresi tavanı var', ARENA.maxMatchSec > 0 && ARENA.maxMatchSec <= 3600);
}

console.log(`\n${FAIL.length === 0 ? '✅ ARENA SÖZLEŞMESİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
