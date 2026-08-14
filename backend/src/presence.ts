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
import { routeUpgrade } from './wsRoute.js';
import { readToken } from './auth.js';
import { bossWeek } from '@game/worldBoss';
import { kaydet, konusabilir, son as sonMesajlar, temizle, type Kanal } from './chat.js';
import { tagOf } from './guild.js';

/** Sunucunun yayın hızı — istemci daha sık gönderse bile bu hızda dağıtılır */
const TICK_MS = 125;              // 8 Hz
/** Bu süre boyunca haber vermeyen bağlantı düşer */
const IDLE_MS = 20_000;
/** Bir odada en fazla kaç hayalet yayınlanır (perf + bant genişliği tavanı) */
const MAX_GHOSTS = 24;

// ── KÖY MEYDANI ───────────────────────────────────────────────────────
//
// ⚠️ ÖLÇEK DÜĞMELERİ BURADA, TEK YERDE. "1000 oyuncumuz olursa hangi 30
// birbirini görecek" sorusunun cevabı bu üç sabit + `koyListeleri()`.
// Sorun gerçek olduğunda ölçülüp bunlar ayarlanacak; şimdiden karmaşıklık
// satın alınmayacak.
//
// ⚠️ PLANDAKİ HESAP YANLIŞTI, ÖLÇÜM DÜZELTTİ. Plana "30 hayalet × ~24 B ×
// 5 Hz ≈ 3,6 KB/sn" yazılmıştı. `presence.test.mts` [6] 200 gerçek soketle
// ölçtü: çerçeve 29 hayalette 1183 B — hayalet başına ~41 B, çünkü JSON
// anahtarları ve kısaltılmış cüzdan (`4x8f…9k2p`) tahminin iki katı yer
// kaplıyor. GERÇEK: kişi başına ~6-7 KB/sn.
//   100 eşzamanlı köy oyuncusu → ~0,7 MB/sn çıkış: sorun değil
//   1000 → ~7 MB/sn: gerçek para. İlk düğmeler tavan 30→20, tick 5→3 Hz
//   (ikisi birlikte ~%56 azaltır). Ölçüm testte, tahmine geri dönme.

/** Köy hücresi (px). Köy 3072×2048 → 6×4 = 24 hücre. */
const KOY_HUCRE = 512;
/** Bir köy hücresinde en fazla kaç hayalet yayınlanır — kullanıcı kararı */
const KOY_TAVAN = 30;
/**
 * Köy yayın hızı — boss odasından AYRI.
 * Boss odası 8 Hz'de kalıyor: orada dövüş var, takılan hayalet göze çarpar.
 * Köyde herkes yürüyor; 5 Hz yeterli ve bant genişliğini ~%38 azaltıyor.
 */
const KOY_TICK_MS = 200;          // 5 Hz
/** Balon bu yaştan sonra çerçeveye eklenmez (sn) */
const BALON_OMRU_MS = 4000;

/** Oda anahtarı: köy tek oda, boss odaları haftaya göre ayrı */
const KOY = 'village';

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
  /**
   * Lonca kimliği — lonca kanalının hedefi.
   * ⚠️ `tag` ile AYNI sorgudan geliyor (bkz. `guild.ts tagOf`) ve aynı
   * gerekçeyle bağlanırken bir kez okunuyor.
   */
  guildId: string | null;
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
  /**
   * Hangi odada.
   *
   * ⚠️ NİYE EKLENDİ: köy ile boss odası aynı havuzda duruyordu ve ikisini
   * `gorunur` bayrağı ayırıyordu — yani köydeki oyuncu ZORUNLU olarak
   * görünmezdi, çünkü görünür olsa boss odasında belirirdi. Oda kavramı
   * gelince o kısıt kalktı: köydekiler birbirini görebilir, boss odasına
   * sızmadan.
   * ⚠️ Bağlanırken URL'den okunur (`?room=`) ve DEĞİŞMEZ: köy ve boss odası
   * zaten AYRI bağlantılar açıyor (`lib/chat.ts` vs `lib/presence.ts`).
   */
  oda: string;
  /** Son sohbet mesajı — balon için. `null` = balon yok */
  sonMesaj: string | null;
  sonMesajAt: number;
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

  // Odaya göre grupla. Boss odaları haftaya göre ayrı, köy tek oda.
  const odalar = new Map<string, Peer[]>();
  for (const p of peers.values()) {
    const anahtar = p.oda === KOY ? KOY : `boss:${p.week}`;
    const list = odalar.get(anahtar);
    if (list) list.push(p); else odalar.set(anahtar, [p]);
  }

  // ⚠️ KÖY KENDİ HIZINDA. Tek zamanlayıcı 8 Hz'de dönüyor; köy yayınını her
  // turda yapmak boşuna bant genişliği olurdu (köyde herkes yürüyor). Ayrı
  // bir `setInterval` kurmak yerine biriktirici kullanılıyor — iki
  // zamanlayıcı, iki ayrı temizleme yolu demekti.
  const koyZamani = now - sonKoyYayini >= KOY_TICK_MS;
  if (koyZamani) sonKoyYayini = now;

  for (const [anahtar, list] of odalar) {
    if (anahtar === KOY) { if (koyZamani) koyYayini(list, now); }
    else bossYayini(list);
  }
}

