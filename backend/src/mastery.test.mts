// KAHRAMAN USTALIĞI — sunucu tarafı mühür. Sunucu ayaktayken çalışır.
//
//   npx tsx src/mastery.test.mts
//
// ⚠️ NİYE KOŞU AKIŞI OYNANMIYOR: burada ölçülen şey koşunun kendisi değil
// (onu `e2e.test` yapıyor), TOPLAMA KURALLARI — hangi koşuların sayıldığı.
// Geçmişi doğrudan yazmak, o kuralları tek tek ve deterministik olarak
// ölçmenin tek dürüst yolu; gerçek koşularla d55'e inmek saatler sürerdi.

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { prisma } from './db.js';
import { USTALIK_ESIK, ustalikKademesi } from '@game/mastery';

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

async function girisYap() {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const n = await api('/auth/nonce', { method: 'POST', body: { wallet } });
  const imza = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.json.message), kp.secretKey));
  const v = await api('/auth/verify', { method: 'POST', body: { wallet, signature: imza } });
  if (v.status !== 200) throw new Error(`giriş başarısız: ${v.status}`);
  return { wallet, token: v.json.token as string };
}

let sayac = 0;
async function kosuYaz(wallet: string, o: {
  hero: string; mode: string; depth: number; capped?: boolean; acik?: boolean;
  /** kaç gün önce açılmış sayılsın — günlük hakkını yakmamak için */
  gunOnce?: number;
}) {
  await prisma.run.create({
    data: {
      id: `mastery-test-${Date.now()}-${sayac++}`,
      wallet, seed: BigInt(1), mode: o.mode, stageId: 1, hero: o.hero,
      startedAt: new Date(Date.now() - (o.gunOnce ?? 0) * 86400_000),
      claimedAt: o.acik ? null : new Date(),
      awardedDepth: o.depth, capped: o.capped ?? false,
    },
  });
}

console.log('\n[1] KAPI');
const yetkisiz = await api('/heroes/mastery');
check('jetonsuz erişilemiyor', yetkisiz.status === 401, String(yetkisiz.status));

const u = await girisYap();
const bos = await api('/heroes/mastery', { token: u.token });
check('yeni hesapta ustalık BOŞ', Object.keys(bos.json.mastery ?? {}).length === 0,
  JSON.stringify(bos.json.mastery));
check('eşikler de dönüyor', Array.isArray(bos.json.thresholds) && bos.json.thresholds.length > 0,
  JSON.stringify(bos.json.thresholds));
// ⚠️ Eşik listesi İKİ YERDE yazılı olmamalı; sunucunun döndürdüğü liste
// paylaşılan sabitin AYNISI olmalı.
check('sunucunun eşikleri paylaşılan sabitle birebir',
  JSON.stringify(bos.json.thresholds) === JSON.stringify([...USTALIK_ESIK]),
  JSON.stringify(bos.json.thresholds));

console.log('\n[2] HANGİ KOŞULAR SAYILIYOR');
// ⭐ ASIL ÖLÇÜM: sayılmaması gereken her koşu türü, sayılandan DAHA DERİN
// yazılıyor. Biri sızarsa kademe fırlar ve test bunu yakalar.
await kosuYaz(u.wallet, { hero: 'ranger', mode: 'descent', depth: 25 });        // ✅ sayılmalı
await kosuYaz(u.wallet, { hero: 'ranger', mode: 'descent', depth: 99, capped: true });  // ❌ kırpılmış
/**
 * ⚠️ GÜNLÜK KAYIT 2 GÜN ÖNCEYE yazılıyor. İlk sürümde bugüne yazılmıştı ve
 * [4] adımı 409 aldı: sahte kayıt, oyuncunun BUGÜNKÜ günlük hakkını
 * yakmıştı. Kod doğruydu — tek deneme kuralı tam da böyle çalışmalı — ama
 * test kendi ayağına basıyordu. Tarih geriye alınınca kural da korunuyor,
 * ölçüm de yapılabiliyor.
 */
await kosuYaz(u.wallet, { hero: 'ranger', mode: 'daily', depth: 60, gunOnce: 2 }); // ❌ eşitlenmiş mod
await kosuYaz(u.wallet, { hero: 'ranger', mode: 'duel', depth: 80 });           // ❌ rakip tohumu
await kosuYaz(u.wallet, { hero: 'ranger', mode: 'campaign', depth: 70 });       // ❌ derinlik modu değil
await kosuYaz(u.wallet, { hero: 'ranger', mode: 'descent', depth: 90, acik: true }); // ❌ kapanmamış
await kosuYaz(u.wallet, { hero: 'knight', mode: 'wilderness', depth: 8 });      // ✅ sayılmalı

const m = await api('/heroes/mastery', { token: u.token });
const ranger = m.json.mastery?.ranger;
const knight = m.json.mastery?.knight;
check('ranger EN DERİN = 25 (diğerleri sızmadı)', ranger?.depth === 25, JSON.stringify(ranger));
check('ranger kademesi formülle birebir', ranger?.tier === ustalikKademesi(25),
  `${ranger?.tier} vs ${ustalikKademesi(25)}`);
check('wilderness sayılıyor (knight 8)', knight?.depth === 8, JSON.stringify(knight));
check('kampanya kahramanı tabloya girmedi', !('campaign' in (m.json.mastery ?? {})));

console.log('\n[3] BONUS BİLETE GİRİYOR');
// Descent açabilmek için bölüm 1 temizlenmiş olmalı — ilerlemeyi doğrudan
// yazıyoruz; burada ölçülen şey koşu kapısı değil, biletin içeriği.
await prisma.player.update({
  where: { wallet: u.wallet },
  data: { unlockedStage: 2, cleared: { 1: true }, hero: 'knight' },
});
const bilet = await api('/run/start', {
  method: 'POST', token: u.token, body: { mode: 'descent', stageId: 1 },
});
check('descent bileti alındı', bilet.status === 200, String(bilet.status));
// knight → 8 derinlik → kademe 1 → armor +0.2
check('bilette ustalık bonusu VAR', (bilet.json.mastery?.armor ?? 0) > 0,
  JSON.stringify(bilet.json.mastery));
check('bonus kademeyle tutarlı', Math.abs((bilet.json.mastery?.armor ?? 0) - 0.2) < 1e-9,
  String(bilet.json.mastery?.armor));

console.log('\n[4] GÜNLÜKTE USTALIK KAPALI');
// ⚠️ ÇİFT TARAFLI: yukarıda bonusun VAR olduğunu ölçtük; burada AYNI
// hesapta yok olduğunu ölçüyoruz. Tek yön ölçmek, hep boş dönen bir
// alanı da geçirirdi.
const gunluk = await api('/run/start', {
  method: 'POST', token: u.token, body: { mode: 'daily', stageId: 1 },
});
check('günlük bileti alındı', gunluk.status === 200, String(gunluk.status));
check('günlükte ustalık BOŞ', Object.keys(gunluk.json.mastery ?? {}).length === 0,
  JSON.stringify(gunluk.json.mastery));
check('günlükte eşitleme bayrağı açık', gunluk.json.equalize === true);

// ── temizlik ──
await prisma.run.deleteMany({ where: { wallet: u.wallet } });
await prisma.player.deleteMany({ where: { wallet: u.wallet } });

console.log(`\n${FAIL.length === 0 ? '✅ USTALIK SUNUCUSU SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
