// CANLI BOSS ODASI — oyuncuların birbirini AYNI ANDA görmesi.
//
// Kullanıcının tarifi: "eşzamanlı canlı olarak BOSS odasında birbirlerini
// görsünler". Aşama 1 (asenkron hasar) zaten çalışıyordu; bu, üstüne konan
// görünürlük katmanı.
//
// ⚠️ EN KRİTİK KURAL: KONUM TAMAMEN KOZMETİKTİR.
// Başka oyuncular hayalet olarak çizilir — çarpışmaz, hasar vermez, hasar
// almaz, senin motoruna HİÇ girmez. Sebep mimarinin temelinde: ödül
// doğrulaması "aynı seed → aynı koşu" varsayımına dayanıyor (`settleRun`
// motoru sunucuda çalıştırıyor). Başka bir oyuncu senin simülasyonunu
// etkileseydi o varsayım çöker ve ekonominin tüm güvenliği onunla çökerdi.
//
// ⚠️ Bu yüzden konumların DOĞRULANMASINA da gerek yok: yalan söyleyen biri
// sadece kendi hayaletini uçurabilir. Hiçbir sayıyı, hiçbir ödülü etkilemez.
//
// ⚠️ DURUM SÜREÇTE (bellekte), Postgres'te değil. Konum verisi saniyede
// birkaç kez değişiyor ve KALICI DEĞİL — her yazımı diske indirmek anlamsız
// yük olurdu. Sunucu yeniden başlarsa oda boşalır ve kendini doldurur.

import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { readToken } from './auth.js';
import { bossWeek } from '@game/worldBoss';
import { kaydet, konusabilir, son as sonMesajlar, temizle } from './chat.js';
import { tagOf } from './guild.js';

/** Sunucunun yayın hızı — istemci daha sık gönderse bile bu hızda dağıtılır */
const TICK_MS = 125;              // 8 Hz
/** Bu süre boyunca haber vermeyen bağlantı düşer */
const IDLE_MS = 20_000;
/** Bir odada en fazla kaç hayalet yayınlanır (perf + bant genişliği tavanı) */
const MAX_GHOSTS = 24;

interface Peer {
  ws: WebSocket;
  wallet: string;
  week: number;
  x: number;
  y: number;
  facingRight: boolean;
  /** takılı hale — hayaletin rengi ondan geliyor */
  aura: string | null;
  /**
   * Lonca etiketi. ⚠️ BAĞLANIRKEN BİR KEZ okunuyor, her mesajda değil:
   * mesaj başına bir veritabanı sorgusu, sohbeti sunucunun en pahalı
   * işlemi yapardı. Lonca değiştirenin etiketi bir sonraki bağlantıda
   * güncellenir — kabul edilebilir gecikme.
   */
  tag: string | null;
  lastSeen: number;
  /**
   * ⚠️ HAYALET OLARAK YAYINLANIR MI. Sohbet aynı soketi kullanıyor ve köyde
   * duran oyuncu da bağlı; bu bayrak olmasaydı köydeki herkes boss odasında
   * (0,0) noktasında bir hayalet olarak belirirdi.
   *
   * Yalnızca KONUM GÖNDEREN bağlantı görünür olur — yani gerçekten boss
   * odasında koşan biri.
   */
  gorunur: boolean;
}

const peers = new Map<WebSocket, Peer>();

/** Kısa cüzdan — tam adresi yayınlamaya gerek yok */
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

