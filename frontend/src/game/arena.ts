// ARENA — gerçek zamanlı 1v1'in paylaşılan sözleşmesi.
//
// ⚠️ SUNUCU DA İSTEMCİ DE BU DOSYAYI OKUR. Protokolün, sabitlerin ve kurulum
// fonksiyonunun tek kaynağı burası; iki tarafta iki kopya tutmak, er ya da
// geç bir tarafın ötekinden farklı bir dünya kurması demekti — ve lockstep'te
// bu sessizce olur, kimse hata görmez.
//
// ── NEDEN LOCKSTEP ──
// Sunucunun bütün dünyayı yayınlaması (400 düşman × konum) ~50 KB/s eder.
// Lockstep'te telden sadece HAREKET VEKTÖRÜ geçiyor: ~1 KB/s, elli kat ucuz.
// Bunu mümkün kılan şey oyunun tasarımı — oyuncunun motora verdiği tek girdi
// bir yön; silahlar kendiliğinden ateş ediyor.
//
// ── NEDEN SUNUCU SAAT TUTUYOR ──
// Klasik eşler-arası lockstep'te herkes en yavaş oyuncuyu BEKLER; bir kişinin
// donması maçı dondurur. Burada saati SUNUCU tutuyor ve hiç beklemiyor: girdi
// gelmediyse o oyuncunun SON girdisini kullanıyor. Kopan oyuncu yavaşlatmıyor,
// sadece hareketsiz kalıyor.
//
// ⚠️ SUNUCU AYNI SİMÜLASYONU KENDİ KOŞTURUYOR (`engine.ts` DOM'suz). Kazananı
// istemciye sormuyoruz — istemci "ben kazandım" diyemez.

import { Game } from './engine';
import { STAGES } from './config';
import type { StatKey } from './config';

export const ARENA = {
  /** simülasyon hızı — motorun TICK'iyle aynı olmak ZORUNDA */
  hz: 60,
  /**
   * ⚠️ SABİT GÖRÜŞ ALANI. Doğum halkasının yarıçapı buradan geliyor, yani
   * pencere boyutu dünyayı değiştiriyor. Sabitlemezsek dizüstünde ve
   * masaüstünde oynayan iki oyuncu FARKLI düşmanlar görür ve lockstep
   * sessizce çöker (bkz. Game.lockViewport).
   */
  viewW: 1280,
  viewH: 720,
  /**
   * Kaç tick'lik girdi tek mesajda taşınıyor. 60 Hz'de tick başına mesaj
   * atmak gereksiz; 3'erli paket 20 mesaj/sn eder ve gecikmeye 50 ms ekler.
   */
  batch: 3,
  /** eşleşme kuyruğunda en fazla bekleme (sn) — sonra iptal */
  queueTimeoutSec: 60,
  /** bir maçın sert üst sınırı (sn) — kopan bağlantı sonsuza kadar oda tutmasın */
  maxMatchSec: 15 * 60,
} as const;

/** Sunucunun maç açarken ürettiği, iki tarafa da aynen giden kurulum */
export interface ArenaSetup {
  matchId: string;
  seed: number;
  stageId: number;
  /** 0 = birinci oyuncu, 1 = ikinci */
  side: 0 | 1;
  players: [ArenaPlayer, ArenaPlayer];
}

export interface ArenaPlayer {
  wallet: string;
  heroId: string;
  /**
   * Forge + ekipman + beceri toplamı. ⚠️ SUNUCU HESAPLIYOR — istemci kendi
   * bonusunu beyan edemez, üstelik RAKİBİNKİNİ de sunucudan öğreniyor
   * (yoksa iki taraf farklı güçte bir rakip simüle ederdi).
   */
  permanent: Partial<Record<StatKey, number>>;
  duelRating: number;
}

/** Tek bir tick'in girdisi: [ax, ay, bx, by] */
export type InputFrame = [number, number, number, number];

/** Sunucudan istemciye giden girdi paketi */
export interface TickPacket {
  /** paketteki İLK tick'in numarası */
  from: number;
  frames: InputFrame[];
}

/**
 * Kurulumdan bir oyun kur — İKİ TARAF DA BUNU ÇAĞIRIR.
 *
 * ⚠️ TEK FONKSİYON OLMASI ŞART. Sunucu ile istemci oyunu iki ayrı yerde
 * kursaydı (farklı sıra, farklı parametre, unutulmuş bir `lockViewport`)
 * dünyalar ayrışırdı ve bunu hiçbir test yakalamazdı — çünkü her iki taraf
 * da kendi içinde tutarlı olurdu.
 *
 * ⚠️ SIRA SABİT: 0. oyuncu `hero`, 1. oyuncu `rival`. `side` sadece
 * "hangisi benim" sorusunu cevaplıyor; simülasyon iki tarafta da AYNI.
 */
export function buildArenaGame(setup: ArenaSetup): Game {
  const stage = STAGES.find((s) => s.id === setup.stageId) ?? STAGES[0];
  const [a, b] = setup.players;
  const g = new Game(setup.seed, stage, a.permanent, 'descent', a.heroId, 1, 0);
  // ⚠️ Görüş alanı ÖNCE mühürleniyor: `addRival` doğum konumlarını
  // arenaya göre kuruyor ve sonrasında render `setViewport` çağıracak.
  g.lockViewport(ARENA.viewW, ARENA.viewH);
  g.addRival(b.heroId, b.permanent);
  return g;
}

/**
 * Maç bitti mi ve kim kazandı.
 *
 * ⚠️ `phase` BİRİNCİ OYUNCUNUN gözünden yazılıyor (`dead` = 0. oyuncu öldü).
 * `side`'a göre çevirmek İSTEMCİNİN işi değil — burada tek yerde yapılıyor,
 * yoksa iki taraf aynı maçı farklı okur.
 */
export function arenaWinner(g: Game): 0 | 1 | null {
  if (g.phase === 'dead') return 1;
  if (g.phase === 'won') return 0;
  return null;
}
