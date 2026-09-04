// GÜNLÜK İNİŞ — uçtan uca mühür. Sunucu ayaktayken çalışır.
//
//   npx tsx src/daily.test.mts
//
// ⚠️ NİYE UÇTAN UCA: günlüğün tek anlamı "herkes AYNI koşuyu oynar" ve bu
// iddia ancak İKİ AYRI CÜZDANLA ölçülebilir. Tek cüzdanla yapılan bir
// birim testi, tohumun kişiye göre değiştiğini FARK ETMEZDİ.

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { prisma } from './db.js';
import { gunBaslangici, gunlukTozu } from '@game/daily';

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
  try { json = text ? JSON.parse(text) : null; } catch { /* metin */ }
  return { status: res.status, json };
}

/** Taze bir cüzdanla giriş yap, jetonu döndür */
async function girisYap() {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const n = await api('/auth/nonce', { method: 'POST', body: { wallet } });
  const imza = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.json.message), kp.secretKey));
  const v = await api('/auth/verify', { method: 'POST', body: { wallet, signature: imza } });
  if (v.status !== 200) throw new Error(`giriş başarısız: ${v.status}`);
  return { wallet, token: v.json.token as string };
}

/**
 * Koşunun açılışını geriye al — uzun bir koşuyu taklit etmenin dürüst yolu.
 * ⚠️ Üretim koduna "testte süre kontrolünü atla" koymak alternatifti; o
 * kaçamak canlıda da açık kalırdı.
 */
async function geriAl(runId: string, saniye: number) {
  await prisma.run.update({
    where: { id: runId },
    data: { startedAt: new Date(Date.now() - saniye * 1000) },
  });
}

console.log('\n[1] DURUM UCU');
const a = await girisYap();
const b = await girisYap();
const d1 = await api('/daily', { token: a.token });
const d2 = await api('/daily', { token: b.token });
check('durum ucu 200', d1.status === 200, String(d1.status));
check('iki oyuncuya AYNI bölüm', d1.json.stageId === d2.json.stageId,
  `${d1.json.stageId} vs ${d2.json.stageId}`);
check('gün damgası UTC biçiminde', /^\d{4}-\d{2}-\d{2}$/.test(d1.json.day ?? ''), d1.json.day);
// ⚠️ TOHUM SIZMAMALI: tohumu bilen oyuncu motoru offline koşturup en iyi
// yolu bulabilirdi. Durum ucu onu HİÇ göndermemeli.
check('durum ucu TOHUM SIZDIRMIYOR', !('seed' in (d1.json ?? {})),
  JSON.stringify(Object.keys(d1.json ?? {})));
check('yeni oyuncunun hakkı duruyor', d1.json.mine?.done === false);

console.log('\n[2] AYNI TOHUM, EŞİTLENMİŞ GÜÇ');
const ra = await api('/run/start', { method: 'POST', token: a.token, body: { mode: 'daily', stageId: 99 } });
const rb = await api('/run/start', { method: 'POST', token: b.token, body: { mode: 'daily', stageId: 1 } });
check('günlük koşu açılıyor', ra.status === 200 && rb.status === 200, `${ra.status}/${rb.status}`);
// ⭐ ASIL İDDİA: iki farklı cüzdan, aynı tohum.
check('İKİ OYUNCUYA AYNI TOHUM', ra.json.seed === rb.json.seed, `${ra.json.seed} vs ${rb.json.seed}`);
// ⚠️ İstemcinin gönderdiği stageId (99 ve 1) YOK SAYILMALI — bölümü sunucu seçiyor.
check('istemcinin bölümü yok sayılıyor', ra.json.stageId === rb.json.stageId && ra.json.stageId === d1.json.stageId,
  `${ra.json.stageId} / ${rb.json.stageId} / ${d1.json.stageId}`);
check('eşitleme bayrağı açık', ra.json.equalize === true);
check('checkpoint yok (derinlik 1)', ra.json.startDepth === 1, String(ra.json.startDepth));
check('ascension yok', ra.json.ascension === 0, String(ra.json.ascension));
check('tılsım taşınmıyor', Array.isArray(ra.json.charms) && ra.json.charms.length === 0);
check('lonca bonusu 0', ra.json.guildGrowth === 0);
check('ekipman bonusu boş', Object.keys(ra.json.gear ?? {}).length === 0);
check('beceri bonusu boş', Object.keys(ra.json.skills ?? {}).length === 0);

