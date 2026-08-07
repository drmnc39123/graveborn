// ARENA — gerçek zamanlı 1v1 maç odası (sunucu tarafı).
//
// Protokol ve kurulum `@game/arena`'da; burada ODA var: eşleşme kuyruğu,
// girdi rölesi ve SUNUCUNUN KENDİ SİMÜLASYONU.
//
// ⚠️ SUNUCU SAAT TUTAR VE KİMSEYİ BEKLEMEZ. Klasik eşler-arası lockstep'te
// herkes en yavaş oyuncuyu bekler; bir kişinin donması maçı dondurur ve
// bu, kasten kullanılabilecek bir silahtır (bağlantını kes, rakibini
// kilitle). Burada girdi gelmediyse o oyuncunun SON girdisi kullanılıyor:
// kopan oyuncu maçı yavaşlatmıyor, sadece hareketsiz kalıyor ve ölüyor.
//
// ⚠️ KAZANANI SUNUCU BELİRLER. `engine.ts` DOM'suz olduğu için sunucu aynı
// simülasyonu koşturuyor; istemci "ben kazandım" DEMİYOR, hiç sorulmuyor.
// İstemcinin gönderdiği tek şey bir hareket vektörü.
//
// ⚠️ İKİ OYUNCUYA GİDEN KARE AKIŞI BİREBİR AYNI. Farklı gönderilseydi iki
// tarayıcı farklı dünya simüle ederdi ve kimse hata görmezdi — sadece
// ekranlar ayrışırdı. Tek `broadcast`, tek dizi.

import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { ARENA, arenaWinner, buildArenaGame, ratingWindow, type ArenaSetup, type InputFrame } from '@game/arena';
import { nextRatings } from '@game/duel';
import type { Game } from '@game/engine';
import { prisma } from './db.js';
import { markPvpMatch } from './pvpSeason.js';
import { readToken } from './auth.js';
import { routeUpgrade } from './wsRoute.js';
import { equippedBonus } from './gear.js';
import { skillsBonusOf } from './skills.js';
import { growthOf } from './guild.js';

/** Kuyrukta bekleyen oyuncu */
interface Waiting {
  wallet: string;
  rating: number;
  heroId: string;
  permanent: Record<string, number>;
  since: number;
  /** eşleşince buraya yazılıyor; oyuncu yoklamada okuyor */
  matched: ArenaSetup | null;
}

interface Seat {
  wallet: string;
  ws: WebSocket | null;
  /** son alınan girdi — bağlantı koparsa bu kullanılmaya devam eder */
  ix: number;
  iy: number;
  rating: number;
}

class Room {
  readonly id: string;
  readonly seats: [Seat, Seat];
  readonly game: Game;
  readonly setup: Omit<ArenaSetup, 'side'>;
  private timer: NodeJS.Timeout | null = null;
  private tick = 0;
  /** yayınlanmayı bekleyen kareler */
  private pending: InputFrame[] = [];
  private ended = false;
  private readonly startedAt = Date.now();

  constructor(setup: Omit<ArenaSetup, 'side'>, ratings: [number, number]) {
    this.id = setup.matchId;
    this.setup = setup;
    this.game = buildArenaGame({ ...setup, side: 0 });
    this.seats = [
      { wallet: setup.players[0].wallet, ws: null, ix: 0, iy: 0, rating: ratings[0] },
      { wallet: setup.players[1].wallet, ws: null, ix: 0, iy: 0, rating: ratings[1] },
    ];
  }

  attach(side: 0 | 1, ws: WebSocket) {
    // ⚠️ Aynı koltuğa ikinci bağlantı ESKİSİNİ kapatıyor. Yoksa oyuncu iki
    // sekme açıp aynı maça iki girdi akışı besleyebilirdi.
    const s = this.seats[side];
    if (s.ws && s.ws !== ws) { try { s.ws.close(4009, 'baska_oturum'); } catch { /* yok */ } }
    s.ws = ws;
    this.send(ws, { t: 'arena:hello', side, tick: this.tick });
    if (!this.timer && this.seats[0].ws && this.seats[1].ws) this.start();
  }

  detach(ws: WebSocket) {
    for (const s of this.seats) if (s.ws === ws) s.ws = null;
    // ⚠️ MAÇ DURMAZ. Kopan oyuncunun son girdisi kullanılmaya devam eder ve
    // büyük ihtimalle ölür — bağlantıyı kesmek bir kaçış yolu OLMAMALI.
    if (!this.seats[0].ws && !this.seats[1].ws) this.finish(null);
  }

