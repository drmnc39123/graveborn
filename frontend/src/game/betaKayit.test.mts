// BETA CUZDAN KAYDI MUHRU — kaynak taramasi.
//
// 🔴 NIYE VAR: 2026-09-16'da HALKA ACIK bir soz verildi — "beta'da cuzdan
// baglayip oynayan herkese acilista hediye". O sozun dayanagi `Player`
// satirlariydi ve `betaSifirla()` o tablonun TAMAMINI siliyor. Yani sozun
// tutulabilmesi, kaydin silmeden ONCE alinmasina bagli.
//
// Davranis testi backend'de (`beta.test.mts`, veritabani istiyor); bu muhur
// `npm test`e giren bekci. Burada olculen tek sey: kaydi kimse kaldirmasin,
// sira bozulmasin, tablo silinenler listesine girmesin.
//
// ⚠️ KAYNAK YORUMLARI SOKULEREK taraniyor.
//
//   cd frontend && npx tsx src/game/betaKayit.test.mts

import { readFileSync, readdirSync } from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
const oku = (p: string) => readFileSync(new URL(`../../../backend/${p}`, import.meta.url), 'utf8');
const yorumsuz = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const admin = yorumsuz(oku('src/admin.ts'));
const beta = yorumsuz(oku('src/beta.ts'));
const sunucu = yorumsuz(oku('src/index.ts'));
const sema = oku('prisma/schema.prisma');

console.log('\n── [1] Kayit sifirlamadan SAG CIKIYOR ──');
{
  // Tablo `Player`a FK ile BAGLANMAMALI: cascade ile birlikte giderdi
  const model = sema.slice(sema.indexOf('model BetaWallet'), sema.indexOf('}', sema.indexOf('model BetaWallet')));
  check('BetaWallet modeli var', model.length > 0);
  check('Player ile ILISKI YOK (cascade ile silinmez)', !/@relation/.test(model), 'relation bulundu');
  check('cuzdan birincil anahtar', /wallet\s+String\s+@id/.test(model));
  check('hediye damgasi alani var (iki kez gonderim onlenir)', /giftSentAt/.test(model));

  // Migration: yalniz tablo, doldurma yok
  const gocler = readdirSync(new URL('../../../backend/prisma/migrations/', import.meta.url));
  const goc = gocler.find((d) => d.endsWith('_beta_wallets'));
  check('migration var', !!goc, goc ?? 'yok');
  const sql = goc ? oku(`prisma/migrations/${goc}/migration.sql`).replace(/--.*$/gm, '') : '';
  check('migration BetaWallet tablosunu aciyor', /CREATE TABLE "BetaWallet"/.test(sql));
  check('migration Player tablosuna DOKUNMUYOR', !/ALTER TABLE "Player"|DROP/i.test(sql));
}

console.log('\n── [2] Sifirlama SILMEDEN ONCE kaydediyor ──');
{
  const govde = admin.slice(admin.indexOf('export async function betaSifirla'));
  const kayit = govde.indexOf('betaAnlikGoruntu(');
  const silme = govde.indexOf('prisma.player.deleteMany');
  check('sifirlama kaydi aliyor', kayit > 0, `@${kayit}`);
  check('KAYIT, oyuncu silmeden ONCE', kayit > 0 && silme > kayit, `kayit @${kayit} · silme @${silme}`);
  check('kuru calistirmada sayi raporlaniyor', /betaCuzdanKaydi/.test(govde));
  // 🔴 En tehlikeli gerileme: tablonun silinenler listesine eklenmesi
  check('BetaWallet silinenler listesinde DEGIL', !/betaWallet\.deleteMany/.test(admin));
}

console.log('\n── [3] Kayit mantigi ──');
{
  const g = beta.slice(beta.indexOf('export async function betaAnlikGoruntu'));
  check('idempotent (upsert)', /betaWallet\.upsert/.test(g));
  check('ilk gorulme KORUNUYOR (update icinde firstSeen yok)',
    !/update:\s*\{[^}]*firstSeen/.test(g));
  check('hediye damgasi EZILMIYOR (update icinde giftSentAt yok)',
    !/update:\s*\{[^}]*giftSentAt/.test(g));
  check('yalniz KAPANMIS kosular sayiliyor', /claimedAt:\s*\{\s*not:\s*null\s*\}/.test(g));
  check('sayfalama var (tek seferde bellege alinmiyor)', /cursor:\s*\{\s*wallet/.test(g));
}

console.log('\n── [4] Uclar ve panel ──');
{
  for (const [yol, ad] of [
    ["app.get('/admin/beta/wallets', adminOnly", 'liste'],
    ["app.post('/admin/beta/snapshot', adminOnly", 'kayit'],
    ["app.get('/admin/beta/export', adminOnly", 'indirme'],
  ] as const) {
    check(`${ad} ucu var ve YONETICIYE KAPALI`, sunucu.includes(yol));
  }
  check('indirme sonuna #EOF muhru koyuyor', /betaAkisi\(\)[\s\S]{0,600}#EOF/.test(sunucu));

  const panel = yorumsuz(readFileSync(new URL('../app/gbadmin123/page.tsx', import.meta.url), 'utf8'));
  check('panelde liste/kayit/indirme dugmeleri var',
    /\/admin\/beta\/wallets/.test(panel) && /\/admin\/beta\/snapshot/.test(panel) && /\/admin\/beta\/export/.test(panel));
  check('panel YARIM inen dosyayi reddediyor (#EOF kontrolu)', /endsWith\('#EOF/.test(panel));
}

console.log(`\n${FAIL.length === 0 ? '✅ BETA KAYDI MUHURLU' : `❌ ${FAIL.length} BASARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