function broadcast() {
  const now = Date.now();

  // Ölü bağlantıları temizle
  for (const [ws, p] of peers) {
    if (now - p.lastSeen > IDLE_MS || ws.readyState !== WebSocket.OPEN) {
      try { ws.close(); } catch { /* zaten kapalı */ }
      peers.delete(ws);
    }
  }
  if (!peers.size) return;

  // Haftaya göre grupla — herkes kendi haftasının odasında
  const byWeek = new Map<number, Peer[]>();
  for (const p of peers.values()) {
    const list = byWeek.get(p.week);
    if (list) list.push(p); else byWeek.set(p.week, [p]);
  }

  for (const [, list] of byWeek) {
    // ⚠️ Herkese HERKESİ göndermiyoruz: kendini listeden çıkar, yoksa oyuncu
    // kendi hayaletini üstünde görür ve "gecikmeli ikizim var" sanır.
    for (const me of list) {
      if (me.ws.readyState !== WebSocket.OPEN) continue;
      const others = [];
      for (const o of list) {
        if (o === me) continue;
        if (!o.gorunur) continue;   // köyde duran bağlantı hayalet değildir
        if (others.length >= MAX_GHOSTS) break;
        others.push({
          n: short(o.wallet),
          x: Math.round(o.x), y: Math.round(o.y),
          f: o.facingRight ? 1 : 0,
          a: o.aura ?? undefined,
        });
      }
      try {
        me.ws.send(JSON.stringify({ t: 'peers', peers: others }));
      } catch { /* yazılamıyorsa bir sonraki turda düşecek */ }
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function attachPresence(server: Server) {
  const wss = new WebSocketServer({ server, path: '/presence' });

  wss.on('connection', (ws, req) => {
    // ⚠️ Kimlik URL sorgusundan: tarayıcı WebSocket API'si özel başlık
    // göndermeye izin vermiyor. Jeton zaten kısa ömürlü HMAC.
    const url = new URL(req.url ?? '/', 'http://x');
    const wallet = readToken(url.searchParams.get('t') ?? undefined);
    if (!wallet) { ws.close(4001, 'oturum_yok'); return; }

    const week = bossWeek(new Date());
    peers.set(ws, {
      ws, wallet, week, x: 0, y: 0, facingRight: true, aura: null,
      lastSeen: Date.now(),
      gorunur: false,   // konum gelene kadar hayalet DEĞİL (bkz. alan başlığı)
      tag: null,
    });

    // Lonca etiketini bir kez çek — hata olursa sohbet etiketsiz devam eder
    tagOf(wallet).then((t) => {
      const p = peers.get(ws);
      if (p) p.tag = t;
    }).catch(() => { /* etiket süs, bağlantıyı bozmaz */ });

    // ⚠️ Sohbet geçmişi BAĞLANIRKEN gönderiliyor. Yoksa odaya giren kişi boş
    // bir pencere görür ve "kimse yok" sanır — oysa iki dakika önce konuşma
    // vardı. Sosyal katmanın ilk izlenimi budur.
    try { ws.send(JSON.stringify({ t: 'chat_history', msgs: sonMesajlar() })); } catch { /* yok */ }

    ws.on('message', (raw) => {
      const p = peers.get(ws);
      if (!p) return;
      // ⚠️ Mesaj boyutu sınırlı: 512 bayt bir konum güncellemesi için fazlasıyla
      // yeterli, daha büyüğü ayrıştırmaya bile değmez.
      // 512 bayt: konum güncellemesi için fazlasıyla yeterli, sohbette de
      // 180 karakterlik metin + JSON zarfı rahat sığıyor.
      if (raw.toString().length > 512) return;
      try {
        const m = JSON.parse(raw.toString()) as {
          t?: unknown; c?: unknown;
          x?: unknown; y?: unknown; f?: unknown; a?: unknown;
        };
        // ⚠️ `Number(...)` İLE ZORLAMA YAPMA. `Number(null)` = 0 ve 0 sonlu
        // bir sayı — yani `{x:null,y:null}` gelen bir mesaj hayaleti sessizce
        // BAŞLANGIÇ NOKTASINA ışınlıyordu. Üstelik bu kolayca oluşuyor:
        // `JSON.stringify({x: Infinity})` çıktısı `{"x":null}`, çünkü JSON'da
        // Infinity/NaN yok. Tip KONTROL edilmeli, çevrilmemeli.
        // ── SOHBET ──
        // ⚠️ Aynı soket, farklı mesaj tipi. `t` yoksa eski konum mesajıdır
        // (geriye uyum) — istemcinin eski sürümü kırılmasın.
        if (m.t === 'say') {
          const metin = temizle(m.c);
          if (!metin) return;
          // ⚠️ Hız sınırı BURADA. Express ara katmanı bu trafiği hiç görmüyor.
          if (!konusabilir(p.wallet)) return;
          p.lastSeen = Date.now();   // konuşmak da canlılık işareti
          const msg = kaydet(short(p.wallet), metin, Date.now(), p.tag);
          // Odadaki HERKESE — gönderen dahil (kendi mesajını görmeli)
          for (const [sock] of peers) {
            if (sock.readyState !== WebSocket.OPEN) continue;
            try { sock.send(JSON.stringify({ t: 'chat', msg })); } catch { /* yok */ }
          }
          return;
        }

        if (typeof m.x !== 'number' || typeof m.y !== 'number') return;
        const x = m.x, y = m.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        // Arena yarıçapı 2400; dışını kabul etmek hayaleti haritanın
        // dışına atardı. Doğrulama değil, ÇİZİM SAĞLIĞI için kırpma.
        p.x = Math.max(-3000, Math.min(3000, x));
        p.y = Math.max(-3000, Math.min(3000, y));
        p.facingRight = !!m.f;
        p.aura = typeof m.a === 'string' && m.a.length <= 24 ? m.a : null;
        p.lastSeen = Date.now();
        p.gorunur = true;   // konum gönderdi → boss odasında koşuyor
      } catch { /* bozuk mesaj — yok say */ }
    });

    ws.on('close', () => { peers.delete(ws); });
    ws.on('error', () => { peers.delete(ws); });
  });

  if (!timer) timer = setInterval(broadcast, TICK_MS);
  return wss;
}

/** Admin/izleme için — o an odada kaç kişi var */
export function presenceCount(): { total: number; byWeek: Record<number, number> } {
  const byWeek: Record<number, number> = {};
  for (const p of peers.values()) byWeek[p.week] = (byWeek[p.week] ?? 0) + 1;
  return { total: peers.size, byWeek };
}

/** Test/kapanış için — zamanlayıcıyı bırak, yoksa süreç sonlanmaz */
export function stopPresence() {
  if (timer) { clearInterval(timer); timer = null; }
  for (const [ws] of peers) { try { ws.close(); } catch { /* yok */ } }
  peers.clear();
}