  input(side: 0 | 1, x: number, y: number) {
    const s = this.seats[side];
    // Sonsuz/NaN gelirse simülasyonu bozar — sınırla
    s.ix = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    s.iy = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  private start() {
    const stepMs = 1000 / ARENA.hz;
    this.timer = setInterval(() => this.advance(), stepMs);
    this.broadcast({ t: 'arena:start', at: Date.now() });
  }

  private advance() {
    if (this.ended) return;
    const g = this.game;

    // ⚠️ SEVİYE KARTI OYUNU DURDURMAZ. Solo'da motor 'levelup' fazında
    // bekliyor; 1v1'de beklemek, kart ekranındaki oyuncunun maçı dondurması
    // demek olurdu. Sunucu ilk teklifi seçip devam ediyor — istemci de
    // aynısını yapıyor, iki taraf ayrışmıyor.
    if (g.phase === 'levelup') {
      if (g.offers.length) g.choose(g.offers[0].id);
      return;
    }

    const f: InputFrame = [this.seats[0].ix, this.seats[0].iy, this.seats[1].ix, this.seats[1].iy];
    g.setInput(f[0], f[1]);
    g.setRivalInput(f[2], f[3]);
    g.step();
    this.pending.push(f);
    this.tick += 1;

    if (this.pending.length >= ARENA.batch) {
      this.broadcast({ t: 'arena:frames', from: this.tick - this.pending.length, frames: this.pending });
      this.pending = [];
    }

    const w = arenaWinner(g);
    if (w !== null) { this.finish(w); return; }
    // ⚠️ SERT TAVAN: kopan bağlantı ya da bitmeyen bir bölüm odayı sonsuza
    // kadar tutmasın.
    if ((Date.now() - this.startedAt) / 1000 > ARENA.maxMatchSec) this.finish(null);
  }

  private async finish(winner: 0 | 1 | null) {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.pending.length) {
      this.broadcast({ t: 'arena:frames', from: this.tick - this.pending.length, frames: this.pending });
      this.pending = [];
    }

    let delta = 0;
    if (winner !== null) {
      try { delta = await settleArena(this.seats[0], this.seats[1], winner, this.tick); }
      catch (e) { console.warn('[arena] puan yazılamadı', this.id, e); }
    }
    this.broadcast({
      t: 'arena:end', winner, tick: this.tick,
      kills: [this.game.hero.kills, this.game.rival?.kills ?? 0],
      delta,
    });
    for (const s of this.seats) { try { s.ws?.close(1000, 'mac_bitti'); } catch { /* yok */ } }
    rooms.delete(this.id);
  }

  private send(ws: WebSocket, msg: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(msg)); } catch { /* yok */ }
    }
  }

  private broadcast(msg: unknown) {
    // ⚠️ TEK NESNE, TEK JSON: iki oyuncuya AYNI kareler gitmek zorunda.
    const s = JSON.stringify(msg);
    for (const seat of this.seats) {
      if (seat.ws?.readyState === WebSocket.OPEN) {
        try { seat.ws.send(s); } catch { /* yok */ }
      }
    }
  }
}

const rooms = new Map<string, Room>();
const queue = new Map<string, Waiting>();

/**
 * Puanları yaz.
 *
 * ⚠️ TEK LADDER. Asenkron düello ile arena aynı `duelRating`'i kullanıyor:
 * küçük bir oyuncu tabanını iki ayrı sıralamaya bölmek, ikisini de boş
 * gösterirdi.
 *
 * ⚠️ `increment` ile yazılıyor, mutlak değerle DEĞİL — aynı oyuncunun iki
 * maçı aynı anda bitebilir ve mutlak yazma birini sessizce yutardı
 * (`settleDuel`'deki kuralın aynısı).
 */
