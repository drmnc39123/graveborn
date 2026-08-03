// ADMIN KAPISI TESTİ — yanlış açılan bir admin ucu, oyuncu verisini ve ban
// yetkisini herkese açar. Kapının kendisi test edilmeli.
import { spawn } from 'node:child_process';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const SECRET = 'test-admin-sirri-12345';

// ⚠️ `shell: true` KULLANMA. Windows'ta kabuk bir torun süreç doğuruyor;
// p.kill() sadece kabuğu öldürüyor, ASIL SUNUCU AYAKTA KALIYOR. İlk sürümde
// tam bu oldu: ikinci sunucu hiç açılmadı, istekler sırsız duran ESKİ sunucuya
// gitti ve "sır tanımlıyken de kapı kapalı" gibi YANLIŞ bir sonuç üretti.
// Node'u doğrudan çağırınca öldürdüğümüz PID gerçek sunucu oluyor.
const TSX_CLI = 'node_modules/tsx/dist/cli.mjs';
const urlFor = (port: number) => `http://localhost:${port}`;

async function boot(port: number, env: Record<string, string>) {
  const p = spawn(process.execPath, [TSX_CLI, 'src/index.ts'], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`${urlFor(port)}/health`)).ok) return p; } catch { /* henüz açılmadı */ }
  }
  p.kill('SIGKILL');
  throw new Error(`sunucu açılmadı (:${port})`);
}

async function stop(p: ReturnType<typeof spawn>) {
  const dead = new Promise((r) => p.once('close', r));
  p.kill('SIGKILL');
  await Promise.race([dead, new Promise((r) => setTimeout(r, 3000))]);
}

/** Her aşama KENDİ portunda — bir süreç sızsa bile aşamalar birbirine karışmasın */
const getFrom = (port: number) => (path: string, secret?: string) =>
  fetch(urlFor(port) + path, { headers: secret ? { 'x-admin-secret': secret } : {} });

// ── 1) SIR TANIMSIZKEN kapı KAPALI olmalı ──
// Varsayılan bir sır koysaydık, unutulduğunda panel herkese açık kalırdı.
console.log('\n[1] ADMIN_SECRET tanımsız');
{
  const PORT = 4137;
  const get = getFrom(PORT);
  const p = await boot(PORT, { ADMIN_SECRET: '' });
  const r = await get('/admin/overview');
  check('sır yokken admin ucu KAPALI', r.status === 403, `HTTP ${r.status}`);
  const r2 = await get('/admin/players', 'herhangi-bir-sey');
  check('sır yokken doğru sır uydurulamaz', r2.status === 403, `HTTP ${r2.status}`);
  await stop(p);
}

// ── 2) SIR TANIMLIYKEN ──
console.log('\n[2] ADMIN_SECRET tanımlı');
{
  const PORT = 4138;
  const BASE = urlFor(PORT);
  const get = getFrom(PORT);
  const p = await boot(PORT, { ADMIN_SECRET: SECRET });

  check('sırsız istek reddediliyor', (await get('/admin/overview')).status === 401);
  check('yanlış sır reddediliyor', (await get('/admin/overview', 'yanlis')).status === 401);
  check('uzunluğu aynı ama yanlış sır reddediliyor',
    (await get('/admin/overview', 'x'.repeat(SECRET.length))).status === 401);

  const ok = await get('/admin/overview', SECRET);
  check('doğru sır geçiyor', ok.status === 200, `HTTP ${ok.status}`);
  const ov = await ok.json() as any;
  check('genel bakış alanları dolu',
    typeof ov.players === 'number' && typeof ov.runsCapped === 'number'
    && typeof ov.goldInCirculation === 'number',
    JSON.stringify(ov));

  const pl = await (await get('/admin/players?sort=capped&limit=5', SECRET)).json() as any;
  check('oyuncu listesi risk sinyalleri taşıyor',
    Array.isArray(pl.players) && (pl.players.length === 0
      || ('cappedRuns' in pl.players[0] && 'goldPerHour' in pl.players[0])),
    `${pl.players?.length} satır`);

  const rn = await (await get('/admin/runs?limit=5', SECRET)).json() as any;
  check('koşu listesi dönüyor', Array.isArray(rn.runs), `${rn.runs?.length} satır`);
  // BigInt JSON'a doğrudan gidemez — seed metne çevrilmeli, yoksa uç 500 verir
  check('seed metin olarak dönüyor (BigInt tuzağı)',
    rn.runs.length === 0 || typeof rn.runs[0].seed === 'string',
    rn.runs[0] ? typeof rn.runs[0].seed : 'kayıt yok');

  // ── ban ──
  const target = pl.players?.[0]?.wallet;
  if (target) {
    const banRes = await fetch(`${BASE}/admin/ban`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': SECRET },
      body: JSON.stringify({ wallet: target, banned: true }),
    });
    const banned = await banRes.json() as any;
    check('ban uygulanıyor', banned.banned === true, JSON.stringify(banned));

    const unRes = await fetch(`${BASE}/admin/ban`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': SECRET },
      body: JSON.stringify({ wallet: target, banned: false }),
    });
    check('ban GERİ ALINABİLİYOR', ((await unRes.json()) as any).banned === false);
  } else {
    console.log('     (veritabanında oyuncu yok, ban testi atlandı)');
  }

  const nf = await get('/admin/player/olmayan-cuzdan-adresi', SECRET);
  check('olmayan oyuncu 404', nf.status === 404, `HTTP ${nf.status}`);

  await stop(p);
}

console.log(`\n${FAIL.length === 0 ? '✅ ADMIN KAPISI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
