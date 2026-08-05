// CANLI BOSS ODASI — iki gerçek soket birbirini görüyor mu.
//
// Çalıştır:  npx tsx src/presence.test.mts   (kendi sunucusunu kurar)
//
// ⚠️ ASIL SORU "kod derleniyor mu" DEĞİL: iki ayrı bağlantı açıldığında
// biri diğerinin konumunu GERÇEKTEN alıyor mu, ve kendini listede
// GÖRMÜYOR mu. İkincisi sessiz bir hata olurdu — oyuncu kendi gecikmeli
// ikizini görür ve "başka biri var" sanır.

import http from 'node:http';
import express from 'express';
import { WebSocket } from 'ws';
import { issueToken } from './auth.js';
import { attachPresence, presenceCount, stopPresence } from './presence.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bağlan ve gelen `peers` mesajlarını topla */
function baglan(port: number, token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/presence?t=${encodeURIComponent(token)}`);
  const gelen: { n: string; x: number; y: number; f: number; a?: string }[][] = [];
  let kapandi: number | null = null;
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString()) as { t?: string; peers?: typeof gelen[number] };
      if (m.t === 'peers' && m.peers) gelen.push(m.peers);
    } catch { /* yok say */ }
  });
  ws.on('close', (code) => { kapandi = code; });
  return {
    ws, gelen,
    get kapandi() { return kapandi; },
    acik: () => new Promise<boolean>((res) => {
      if (ws.readyState === WebSocket.OPEN) return res(true);
      ws.once('open', () => res(true));
      ws.once('error', () => res(false));
      ws.once('close', () => res(false));
    }),
    gonder: (o: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); },
    son: () => gelen[gelen.length - 1] ?? null,
  };
}

console.log('\n═══ CANLI BOSS ODASI ═══');

const app = express();
const server = http.createServer(app);
attachPresence(server);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
console.log(`     test sunucusu :${port}`);

const A = issueToken('AAAAtestcuzdanAAAA');
const B = issueToken('BBBBtestcuzdanBBBB');

console.log('\n[1] Kimlik kapısı');
{
  // ⚠️ Jetonsuz bağlantı KABUL EDİLMEMELİ: odaya girmek cüzdanlı oyuncuya
  // özel (demo ilerlemesi ortak havuza dokunmuyor).
  const kacak = baglan(port, 'gecersiz-jeton');
  const acildi = await kacak.acik();
  await bekle(150);
  check('geçersiz jetonla bağlanılamıyor', !acildi || kacak.kapandi === 4001,
    `açıldı:${acildi} kod:${kacak.kapandi}`);
  try { kacak.ws.close(); } catch { /* yok */ }
}

console.log('\n[2] ⭐ İKİ OYUNCU BİRBİRİNİ GÖRÜYOR');
{
  const a = baglan(port, A);
  const b = baglan(port, B);
  check('A bağlandı', await a.acik());
  check('B bağlandı', await b.acik());

  a.gonder({ x: 100, y: -50, f: 1 });
  b.gonder({ x: -220, y: 340, f: 0, a: 'a_candle' });
  await bekle(400);   // sunucu 8 Hz yayınlıyor, birkaç tur geçsin

  const aGorduğu = a.son();
  const bGorduğu = b.son();
  check('A bir hayalet görüyor', !!aGorduğu && aGorduğu.length === 1,
    `${aGorduğu?.length ?? 0} hayalet`);
  check('A, B\'nin KONUMUNU görüyor',
    aGorduğu?.[0]?.x === -220 && aGorduğu?.[0]?.y === 340,
    `${aGorduğu?.[0]?.x},${aGorduğu?.[0]?.y}`);
  check('hale bilgisi taşınıyor', aGorduğu?.[0]?.a === 'a_candle', aGorduğu?.[0]?.a ?? 'yok');
  check('bakış yönü taşınıyor', aGorduğu?.[0]?.f === 0, String(aGorduğu?.[0]?.f));
  check('B de A\'yı görüyor', bGorduğu?.[0]?.x === 100 && bGorduğu?.[0]?.y === -50,
    `${bGorduğu?.[0]?.x},${bGorduğu?.[0]?.y}`);

  // ⭐ SESSİZ HATA: kendini listede görmek
  check('KİMSE KENDİNİ listede görmüyor',
    !aGorduğu?.some((g) => g.x === 100 && g.y === -50)
    && !bGorduğu?.some((g) => g.x === -220 && g.y === 340));

  // Konum güncellemesi akıyor mu
  a.gonder({ x: 777, y: 888, f: 1 });
  await bekle(350);
  check('konum güncellemesi yayılıyor',
    b.son()?.[0]?.x === 777 && b.son()?.[0]?.y === 888,
    `${b.son()?.[0]?.x},${b.son()?.[0]?.y}`);

  console.log(`     odadaki bağlantı: ${presenceCount().total}`);
  check('sayaç iki bağlantı görüyor', presenceCount().total === 2, `${presenceCount().total}`);

  console.log('\n[3] Bozuk girdiye dayanıklılık');
  // ⚠️ Bozuk mesaj sunucuyu DÜŞÜRMEMELİ: soket herkese açık bir yüzey.
  a.gonder({ x: 'çok', y: null });
  a.gonder({ x: Infinity, y: NaN });
  if (a.ws.readyState === WebSocket.OPEN) a.ws.send('{bozuk json');
  if (a.ws.readyState === WebSocket.OPEN) a.ws.send('x'.repeat(2000));  // boyut sınırı
  await bekle(300);
  check('sunucu ayakta', presenceCount().total === 2);
  check('bozuk konum ESKİSİNİ bozmadı',
    b.son()?.[0]?.x === 777 && b.son()?.[0]?.y === 888,
    `${b.son()?.[0]?.x},${b.son()?.[0]?.y}`);

  // Arena dışını kırpma — hayalet haritanın dışına çıkmasın
  a.gonder({ x: 99999, y: -99999, f: 1 });
  await bekle(300);
  const k = b.son()?.[0];
  check('aşırı konum KIRPILIYOR', !!k && Math.abs(k.x) <= 3000 && Math.abs(k.y) <= 3000,
    `${k?.x},${k?.y}`);

  console.log('\n[4] Ayrılan oyuncu odadan düşüyor');
  b.ws.close();
  await bekle(400);
  check('bağlantı sayısı düştü', presenceCount().total === 1, `${presenceCount().total}`);
  check('A artık hayalet görmüyor', (a.son()?.length ?? 0) === 0, `${a.son()?.length ?? 0}`);

  a.ws.close();
}

await bekle(200);
stopPresence();
await new Promise<void>((r) => server.close(() => r()));

console.log(`\n${FAIL.length === 0 ? '✅ CANLI ODA SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