export async function settleArena(a: Seat, b: Seat, winner: 0 | 1, ticks: number): Promise<number> {
  const r = nextRatings(a.rating, b.rating, winner === 0);
  const da = r.challenger - a.rating;
  const db = r.defender - b.rating;
  await prisma.$transaction(async (tx) => {
    await tx.player.updateMany({
      where: { wallet: a.wallet },
      data: {
        duelRating: { increment: da },
        ...(winner === 0 ? { duelWins: { increment: 1 } } : { duelLosses: { increment: 1 } }),
      },
    });
    await tx.player.updateMany({
      where: { wallet: b.wallet },
      data: {
        duelRating: { increment: db },
        ...(winner === 1 ? { duelWins: { increment: 1 } } : { duelLosses: { increment: 1 } }),
      },
    });
    await tx.player.updateMany({
      where: { wallet: { in: [a.wallet, b.wallet] }, duelRating: { lt: 100 } },
      data: { duelRating: 100 },
    });
    await tx.duel.create({
      data: {
        id: crypto.randomUUID(),
        challenger: winner === 0 ? a.wallet : b.wallet,
        defender: winner === 0 ? b.wallet : a.wallet,
        // ⚠️ Arena maçında "derinlik" diye bir şey yok; süre saniye olarak
        // yazılıyor ki geçmiş listesi anlamlı kalsın.
        stageId: 0, depth: Math.round(ticks / ARENA.hz), target: 0,
        won: true, delta: Math.abs(winner === 0 ? da : db), dust: 0,
      },
    });
    // ⚠️ Düellodaki kuralın aynısı — aynı transaction'da (bkz. duel.ts)
    await markPvpMatch(tx, [a.wallet, b.wallet]);
  });
  return winner === 0 ? da : db;
}

/** Oyuncunun koşuya girerken taşıdığı toplam bonus — hepsi SUNUCUDAN */
async function bonusOf(wallet: string): Promise<Record<string, number>> {
  const [gear, skills, growth] = await Promise.all([
    equippedBonus(wallet), skillsBonusOf(wallet), growthOf(wallet),
  ]);
  const out: Record<string, number> = {};
  const ekle = (m: Partial<Record<string, number>>) => {
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + (v ?? 0);
  };
  ekle(gear as Record<string, number>);
  ekle(skills as Record<string, number>);
  if (growth > 0) out.growth = (out.growth ?? 0) + growth;
  return out;
}

export interface QueueResult {
  state: 'waiting' | 'matched';
  setup?: ArenaSetup;
  /** kuyrukta geçen saniye */
  waited?: number;
}

/**
 * Kuyruğa gir / yoklama yap.
 *
 * ⚠️ HTTP YOKLAMASI, ws PUSH DEĞİL. Maç bulunduğunda oyuncuya haber vermek
 * için ayrı bir soket açmak, sadece bekleme ekranı için ikinci bir bağlantı
 * ömrü yönetmek demekti. Yoklama basit ve kopan bağlantıda kendiliğinden
 * temizleniyor (`since` eskiyen kayıt düşüyor).
 */
export async function joinQueue(wallet: string, heroId: string): Promise<QueueResult> {
  temizle();
  const mevcut = queue.get(wallet);
  if (mevcut?.matched) {
    queue.delete(wallet);
    return { state: 'matched', setup: mevcut.matched };
  }
  if (mevcut) {
    return { state: 'waiting', waited: Math.round((Date.now() - mevcut.since) / 1000) };
  }

  const p = await prisma.player.findUnique({
    where: { wallet }, select: { duelRating: true, banned: true },
  });
  if (!p || p.banned) throw new Error('yasakli');

  const ben: Waiting = {
    wallet, rating: p.duelRating, heroId,
    permanent: await bonusOf(wallet),
    since: Date.now(), matched: null,
  };

  // ⚠️ EN YAKIN PUANLI RAKİP — VE PUAN PENCERESİ İÇİNDE.
  //
  // Sadece "en yakını seç" yetmiyordu: kuyrukta tek kişi varsa o zaten en
  // yakındır ve 1000 puanlı, 1900'lükle eşleşiyordu. Pencere iki tarafın da
  // beklediği süreye göre açılıyor; ikisinden HANGİSİ daha uzun beklediyse
  // onun toleransı geçerli — yoksa yeni gelen, saatlerdir bekleyeni
  // kabul etmediği için ikisi de sonsuza kadar beklerdi.
  let en: Waiting | null = null;
  for (const w of queue.values()) {
    if (w.wallet === wallet || w.matched) continue;
    const fark = Math.abs(w.rating - ben.rating);
    const bekleyen = Math.max(
      (Date.now() - w.since) / 1000,
      (Date.now() - ben.since) / 1000,
    );
    if (fark > ratingWindow(bekleyen)) continue;
    if (!en || fark < Math.abs(en.rating - ben.rating)) en = w;
  }

  if (!en) {
    queue.set(wallet, ben);
    return { state: 'waiting', waited: 0 };
  }

  const matchId = crypto.randomUUID();
  const seed = crypto.randomBytes(4).readUInt32BE(0);
  const ortak: Omit<ArenaSetup, 'side'> = {
    matchId, seed, stageId: 1,
    players: [
      { wallet: en.wallet, heroId: en.heroId, permanent: en.permanent, duelRating: en.rating },
      { wallet: ben.wallet, heroId: ben.heroId, permanent: ben.permanent, duelRating: ben.rating },
    ],
  };
  rooms.set(matchId, new Room(ortak, [en.rating, ben.rating]));
  // Bekleyen taraf yoklamada alacak
  en.matched = { ...ortak, side: 0 };
  return { state: 'matched', setup: { ...ortak, side: 1 } };
}

