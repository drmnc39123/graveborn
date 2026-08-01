// UÇTAN UCA — sunucu çalışırken gerçek bir Solana anahtar çiftiyle tam akış.
//
// Çalıştır: sunucu ayaktayken  npx tsx src/e2e.test.mts
//
// Test ettiği şey birim testlerden farklı: HTTP katmanı, oturum jetonu, imza
// doğrulama ve veritabanı gerçekten birlikte çalışıyor mu.

import nacl from 'tweetnacl';
import bs58 from 'bs58';

const API = process.env.API ?? 'http://localhost:4100';
const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

async function api(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* metin döndü */ }
  return { status: res.status, json, text };
}

// ── sahte cüzdan ──
const kp = nacl.sign.keyPair();
const wallet = bs58.encode(kp.publicKey);
const sign = (msg: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey));

console.log(`\nCüzdan: ${wallet}`);

console.log('\n[1] Kimlik');
const nonceRes = await api('/auth/nonce', { method: 'POST', body: { wallet } });
check('nonce alınıyor', nonceRes.status === 200 && !!nonceRes.json?.message, `${nonceRes.status}`);

const badSig = await api('/auth/verify', { method: 'POST', body: { wallet, signature: bs58.encode(new Uint8Array(64)) } });
check('YANLIŞ imza reddediliyor', badSig.status === 401, `${badSig.status}`);

// Nonce yakıldı → yeniden al
const n2 = await api('/auth/nonce', { method: 'POST', body: { wallet } });
const good = await api('/auth/verify', { method: 'POST', body: { wallet, signature: sign(n2.json.message) } });
check('doğru imza kabul ediliyor', good.status === 200 && !!good.json?.token, `${good.status}`);
const token = good.json?.token as string;

const replay = await api('/auth/verify', { method: 'POST', body: { wallet, signature: sign(n2.json.message) } });
check('AYNI imza ikinci kez çalışmıyor (nonce tüketildi)', replay.status === 401, `${replay.status}`);

console.log('\n[2] Yetki');
check('jetonsuz ilerleme okunamıyor', (await api('/progress')).status === 401);
check('UYDURMA jeton reddediliyor', (await api('/progress', { token: 'sahte.jeton' })).status === 401);
const prog = await api('/progress', { token });
check('geçerli jetonla okunuyor', prog.status === 200 && prog.json?.progress?.gold === 0,
  `gold ${prog.json?.progress?.gold}`);

console.log('\n[3] Koşu — kilitli bölüm');
const locked = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 5 } });
check('kilitli bölüm başlatılamıyor', locked.status === 400, `${locked.status} ${locked.json?.detay ?? ''}`);
const noDescent = await api('/run/start', { method: 'POST', token, body: { mode: 'descent', stageId: 1 } });
check('temizlenmemiş bölümün descent\'i başlatılamıyor', noDescent.status === 400, `${noDescent.json?.detay ?? ''}`);

console.log('\n[4] Koşu — dürüst akış');
const start = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 1 } });
check('koşu açılıyor', start.status === 200 && !!start.json?.runId, `${start.status}`);
check('SEED SUNUCUDAN geliyor', typeof start.json?.seed === 'number', `${start.json?.seed}`);
const runId = start.json.runId as string;

const fin = await api('/run/finish', {
  method: 'POST', token,
  body: { runId, deepestCleared: 0, rareGold: 25, cleared: true },
});
check('koşu kapanıyor', fin.status === 200, `${fin.status}`);
check('ilk geçiş ödülü ödendi', fin.json?.progressGold === 300, `+${fin.json?.progressGold}`);
check('nadir düşüş de ödendi', fin.json?.dropGold === 25, `+${fin.json?.dropGold}`);
check('2. bölüm açıldı', fin.json?.progress?.unlockedStage === 2, `${fin.json?.progress?.unlockedStage}`);

console.log('\n[5] Tekrar kullanım ve yalan');
const again = await api('/run/finish', { method: 'POST', token, body: { runId, deepestCleared: 0, rareGold: 25, cleared: true } });
check('AYNI runId ikinci kez kapatılamıyor', again.status === 409, `${again.status}`);

const s2 = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 1 } });
const replayStage = await api('/run/finish', {
  method: 'POST', token, body: { runId: s2.json.runId, deepestCleared: 0, rareGold: 0, cleared: true },
});
check('geçilmiş bölüm tekrar ilerleme ödemiyor', replayStage.json?.progressGold === 0,
  `+${replayStage.json?.progressGold}`);

const s3 = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 1 } });
const liar = await api('/run/finish', {
  method: 'POST', token, body: { runId: s3.json.runId, deepestCleared: 0, rareGold: 5_000_000, cleared: true },
});
// ⚠️ Sadece "< 5.000.000" demek YETMEZ: istek 500 dönüp dropGold undefined
// olsaydı bu kontrol de geçerdi. İstek BAŞARILI olmalı ve kırpılmış olmalı.
check('UYDURMA gold sunucuda kırpılıyor',
  liar.status === 200 && typeof liar.json?.dropGold === 'number' && liar.json.dropGold < 5_000_000,
  `${liar.status} · istedi 5.000.000, aldı ${liar.json?.dropGold}`);

console.log('\n[6] Başkasının koşusunu kapatamama');
const kp2 = nacl.sign.keyPair();
const w2 = bs58.encode(kp2.publicKey);
const n3 = await api('/auth/nonce', { method: 'POST', body: { wallet: w2 } });
const v2 = await api('/auth/verify', {
  method: 'POST',
  body: { wallet: w2, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(n3.json.message), kp2.secretKey)) },
});
const s4 = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 2 } });
const stolen = await api('/run/finish', {
  method: 'POST', token: v2.json.token,
  body: { runId: s4.json.runId, deepestCleared: 0, rareGold: 0, cleared: true },
});
check('başka cüzdan koşuyu kapatamıyor', stolen.status === 404, `${stolen.status}`);

console.log('\n[7] Forge alımı sunucuda doğrulanıyor');
const buyTooMuch = await api('/progress/buy', { method: 'POST', token, body: { id: 'amount' } });
check('parası yetmeyen alım reddediliyor', buyTooMuch.status === 400, `${buyTooMuch.json?.error}`);

// Bakiyeyi ÖLÇ, varsayma: yukarıdaki koşular değişken miktarda gold bıraktı.
const beforeBuy = (await api('/progress', { token })).json.progress.gold as number;
const buyOk = await api('/progress/buy', { method: 'POST', token, body: { id: 'might' } });
check('parası yeten alım geçiyor', buyOk.status === 200, `${buyOk.json?.error ?? 'ok'}`);
check('gold sunucuda tam olarak düşüldü',
  buyOk.json?.progress?.gold === beforeBuy - buyOk.json?.spent,
  `${beforeBuy} − ${buyOk.json?.spent} = ${buyOk.json?.progress?.gold}`);
check('yükseltme seviyesi arttı', (buyOk.json?.progress?.upgrades?.might ?? 0) >= 1,
  `might ${buyOk.json?.progress?.upgrades?.might}`);

console.log(`\n${FAIL.length === 0 ? '✅ UÇTAN UCA SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
