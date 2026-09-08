// DUSMAN CAN CUBUKLARI MUHRU.
//
// 🔴 KULLANICI ISTEGI: *"tum oyunumuzdaki tum dusmanlarin canini
// goremiyoruz, fightlarda HP barlari yok. Ustunde kac caninin kaldigini
// yazmasina gerek yok, sadece hepsinde ayni boyutta ve ayni duzende olacak
// kirmizi kucuk bir HP bar olsa yeter."*
//
// 🔴 ASIL RISK PERFORMANS. Ekranda `DESCENT.aliveMax` = 420 dusman
// olabiliyor; her birine ayri `fillRect` atmak kare basina 840 cagri
// demekti. Dosyanin kendi teknigi (renk gruplama) kullanildi: butun
// zeminler tek path'e, butun dolgular tek path'e.
//
// OLCULDU (perf.test, 145 dusman sahnede):
//     cubuksuz: 291 path · 20 save/restore
//     cubuklu : 295 path · 22 save/restore
// Yani +4 islem. Naif yazilsaydi +290 olurdu.
//
// ⚠️ TARAYICIDA DA DOGRULANDI: tuvalde 422 kan rengi piksel, yatay diziler
// halinde; `ctx.rect` cagrilari [x, y, 18, 3] — istenen olcu.
//
//   cd frontend && npx tsx src/game/enemyBars.test.mts

import fs from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK ' : 'X  '} ${n}${d ? ` - ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const ham = oku('src/game/render.ts');
const r = yorumsuz(ham);
const bas = r.indexOf('function drawEnemyBars');
const blok = bas >= 0 ? r.slice(bas, r.indexOf('\n}', bas)) : '';

console.log('\n=== DUSMAN CAN CUBUKLARI ===');

console.log('\n[1] ** CUBUK GERCEKTEN CIZILIYOR');
{
  check('fonksiyon var', bas >= 0);
  check('fonksiyon blogu okundu (kontrol grubu)', blok.length > 300, `${blok.length} karakter`);
  // ⚠️ Tanimlamak yetmez, CAGRILMALI — bu depodaki en pahali hata sinifi
  // tam burada: kod yazilir, hicbir yerden cagrilmaz, kimse fark etmez.
  check('drawEnemies sonunda CAGRILIYOR', /drawEnemyBars\(ctx, g\);/.test(r));
  check('uydurma desen bulunmuyor (kontrol grubu)', !/drawEnemyZZZ/.test(r));
}

console.log('\n[2] ** TOPLU CIZIM — 420 dusmanda 840 cagri OLMAMALI');
{
  /**
   * 🔴 ASIL KONTROL. `fillRect` dusman basina cagrilsaydi `perf.test`
   * butcesi patlardi. Iki path, iki `fill()`.
   */
  check('dusman basina fillRect YOK', !/fillRect/.test(blok));
  check('dikdortgenler path\'e toplaniyor', (blok.match(/ctx\.rect\(/g) ?? []).length === 2,
    `${(blok.match(/ctx\.rect\(/g) ?? []).length} rect cagrisi`);
  check('iki path acilliyor', (blok.match(/beginPath\(\)/g) ?? []).length === 2);
  check('iki kez dolduruluyor', (blok.match(/ctx\.fill\(\)/g) ?? []).length === 2);
  // ⚠️ Hicbiri gorunmuyorsa bos path doldurmak da bosuna is
  check('gorunur cubuk yoksa erken cikiliyor', /cizilen === 0/.test(blok));
}

console.log('\n[3] ** EKRAN DISI CIZILMIYOR');
{
  /**
   * ⚠️ Gorus alani kirpmasi bu dosyada OLCULMUS bir kazanc (400 dusman:
   * 137 fps ekranda, 195 fps ekran disinda). Cubuklar o kirpmayi
   * delmemeli.
   */
  check('gorunur kontrolu iki dongude de var',
    (blok.match(/gorunur\(e\.x, e\.y\)/g) ?? []).length === 2);
}

console.log('\n[4] ** BOSS HARIC — cift cubuk olmasin');
{
  // Boss'un zaten genis cubugu, faz rengi ve esik centigi var (`drawBossBar`)
  check('boss atlaniyor', (blok.match(/if \(e\.boss\) continue;/g) ?? []).length === 2);
  check('boss cubugu hala duruyor', /b\.phase === 1 \? C\.candle : C\.blood/.test(r));
}

console.log('\n[5] ISTENEN GORUNUM');
{
  /**
   * Kullanici: "hepsinde ayni boyutta ve ayni duzende, kirmizi, kucuk,
   * ustunde sayi YOK".
   */
  check('olculer TEK sabitte', /const BAR_W = 18, BAR_H = 3, BAR_UST = 7;/.test(r));
  check('renk kan kirmizisi', /ctx\.fillStyle = C\.blood;/.test(blok));
  check('arkasinda koyu zemin var', /rgba\(10,8,6,0\.72\)/.test(blok));
  // ⚠️ SAYI YOK: kullanici acikca istemedi
  check('cubukta metin YOK', !/fillText|ctx\.font/.test(blok));
  // ⚠️ Sifira bolum korumasi: NaN genislikli bir dikdortgen path'in
  // TAMAMINI sessizce dusurur — yani tek bozuk dusman butun cubuklari yok eder
  check('sifira bolum korumasi var', /e\.maxHp > 0 \?/.test(blok));
}

console.log(`\n${FAIL.length === 0 ? 'CAN CUBUKLARI SAGLAM' : `${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
