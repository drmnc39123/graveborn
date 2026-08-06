// SOHBET TESTİ — mesaj gerçekten iki oyuncu arasında geçiyor mu?
//
// ⚠️ SAF FONKSİYONLAR YETMEZ. `temizle`/`konusabilir` tek başına test edilse
// "sohbet çalışıyor" denemez: asıl soru mesajın SOKETTEN geçip diğer
// oyuncuya ulaşıp ulaşmadığı. Bu test gerçek bir WebSocket sunucusu açıp
// iki gerçek istemci bağlıyor.
//
// ⚠️ İkinci soru da en az o kadar önemli: köyde duran bağlantı boss odasında
// HAYALET OLARAK GÖRÜNMEMELİ. Sohbet aynı soketi kullandığı için bu kolayca
// bozulur ve kimse fark etmez — köyde duran herkes (0,0)'da bir hayalet olur.
//
// Çalıştır:  npx tsx src/chat.test.mts

import http from 'node:http';
import { WebSocket } from 'ws';
import { MAX_UZUNLUK, konusabilir, temizle, temizleHepsi } from './chat.js';
import { attachPresence, stopPresence } from './presence.js';
import { issueToken } from './auth.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log('\n═══ KÖY SOHBETİ ═══');

console.log('\n[1] Metin temizliği');
{
  check('düz metin geçiyor', temizle('merhaba') === 'merhaba');
  check('boş mesaj REDDEDİLİYOR', temizle('   ') === null);
  check('metin olmayan reddediliyor', temizle(42) === null && temizle(null) === null);
  // ⚠️ Satır sonu tek satıra indirilmeli, yoksa bir mesaj sohbeti kaplar
  check('satır sonları boşluğa dönüyor', temizle('a\nb\r\nc') === 'a b c');
  // ⚠️ Sıfır genişlikli karakter: görünmez spam ve isim taklidi aracı
  check('sıfır genişlikli karakterler siliniyor',
    temizle('a​b﻿c') === 'abc', JSON.stringify(temizle('a​b﻿c')));
  check('uzun mesaj kırpılıyor', (temizle('x'.repeat(400)) ?? '').length === MAX_UZUNLUK);
}

console.log('\n[2] Spam koruması');
{
  temizleHepsi();
  const w = 'SPAMCI';
  const t0 = 1_000_000;
  check('ilk mesaj geçiyor', konusabilir(w, t0));
  // ⚠️ Art arda çok hızlı
  check('hemen ardından REDDEDİLİYOR', !konusabilir(w, t0 + 100));
  check('aralık dolunca geçiyor', konusabilir(w, t0 + 1300));
  // ⚠️ İKİNCİ KADEME: tam aralıkla gönderen biri sınırı hiç aşmadan odayı
  // yine de doldurabilir. Pencere tavanı onu yakalamalı.
  let gecen = 2;
  for (let i = 2; i < 12; i++) if (konusabilir(w, t0 + 1300 + i * 1300)) gecen += 1;
  check('pencere tavanı düzenli spam\'i de kesiyor', gecen < 10, `${gecen} mesaj geçti`);
  temizleHepsi();
}

console.log('\n[3] ⭐ Uçtan uca: mesaj diğer oyuncuya ulaşıyor mu');
{
  temizleHepsi();
  const server = http.createServer();
  attachPresence(server);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  const ac = (w: string) => new WebSocket(`ws://127.0.0.1:${port}/presence?t=${issueToken(w)}`);
  const a = ac('TEST_CHAT_A'), b = ac('TEST_CHAT_B');
  const aGelen: unknown[] = [], bGelen: unknown[] = [];
  a.on('message', (r) => aGelen.push(JSON.parse(r.toString())));
  b.on('message', (r) => bGelen.push(JSON.parse(r.toString())));
  await Promise.all([
    new Promise((r) => a.once('open', r)),
    new Promise((r) => b.once('open', r)),
  ]);
  await bekle(120);

  // ⚠️ Yeni girene geçmiş gönderilmeli — boş pencere gören oyuncu "kimse
  // yok" sanır, oysa iki dakika önce konuşma vardı.
  check('bağlanınca geçmiş geliyor',
    aGelen.some((m) => (m as { t: string }).t === 'chat_history'));

  a.send(JSON.stringify({ t: 'say', c: 'selam kasaba' }));
  await bekle(150);

  const bMsg = bGelen.find((m) => (m as { t: string }).t === 'chat') as
    { t: string; msg: { n: string; m: string } } | undefined;
  check('B, A\'nın mesajını ALDI', !!bMsg, bMsg ? bMsg.msg.m : 'gelmedi');
  check('gönderen adı kısaltılmış (tam cüzdan yayılmıyor)',
    !!bMsg && bMsg.msg.n.includes('…') && !bMsg.msg.n.includes('TEST_CHAT_A'),
    bMsg?.msg.n);
  // ⚠️ Gönderen de kendi mesajını görmeli, yoksa "gitti mi" belli olmaz
  const aMsg = aGelen.find((m) => (m as { t: string }).t === 'chat');
  check('gönderen kendi mesajını da görüyor', !!aMsg);

  // ⭐ Köyde duran bağlantı boss odasında HAYALET OLMAMALI
  await bekle(300);
  const peersMsg = bGelen.filter((m) => (m as { t: string }).t === 'peers') as
    { peers: unknown[] }[];
  const hayaletVar = peersMsg.some((m) => m.peers.length > 0);
  check('köyde duran bağlantı HAYALET olarak görünmüyor', !hayaletVar,
    `${peersMsg.length} peers mesajı, hayalet ${hayaletVar ? 'VAR' : 'yok'}`);

  // Konum gönderince hayalet OLMALI
  a.send(JSON.stringify({ x: 100, y: 100, f: 1 }));
  await bekle(400);
  const sonPeers = (bGelen.filter((m) => (m as { t: string }).t === 'peers') as
    { peers: unknown[] }[]).slice(-1)[0];
  check('konum gönderen hayalet OLUYOR', !!sonPeers && sonPeers.peers.length === 1,
    `${sonPeers?.peers.length ?? 0} hayalet`);

  a.close(); b.close();
  stopPresence();
  await new Promise<void>((r) => server.close(() => r()));
  temizleHepsi();
}

console.log(`\n${FAIL.length === 0 ? '✅ SOHBET SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
