// UÇTAN UCA — sunucu çalışırken gerçek bir Solana anahtar çiftiyle tam akış.
//
// Çalıştır: sunucu ayaktayken  npx tsx src/e2e.test.mts
//
// Test ettiği şey birim testlerden farklı: HTTP katmanı, oturum jetonu, imza
// doğrulama ve veritabanı gerçekten birlikte çalışıyor mu.

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { prisma } from './db.js';

/**
 * Koşunun açılış zamanını geriye al — uzun bir koşuyu taklit etmenin dürüst
 * yolu. Alternatif, üretim koduna "test modunda süre kontrolünü atla" gibi
 * bir kaçamak koymak olurdu; o kaçamak canlıda da açık kalırdı.
 */
async function geriAl(runId: string, saniye: number) {
  await prisma.run.update({
    where: { id: runId },
    data: { startedAt: new Date(Date.now() - saniye * 1000) },
  });
}

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

console.log('\n[8] Marketplace — HTTP katmanı');
{
  check('jetonsuz kendi ilanlarım okunamıyor', (await api('/market/mine')).status === 401);

  const book = await api('/market/listings');
  check('emir defteri herkese açık', book.status === 200 && Array.isArray(book.json?.listings), `${book.status}`);
  check('token henüz KAPALI olarak bildiriliyor', book.json?.tokenEnabled === false, `${book.json?.tokenEnabled}`);

  // Listeleyecek kadar gold yoksa dürüst yoldan kazan — testi atlamak yerine.
  let bakiye = (await api('/progress', { token })).json.progress.gold as number;
  if (bakiye < 50) {
    const r = await api('/run/start', { method: 'POST', token, body: { mode: 'campaign', stageId: 2 } });
    await api('/run/finish', { method: 'POST', token, body: { runId: r.json.runId, deepestCleared: 0, rareGold: 120, cleared: true } });
    bakiye = (await api('/progress', { token })).json.progress.gold as number;
  }
  check('listeleyecek gold var', bakiye >= 50, `${bakiye} gold`);

  // ⚠️ ASIL RİSK: 2^53'ü aşan fiyat. JSON number olsaydı sessizce yuvarlanırdı.
  const BUYUK = '9007199254740993'; // 2^53 + 1 — number'a çevrilirse ...992 olur
  const listed = await api('/market/list', {
    method: 'POST', token, body: { goldAmount: 50, priceGrave: BUYUK },
  });
  check('ilan açılıyor', listed.status === 200, `${listed.status} ${listed.json?.error ?? ''}`);
  check('2^53 ÜSTÜ fiyat bozulmadan döndü', listed.json?.listing?.priceGrave === BUYUK,
    `${listed.json?.listing?.priceGrave}`);
  check('gold HTTP üzerinden de escrow\'a alındı',
    listed.json?.progress?.gold === bakiye - 50, `${bakiye} → ${listed.json?.progress?.gold}`);
  check('escrow bakiyesi bildiriliyor', listed.json?.escrowedGold === 50, `${listed.json?.escrowedGold}`);

  const listingId = listed.json?.listing?.id as string;

  // Fiyat JSON number olarak gelirse reddedilmeli — bozulma riski kapıda dursun.
  const sayiFiyat = await api('/market/list', { method: 'POST', token, body: { goldAmount: 50, priceGrave: 1000 } });
  check('SAYI fiyat reddediliyor (sadece metin)', sayiFiyat.status === 400, `${sayiFiyat.status}`);

  const negatif = await api('/market/list', { method: 'POST', token, body: { goldAmount: -50, priceGrave: '10' } });
  check('negatif miktar reddediliyor', negatif.status === 400, `${negatif.status}`);

  const yok = await api('/market/list', { method: 'POST', token, body: { goldAmount: 99_999_999, priceGrave: '10' } });
  check('sahip olmadığı gold reddediliyor', yok.status === 409, `${yok.status} ${yok.json?.error}`);

  // Başkasının ilanı — [6]'daki ikinci cüzdan
  const calma = await api('/market/cancel', { method: 'POST', token: v2.json.token, body: { id: listingId } });
  check('başka cüzdan ilanı iptal EDEMİYOR', calma.status === 404, `${calma.status} ${calma.json?.error}`);

  const buy = await api('/market/buy', { method: 'POST', token, body: { id: listingId } });
  check('satın alma token gelene kadar 503', buy.status === 503 && buy.json?.error === 'token_yok',
    `${buy.status} ${buy.json?.error}`);

  const mine = await api('/market/mine', { token });
  check('kendi ilanım listeleniyor', mine.json?.listings?.some((l: any) => l.id === listingId));

  const iptal = await api('/market/cancel', { method: 'POST', token, body: { id: listingId } });
  check('kendi ilanımı iptal edebiliyorum', iptal.status === 200, `${iptal.status}`);
  check('gold HTTP üzerinden geri geldi', iptal.json?.progress?.gold === bakiye, `${iptal.json?.progress?.gold}`);
  check('escrow sıfırlandı', iptal.json?.escrowedGold === 0, `${iptal.json?.escrowedGold}`);
}