/** Köyün son yayın zamanı — köy 5 Hz, boss odası 8 Hz */
let sonKoyYayini = 0;

/**
 * BOSS ODASI — eski davranış, birebir korunuyor.
 * ⚠️ O(n²) burada KALIYOR ve bu bilinçli: boss odası hafta başına ayrı ve
 * `MAX_GHOSTS` 24; oradaki kalabalık köyünki gibi büyümüyor. Izgarayı
 * oraya da taşımak, ölçülmemiş bir sorun için karmaşıklık satın almak olurdu.
 */
function bossYayini(list: Peer[]) {
  // ⚠️ Herkese HERKESİ göndermiyoruz: kendini listeden çıkar, yoksa oyuncu
  // kendi hayaletini üstünde görür ve "gecikmeli ikizim var" sanır.
  for (const me of list) {
    if (me.ws.readyState !== WebSocket.OPEN) continue;
    const others = [];
    for (const o of list) {
      if (o === me) continue;
      if (!o.gorunur) continue;
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

/** Hücre anahtarı — konumdan türer */
const hucreOf = (x: number, y: number) =>
  `${Math.floor(x / KOY_HUCRE)},${Math.floor(y / KOY_HUCRE)}`;

/**
 * KÖY MEYDANI — IZGARA YAYINI.  ⬅️ "1000 oyuncuda hangi 30?" sorusunun cevabı
 *
 * ⚠️ OYUNCU BAŞINA "EN YAKIN 30" DEĞİL. O yaklaşım O(n²): 1000 oyuncuda tick
 * başına 1 milyon karşılaştırma × 5 Hz. Bunun yerine liste HÜCRE BAŞINA bir
 * kez kuruluyor ve o hücredeki herkese aynısı gidiyor — O(n).
 *
 * ⚠️ SABİT SHARD (hash % N) DA DEĞİL: birlikte duran iki arkadaş birbirini
 * görmek ZORUNDA. Köyde doğal oda anahtarı konumdur — "yanımdaki kişi".
 *
 * ⚠️ KABUL EDİLEN TAKAS, açıkça: aynı hücredeki iki oyuncu AYNI 30'u görür.
 * Meydana 200 kişi yığılırsa 170'i görünmez kalır — ama TUTARLI şekilde,
 * titremeden. Her adımda değişen bir "en yakın 30" listesi, kalabalıkta
 * hayaletlerin sürekli belirip kaybolması demekti.
 *
 * ⚠️ SIRALAMA CÜZDANA GÖRE SABİT. `Map` ekleme sırası kullanılsaydı biri
 * bağlanıp koptukça listedeki 30 kişi değişir, ekran titrerdi.
 */
function koyYayini(list: Peer[], now: number) {
  // 1) Hücrelere kovala — O(n)
  const kovalar = new Map<string, Peer[]>();
  for (const p of list) {
    if (!p.gorunur) continue;      // konum göndermemiş bağlantı hayalet değil
    const k = hucreOf(p.x, p.y);
    const b = kovalar.get(k);
    if (b) b.push(p); else kovalar.set(k, [p]);
  }

  // 2) Hücre başına TEK liste (kendi hücresi + 8 komşu), tavanla — O(hücre)
  const listeler = new Map<string, ReturnType<typeof ozet>[]>();
  for (const k of kovalar.keys()) {
    const [cx, cy] = k.split(',').map(Number);
    const aday: Peer[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const komsu = kovalar.get(`${cx + dx},${cy + dy}`);
        if (komsu) aday.push(...komsu);
      }
    }
    aday.sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0));
    listeler.set(k, aday.slice(0, KOY_TAVAN).map((p) => ozet(p, now)));
  }

  // 3) Gönder — herkes kendi hücresinin listesini alır, KENDİSİ çıkarılmış
  for (const p of list) {
    if (p.ws.readyState !== WebSocket.OPEN) continue;
    const liste = p.gorunur ? listeler.get(hucreOf(p.x, p.y)) : undefined;
    // ⚠️ Kendini listeden çıkarmak burada, gönderirken: hücre listesi ORTAK,
    // kişiye özel kopya çıkarmak paylaşmanın anlamını yok ederdi.
    const others = liste ? liste.filter((o) => o.n !== short(p.wallet)) : [];
    try {
      p.ws.send(JSON.stringify({ t: 'peers', peers: others }));
    } catch { /* yazılamıyorsa bir sonraki turda düşecek */ }
  }
}