export function leaveQueue(wallet: string) {
  queue.delete(wallet);
}

/** Bayat kuyruk kayıtlarını at — kopan sekme sonsuza kadar beklemesin */
function temizle() {
  const simdi = Date.now();
  for (const [k, w] of queue) {
    if (!w.matched && (simdi - w.since) / 1000 > ARENA.queueTimeoutSec) queue.delete(k);
  }
}

export function arenaStats() {
  return { rooms: rooms.size, queued: queue.size };
}

/** SADECE TEST — oda kurulumunu doğrulamak için */
export function debugRoom(matchId: string) {
  const r = rooms.get(matchId);
  return r ? { seats: r.seats.map((s) => s.wallet), setup: r.setup, game: r.game } : null;
}

/** SADECE TEST — kuyruktaki kaydı eskitir (uzun beklemiş gibi) */
export function debugAge(wallet: string, since: number) {
  const w = queue.get(wallet);
  if (w) w.since = since;
}

/** SADECE TEST — kuyruk ve odaları sıfırla */
export function debugReset() {
  for (const r of rooms.values()) { try { (r as unknown as { timer: NodeJS.Timeout | null }).timer && clearInterval((r as unknown as { timer: NodeJS.Timeout }).timer); } catch { /* yok */ } }
  rooms.clear();
  queue.clear();
}

/**
 * ws sunucusunu bağla — `/arena?t=<jeton>&m=<matchId>`.
 *
 * ⚠️ Kimlik URL sorgusundan: tarayıcı WebSocket API'si özel başlık
 * göndermeye izin vermiyor (presence'taki gerekçenin aynısı).
 */
export function attachArena(server: Server) {
  // ⚠️ `noServer: true` — bkz. presence.ts başlığı: `{ server, path }` ile
  // iki ws sunucusu birbirinin bağlantısını 400 ile reddediyor.
  const wss = new WebSocketServer({ noServer: true });
  routeUpgrade(server, '/arena', wss);

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const wallet = readToken(url.searchParams.get('t') ?? undefined);
    const matchId = url.searchParams.get('m') ?? '';
    if (!wallet) { ws.close(4001, 'oturum_yok'); return; }
    const room = rooms.get(matchId);
    if (!room) { ws.close(4004, 'mac_yok'); return; }

    const side = room.seats[0].wallet === wallet ? 0
      : room.seats[1].wallet === wallet ? 1 : null;
    // ⚠️ Maçın tarafı olmayan biri odayı SEYREDEMEZ: kare akışı rakibin
    // girdisini içeriyor, yani izleyici rakibin hareketini önceden görürdü.
    if (side === null) { ws.close(4003, 'bu_mac_senin_degil'); return; }

    room.attach(side, ws);

    ws.on('message', (raw) => {
      // Girdi mesajı küçücük; büyük paket ya hata ya saldırı
      if (typeof raw !== 'string' && (raw as Buffer).length > 256) return;
      try {
        const m = JSON.parse(String(raw)) as { t?: string; x?: number; y?: number };
        if (m.t === 'in') room.input(side, Number(m.x) || 0, Number(m.y) || 0);
      } catch { /* bozuk mesaj yok sayılır */ }
    });

    ws.on('close', () => room.detach(ws));
    ws.on('error', () => room.detach(ws));
  });

  return wss;
}