console.log('\n[9] Leaderboard — HTTP katmanı');
{
  const bos = await api('/leaderboard');
  check('tablo herkese açık', bos.status === 200 && Array.isArray(bos.json?.rows), `${bos.status}`);
  check('oturumsuz istekte kendi sıran YOK', bos.json?.me === null, `${JSON.stringify(bos.json?.me)}`);

  // Descent'e girebilmek için bölüm 1 zaten [4]'te temizlendi.
  //
  // ⚠️ SÜRE TABANI: derinlik 12 için sunucu ~500 saniyelik bir koşu bekliyor
  // (düşmanlar spawn hızından daha çabuk sahneye çıkamaz). Test 500 saniye
  // bekleyemez, o yüzden koşunun AÇILIŞ ZAMANINI geriye alıyoruz — dürüst
  // bir oyuncuyu taklit etmenin tek dürüst yolu bu. Üretim koduna test
  // kaçamağı eklemek, o kaçamağı canlıda da açık bırakmak olurdu.
  const d1 = await api('/run/start', { method: 'POST', token, body: { mode: 'descent', stageId: 1 } });
  check('descent koşusu açılıyor', d1.status === 200, `${d1.status} ${d1.json?.detay ?? ''}`);

  // Önce SÜRESİZ dene: yalan burada yakalanmalı
  const hizli = await api('/run/finish', {
    method: 'POST', token, body: { runId: d1.json.runId, deepestCleared: 12, rareGold: 0, cleared: false },
  });
  check('SANİYELER içinde derinlik 12 iddiası kırpılıyor',
    hizli.json?.progressGold === 0 && hizli.json?.record === false,
    `+${hizli.json?.progressGold} · rekor ${hizli.json?.record}`);

  const d1b = await api('/run/start', { method: 'POST', token, body: { mode: 'descent', stageId: 1 } });
  await geriAl(d1b.json.runId, 600);
  const f1 = await api('/run/finish', {
    method: 'POST', token, body: { runId: d1b.json.runId, deepestCleared: 12, rareGold: 0, cleared: false },
  });
  check('derinlik ödendi', f1.json?.progressGold > 0, `+${f1.json?.progressGold}`);
  check('REKOR bildirildi', f1.json?.record === true, `${f1.json?.record}`);

  const mine = await api('/leaderboard', { token });
  check('kendi sıram dönüyor', mine.json?.me?.rank >= 1, `#${mine.json?.me?.rank}`);
  check('sıra derinliği doğru', mine.json?.me?.row?.depth === 12, `${mine.json?.me?.row?.depth}`);
  check('tabloda görünüyorum', mine.json?.rows?.some((r: any) => r.wallet === wallet));

  // ⭐ Daha SIĞ bir koşu rekoru düşürmemeli
  const d2 = await api('/run/start', { method: 'POST', token, body: { mode: 'descent', stageId: 1 } });
  await geriAl(d2.json.runId, 600);
  const f2 = await api('/run/finish', {
    method: 'POST', token, body: { runId: d2.json.runId, deepestCleared: 4, rareGold: 0, cleared: false },
  });
  check('sığ koşu REKOR bildirmiyor', f2.json?.record === false, `${f2.json?.record}`);
  const after = await api('/leaderboard', { token });
  check('rekor korundu', after.json?.me?.row?.depth === 12, `${after.json?.me?.row?.depth}`);

  // ⭐ UYDURMA derinlik: uzun süre beklemek bile 99.999'u meşrulaştırmamalı.
  // Kırpılan koşu leaderboard'a HİÇ yazılmamalı — gold'da kırpıp kalanı
  // ödemek zararsız, sıralamada tek yalan tepeyi kalıcı kilitler.
  const d3 = await api('/run/start', { method: 'POST', token, body: { mode: 'descent', stageId: 1 } });
  await geriAl(d3.json.runId, 40 * 60);
  const yalan = await api('/run/finish', {
    method: 'POST', token, body: { runId: d3.json.runId, deepestCleared: 99_999, rareGold: 0, cleared: false },
  });
  check('kırpılan koşu REKOR YAZMIYOR', yalan.json?.record === false, `${yalan.json?.record}`);
  const liarBoard = await api('/leaderboard', { token });
  check('yalancı tabloyu ele geçiremedi', liarBoard.json?.me?.row?.depth === 12,
    `derinlik ${liarBoard.json?.me?.row?.depth}`);
}

console.log(`\n${FAIL.length === 0 ? '✅ UÇTAN UCA SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