/** Yayınlanan hayalet özeti — balon yalnız TAZEYSE ekleniyor */
function ozet(p: Peer, now: number) {
  const balonlu = p.sonMesaj !== null && now - p.sonMesajAt < BALON_OMRU_MS;
  return {
    n: short(p.wallet),
    x: Math.round(p.x), y: Math.round(p.y),
    f: p.facingRight ? 1 : 0,
    a: p.aura ?? undefined,
    // ⚠️ Balon MEVCUT çerçeveye biniyor, ayrı mesaj YOK. 30 hayaletin
    // tipik olarak 0-2'si balon taşır; ayrı bir yayın kurmak bant
    // genişliğini iki katına çıkarırdı.
    b: balonlu ? p.sonMesaj ?? undefined : undefined,
    bt: balonlu ? now - p.sonMesajAt : undefined,
  };
}

let timer: NodeJS.Timeout | null = null;

/**
 * ⚠️ `noServer: true` — AYNI HTTP SUNUCUSUNA İKİ ws SUNUCUSU BAĞLANAMAZ.
 *
 * Önce `new WebSocketServer({ server, path })` kullanılıyordu ve arena
 * eklenince ÖLÇÜLDÜ: `ws` her örnek için ayrı bir `upgrade` dinleyicisi
 * kuruyor, yoluna uymayan bağlantıyı da REDDEDİYOR — ikinci soket her
 * seferinde HTTP 400 alıyordu. Yönlendirme tek yerde (index.ts) yapılıyor.
 */
