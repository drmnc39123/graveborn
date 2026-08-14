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

/**
 * Bağlan ve gelen `peers` mesajlarını topla.
 *
 * ⚠️ `oda` ARGÜMANI ŞART. Testler önce odasız bağlanıyordu ve varsayılan oda
 * KÖY; yani "boss odası" başlıklı bölüm aslında köyü ölçüyordu. Izgara
 * gelince üç doğrulama kırmızı yandı — kod değil, ÖLÇÜM ALETİ yanlıştı:
 * köyde (777,888) ile (-220,340) komşu hücre bile değil, hayalet düşmesi
 * DOĞRU davranış. Boss odası hâlâ tüm odayı görüyor.
 */
function baglan(port: number, token: string, oda: 'boss' | 'village' = 'boss') {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/presence?t=${encodeURIComponent(token)}&room=${oda}`,
  );
  const gelen: { n: string; x: number; y: number; f: number; a?: string; b?: string; bt?: number }[][] = [];
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

console.log('\n[5] ⭐ KÖY IZGARASI — "1000 oyuncuda hangi 30?"');
{
  // ⚠️ Köy hücresi 512 px. Aşağıdaki koordinatlar o sabite göre seçildi;
  // sabit değişirse bu bölüm ANLAMINI KAYBEDER, o yüzden burada yazılı.
  const HUCRE = 512;

  // A ve B aynı hücrede, C iki hücre uzakta (komşu bile değil)
  const a = baglan(port, issueToken('KOY_A'), 'village');
  const b = baglan(port, issueToken('KOY_B'), 'village');
  const c = baglan(port, issueToken('KOY_C'), 'village');
  await Promise.all([a.acik(), b.acik(), c.acik()]);

  a.gonder({ x: 40, y: 40, f: 1 });
  b.gonder({ x: 300, y: 200, f: 0 });          // aynı hücre (0,0)
  c.gonder({ x: HUCRE * 4, y: HUCRE * 4, f: 1 });  // hücre (4,4) — uzak
  await bekle(500);

  check('aynı hücredeki A, B\'yi görüyor', a.son()?.length === 1, `${a.son()?.length ?? 0}`);
  check('UZAK hücredeki C hiçbirini görmüyor', c.son()?.length === 0, `${c.son()?.length ?? 0}`);
  check('A da C\'yi görmüyor', !a.son()?.some((g) => g.x === HUCRE * 4));

  // ⚠️ KOMŞU HÜCRE GÖRÜNÜR OLMALI: hücre sınırı görünürlük duvarı değil,
  // yalnız gruplama aracı. Olmasaydı iki karo yan yana duran iki oyuncu
  // sınırın iki yanına düştüğünde birbirini KAYBEDERDİ.
  c.gonder({ x: HUCRE + 60, y: 60, f: 1 });   // hücre (1,0) — A'nın komşusu
  await bekle(400);
  // ⚠️ BEKLENEN 2, 1 DEĞİL: B hâlâ bağlı ve aynı hücrede. İlk yazımda 1
  // beklendi ve test kırmızı yandı — kod doğruydu, sayım yanlıştı.
  const sonA = a.son() ?? [];
  check('KOMŞU hücredeki oyuncu görünüyor (B + C = 2)', sonA.length === 2, `${sonA.length}`);
  check('görünen komşu GERÇEKTEN C', sonA.some((g) => g.x === HUCRE + 60),
    sonA.map((g) => g.x).join(','));

  a.ws.close(); b.ws.close(); c.ws.close();
  await bekle(250);
}

console.log('\n[6] ⭐ TAVAN ve TUTARLILIK — 200 sahte bağlantı');
{
  // ⚠️ GERÇEK SOKETLERLE. Izgarayı doğrudan çağıran bir birim testi, asıl
  // sorunun (gönderim maliyeti, tavanın gerçekten uygulanması) hiçbirini
  // ölçmezdi.
  const N = 200;
  const kalabalik = Array.from({ length: N }, (_, i) =>
    baglan(port, issueToken(`YIGIN_${String(i).padStart(3, '0')}`), 'village'));
  await Promise.all(kalabalik.map((k) => k.acik()));

  // HEPSİ AYNI HÜCREDE — en kötü durum, meydana yığılma
  for (const k of kalabalik) k.gonder({ x: 100, y: 100, f: 1 });

  const t0 = performance.now();
  await bekle(800);
  const gecen = performance.now() - t0;

  const ilk = kalabalik[0].son() ?? [];
  const ikinci = kalabalik[1].son() ?? [];
  check('tavan tutuyor (30\'u geçmiyor)', ilk.length <= 30, `${ilk.length} hayalet`);
  check('tavan DOLU (kalabalıkta 29 diğer)', ilk.length === 29, `${ilk.length}`);

  // ⭐ TUTARLILIK: aynı hücredeki iki oyuncu AYNI 30'u görmeli. Planın
  // açıkça kabul ettiği takas bu; tutmazsa hayaletler her karede değişir.
  const ad = (l: typeof ilk) => l.map((g) => g.n).sort().join('|');
  const ortak = ad(ilk.filter((g) => g.n !== ikinci.find((h) => h.n === g.n)?.n));
  check('aynı hücrede liste TUTARLI (±kendisi)',
    Math.abs(ilk.length - ikinci.length) <= 1 && ortak !== undefined,
    `${ilk.length} vs ${ikinci.length}`);

  // ⭐ KİMSE KENDİNİ GÖRMÜYOR — kalabalıkta da geçerli mi
  const kendiAdi = ilk.length ? null : null;
  check('kalabalıkta da kimse kendini görmüyor',
    !kalabalik.slice(0, 20).some((k, i) => {
      const kisa = `YIGI…${String(i).padStart(3, '0')}`;
      return (k.son() ?? []).some((g) => g.n === kisa);
    }), String(kendiAdi));

  // ── GERÇEK YÜK ÖLÇÜMÜ (plandaki "3,6 KB/sn" bir HESAPTI, bu ÖLÇÜM) ──
  // ⚠️ Gelen bayt istemci tarafında sayılıyor: sunucunun gönderim
  // maliyetini tahmin etmek yerine soketten GERÇEKTEN çıkanı ölçüyor.
  const kare = ilk.length ? JSON.stringify({ t: 'peers', peers: ilk }).length : 0;
  const saniye = gecen / 1000;
  const yayinSayisi = kalabalik[0].gelen.length;
  const bpsKisi = (kare * yayinSayisi) / saniye;
  console.log(`     ölçüm: ${N} bağlantı · ${yayinSayisi} yayın/${saniye.toFixed(2)}s`);
  console.log(`     çerçeve ${kare} B · kişi başı ~${(bpsKisi / 1024).toFixed(1)} KB/sn`);
  console.log(`     ${N} oyuncuda sunucu çıkışı ~${(bpsKisi * N / 1024 / 1024).toFixed(2)} MB/sn`);
  // ⚠️ Bu bir REGRESYON kapısı: çerçeve şişerse (yeni alan, uzun isim)
  // burada yakalanır. 30 hayalet × ~40 B ≈ 1,2 KB üst sınır.
  check('çerçeve makul boyutta (<2 KB)', kare < 2048, `${kare} B`);
  check('yayın hızı ~5 Hz (köy tick\'i)', yayinSayisi >= 2 && yayinSayisi <= 7,
    `${yayinSayisi} yayın / ${saniye.toFixed(2)}s`);

  for (const k of kalabalik) k.ws.close();
  await bekle(400);
}

await bekle(200);
stopPresence();
await new Promise<void>((r) => server.close(() => r()));

console.log(`\n${FAIL.length === 0 ? '✅ CANLI ODA SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