console.log('\n[3] TEK DENEME');
const tekrar = await api('/run/start', { method: 'POST', token: a.token, body: { mode: 'daily', stageId: 1 } });
check('ikinci deneme reddediliyor', tekrar.status === 409, `${tekrar.status} ${tekrar.json?.error ?? ''}`);
// ⚠️ ÇİFT TARAFLI: normal iniş engellenmemeli — günlük kapısı yalnız
// günlüğü kapatıyor, oyuncunun gününü değil.
const normal = await api('/run/start', { method: 'POST', token: a.token, body: { mode: 'campaign', stageId: 1 } });
check('normal koşu ETKİLENMİYOR', normal.status === 200, String(normal.status));

console.log('\n[4] ÖDÜL — TOZ, GOLD DEĞİL');
// Yeni bir cüzdan: koşuyu geriye alıp meşru bir derinlik iddia edeceğiz.
const c = await girisYap();
const rc = await api('/run/start', { method: 'POST', token: c.token, body: { mode: 'daily', stageId: 1 } });
await geriAl(rc.json.runId, 900);          // 15 dk koştuğunu varsay
const oncesi = await api('/progress', { token: c.token });
const bitti = await api('/run/finish', {
  method: 'POST', token: c.token,
  body: { runId: rc.json.runId, deepestCleared: 6, rareGold: 0, cleared: false },
});
check('koşu kapanıyor', bitti.status === 200, String(bitti.status));
check('GOLD ÖDENMİYOR', bitti.json.progressGold === 0 && bitti.json.dropGold === 0,
  `${bitti.json.progressGold}/${bitti.json.dropGold}`);
const derin = bitti.json.daily?.depth ?? 0;
const toz = bitti.json.daily?.dust ?? 0;
check('derinlik kabul edildi', derin > 0, String(derin));
check('toz formülle birebir', toz === gunlukTozu(derin), `${toz} ≠ ${gunlukTozu(derin)}`);
check('toz gerçekten yatırıldı',
  (bitti.json.progress?.dust ?? 0) === (oncesi.json.progress?.dust ?? 0) + toz,
  `${oncesi.json.progress?.dust} → ${bitti.json.progress?.dust}`);
// ⚠️ Günlük kampanya ilerlemesini İLERLETMEMELİ: ilerletseydi checkpoint'ler
// eşitlenmiş bir modda kazanılırdı.
check('depthPaid ilerlemiyor',
  Object.keys(bitti.json.progress?.depthPaid ?? {}).length === 0,
  JSON.stringify(bitti.json.progress?.depthPaid));

console.log('\n[5] KIRPILAN KOŞU TABLOYA GİRMİYOR');
const e = await girisYap();
const re = await api('/run/start', { method: 'POST', token: e.token, body: { mode: 'daily', stageId: 1 } });
// Geriye ALMADAN derin bir iddia → fizik tavanı kırpar
const yalan = await api('/run/finish', {
  method: 'POST', token: e.token,
  body: { runId: re.json.runId, deepestCleared: 400, rareGold: 0, cleared: false },
});
check('uydurma derinlik kırpılıyor', yalan.json.daily?.capped === true, JSON.stringify(yalan.json.daily));
check('kırpılan koşu TOZ ALMIYOR', yalan.json.daily?.dust === 0, String(yalan.json.daily?.dust));
const tablo = await api('/daily', { token: e.token });
const kirpilanVar = (tablo.json.board ?? []).some((r: any) => r.wallet === e.wallet);
check('kırpılan koşu TABLODA YOK', !kirpilanVar);
const mesruVar = (tablo.json.board ?? []).some((r: any) => r.wallet === c.wallet);
check('meşru koşu TABLODA VAR (çift taraflı)', mesruVar);
check('hak kullanıldı olarak görünüyor', tablo.json.mine?.done === true);

// ── temizlik: bu testin açtığı hesaplar canlı sayımı kirletmesin ──
const cuzdanlar = [a.wallet, b.wallet, c.wallet, e.wallet];
await prisma.run.deleteMany({ where: { wallet: { in: cuzdanlar } } });
await prisma.player.deleteMany({ where: { wallet: { in: cuzdanlar } } });
void gunBaslangici;

console.log(`\n${FAIL.length === 0 ? '✅ GÜNLÜK İNİŞ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