export function attachPresence(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  routeUpgrade(server, '/presence', wss);

  wss.on('connection', (ws, req) => {
    // ⚠️ Kimlik URL sorgusundan: tarayıcı WebSocket API'si özel başlık
    // göndermeye izin vermiyor. Jeton zaten kısa ömürlü HMAC.
    const url = new URL(req.url ?? '/', 'http://x');
    const wallet = readToken(url.searchParams.get('t') ?? undefined);
    if (!wallet) { ws.close(4001, 'oturum_yok'); return; }

    const week = bossWeek(new Date());
    // ⚠️ ODA BAĞLANTI ANINDA BELLİ ve değişmiyor: köy ve boss odası zaten AYRI
    // bağlantılar açıyor (`lib/chat.ts` vs `lib/presence.ts`). Oda değiştirmek
    // için mesaj tipi eklemek, olmayan bir esnekliğin bedelini ödemek olurdu.
    // ⚠️ Varsayılan KÖY: `room` göndermeyen ESKİ istemci köye düşer ve boss
    // odasına sızmaz. Ters varsayılan güvenli değildi.
    const oda = url.searchParams.get('room') === 'boss' ? 'boss' : KOY;
    peers.set(ws, {
      ws, wallet, week, x: 0, y: 0, facingRight: true, aura: null,
      lastSeen: Date.now(),
      gorunur: false,   // konum gelene kadar hayalet DEĞİL (bkz. alan başlığı)
      tag: null,
      guildId: null,
      oda,
      sonMesaj: null,
      sonMesajAt: 0,
    });

    // Lonca etiketini bir kez çek — hata olursa sohbet etiketsiz devam eder
    // ⚠️ Geçmiş, lonca BİLİNDİKTEN SONRA gönderiliyor. Önce hemen
    // gönderiliyordu; lonca kanalı gelince o sıra yanlış oldu — bağlanan
    // loncalı oyuncu kendi lonca geçmişini ASLA görmezdi (sorgu henüz
    // dönmemiş olurdu). Sorgu başarısız olursa yalnız dünya geçmişi gider.
    const gecmisGonder = (gid: string | null) => {
      try {
        ws.send(JSON.stringify({ t: 'chat_history', msgs: sonMesajlar(gid) }));
      } catch { /* yok */ }
    };
    tagOf(wallet).then((g) => {
      const p = peers.get(ws);
      if (p) { p.tag = g?.tag ?? null; p.guildId = g?.id ?? null; }
      // ⚠️ Bağlantı bu arada kapanmış olabilir — `p` yoksa gönderme.
      if (!p) return;
      // ⚠️ LONCA DURUMUNU SUNUCU SÖYLÜYOR, istemci ayrıca SORMUYOR.
      // İstemci `/guild/mine` çekseydi iki ayrı gerçek olurdu: bağlantı
      // kurulduktan sonra loncaya katılan oyuncunun arayüzü sekmeyi AÇAR,
      // ama soketin kaydı hâlâ loncasız olduğu için mesajları sessizce
      // düşerdi. Kanalı yönlendiren kayıt ne diyorsa arayüz onu göstermeli.
      try { ws.send(JSON.stringify({ t: 'me', g: p.tag })); } catch { /* yok */ }
      gecmisGonder(g?.id ?? null);
    }).catch(() => { gecmisGonder(null); });

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
          t?: unknown; c?: unknown; k?: unknown;
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
        // ⚠️ KALP ATIŞI. Köy bağlantısı konumu ÇİZİM DÖNGÜSÜNDEN gönderiyor
        // ve `requestAnimationFrame` ARKA PLANDAKİ SEKMEDE DURUYOR. Yani
        // sekme değiştiren oyuncu 20 saniyede `IDLE_MS`e takılıp odadan
        // atılıyordu; geri döndüğünde soketi kapalı, sohbeti sessiz.
        // ÖLÇÜLDÜ: iki sekmeli denemede sunucu sürekli tek bağlantı
        // gösteriyordu ve bunu yayın hatası sandım.
        // `setInterval` gizli sekmede ÇALIŞIYOR (rAF ve rIC'nin aksine),
        // istemci oradan atıyor.
        if (m.t === 'ping') { p.lastSeen = Date.now(); return; }

        if (m.t === 'say') {
          const metin = temizle(m.c);
          if (!metin) return;
          // ⚠️ KANAL İSTEMCİDEN GELİYOR ama HEDEF sunucuda belirleniyor:
          // istemci "guild" diyebilir, kime gideceğine `p.guildId` karar
          // verir. İstemcinin verdiği bir lonca kimliğine güvenmek, başka
          // loncanın kanalına yazmak demekti.
          const kanal: Kanal = m.k === 'guild' ? 'guild' : 'world';
          // ⚠️ HIZ SINIRI KANALLAR ARASI ORTAK ve kanal seçiminden ÖNCE.
          // Kanal başına ayrı sayaç, spam bütçesini ikiye katlardı: aynı
          // kişi dünyaya 8, loncaya 8 mesaj atardı.
          if (!konusabilir(p.wallet)) return;
          p.lastSeen = Date.now();   // konuşmak da canlılık işareti
          const msg = kaydet(short(p.wallet), metin, Date.now(), p.tag, kanal, p.guildId);
          // Loncasız biri lonca kanalına yazdıysa mesaj hiç doğmaz.
          if (!msg) return;
          // ⚠️ BALON İÇİN SON MESAJ. Metin SUNUCUNUN temizlediği hâli
          // (`temizle` zaten kırpıyor ve 180 karakterle sınırlıyor);
          // istemci ayrıca kısaltıyor — 180 karakterlik bir balon köyü kapatır.
          // ⚠️ BALON YALNIZ DÜNYA KANALINDA. Lonca mesajı balona çıksaydı
          // özel konuşma köy meydanında herkesin okuyabileceği bir yazıya
          // dönüşürdü — kanalı sunucuda ayırmanın anlamı kalmazdı.
          if (kanal === 'world') {
            p.sonMesaj = metin;
            p.sonMesajAt = Date.now();
          }
          // Dünya: herkese (gönderen dahil — kendi mesajını görmeli).
          // Lonca: yalnız aynı `guildId`.
          for (const [sock, o] of peers) {
            if (sock.readyState !== WebSocket.OPEN) continue;
            if (kanal === 'guild' && o.guildId !== p.guildId) continue;
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
export function presenceCount(): {
  total: number; byWeek: Record<number, number>; village: number;
} {
  const byWeek: Record<number, number> = {};
  let village = 0;
  for (const p of peers.values()) {
    byWeek[p.week] = (byWeek[p.week] ?? 0) + 1;
    if (p.oda === KOY) village++;
  }
  return { total: peers.size, byWeek, village };
}

/**
 * Şu an bağlı cüzdanlar.
 *
 * ⚠️ Arkadaş listesi bunu okuyor. Ayrı bir "son görülme" sütunu tutmak
 * denenmedi: her ws mesajında bir yazma demekti ve zaten burada, bellekte,
 * kesin bilgi duruyor.
 */
export function onlineWallets(): Set<string> {
  const out = new Set<string>();
  for (const p of peers.values()) out.add(p.wallet);
  return out;
}

/** Test/kapanış için — zamanlayıcıyı bırak, yoksa süreç sonlanmaz */
export function stopPresence() {
  if (timer) { clearInterval(timer); timer = null; }
  for (const [ws] of peers) { try { ws.close(); } catch { /* yok */ } }
  peers.clear();
}
