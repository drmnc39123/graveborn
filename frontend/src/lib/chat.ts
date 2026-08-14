'use client';
// KÖY SOHBETİ — istemci tarafı.
//
// ⚠️ AYNI SOKET, AYRI TUTAMAK. Sunucuda sohbet `/presence` yolundan geçiyor
// (bkz. backend/chat.ts). Burada ayrı bir bağlantı açılıyor çünkü sohbet
// KÖYDE yaşıyor, boss koşusunda değil: ikisi farklı zamanlarda açık.
// Sunucu tarafında köydeki bağlantı hayalet olarak yayınlanmıyor (`gorunur`
// bayrağı) — yani bu bağlantı boss odasında kimseye görünmez.
//
// ⚠️ BAĞLANTI KURULAMAZSA OYUN NORMAL DEVAM EDER. Sohbet bir süs değil ama
// zorunluluk da değil; bağlanamadı diye köyü kilitlemek yanlış olurdu.

import { getToken } from '@/lib/session';
import type { Ghost } from '@/lib/presence';

/** Sohbet kanalı — sunucudaki `Kanal` ile birebir */
export type Kanal = 'world' | 'guild';

export interface ChatMessage {
  /** kısa cüzdan */
  n: string;
  /** lonca etiketi (yoksa yok) — sohbette [ETİKET] olarak basılır */
  g?: string;
  /** metin */
  m: string;
  /** sunucu zaman damgası (ms) */
  at: number;
  /**
   * Kanal. ⚠️ İSTEĞE BAĞLI: eski sunucu bu alanı göndermiyor ve o mesajlar
   * dünya kabul edilir. Zorunlu yapmak, sürüm atlarken sohbeti boşaltırdı.
   */
  c?: Kanal;
}

export interface ChatHandle {
  /** en yeni sonda — arayüz bunu okur */
  messages: ChatMessage[];
  /** bağlı mı (arayüz "bağlanıyor…" gösterebilsin) */
  bagli: boolean;
  say(text: string, kanal?: Kanal): void;
  /**
   * KÖYDEKİ DİĞER OYUNCULAR — her karede okunur, kopyalanmaz.
   * ⚠️ Eskiden bu bağlantı `peers` mesajlarını YOK SAYIYORDU: köy tek
   * kişilikti ve sunucu köydekini görünmez işaretliyordu. Oda kavramı
   * gelince köy de yayın alıyor.
   */
  ghosts: Ghost[];
  /** kendi konumunu bildir (hız kısıtı içeride) */
  push(x: number, y: number, facingRight: boolean): void;
  close(): void;
}

/**
 * AKTİF KÖY TUTAMAĞI — `HubCanvas` konumu buraya yolluyor ve hayaletleri
 * buradan okuyor.
 *
 * ⚠️ NİYE KAYIT DEFTERİ: bağlantıyı `ChatPanel` açıyor (sohbet penceresi
 * onun), ama köyü ÇİZEN `HubCanvas`. İkisinin aynı sokete ihtiyacı var.
 * Tutamağı `play/page.tsx`e taşımak da olurdu; `ChatPanel`in StrictMode
 * çift-montaj çözümü orada titizlikle yazılmış ve onu bozmamak seçildi.
 *
 * ⚠️ ÇİFT MONTAJ TUZAĞI: React geliştirme modunda `joinChat` İKİ KEZ
 * çağrılıyor ve ilk tutamak kapatılıyor. `close()` içinde koşulsuz
 * `aktif = null` yazmak, YENİ tutamağı da silerdi — bu yüzden yalnız
 * "hâlâ ben miyim" kontrolüyle temizleniyor.
 */
let aktif: ChatHandle | null = null;

/** Köyde açık bağlantı (yoksa null) */
export function koyTutamagi(): ChatHandle | null {
  return aktif;
}

/**
 * Konum gönderme hızı. ⚠️ Sunucu köyü 5 Hz yayınlıyor; daha sık göndermek
 * yalnız yukarı yönlü trafiği artırırdı, ekranda hiçbir şey değişmezdi.
 */
const KONUM_MS = 200;

/**
 * Kalp atışı aralığı. ⚠️ Sunucunun boşta kalma kapısı 20 sn (`IDLE_MS`);
 * 8 sn iki kaçırılmış atışa yer bırakır. Daha sık göndermek boşuna trafik,
 * daha seyrek göndermek yavaş ağda bağlantıyı düşürürdü.
 */
const KALP_MS = 8000;

/** Arayüzde tutulan tavan — sunucu zaten 40 gönderiyor, burada da biriktirme */
const MAX = 60;

/**
 * @param onMessages yeni mesaj listesi (referansı DEĞİŞİR — React kimliğe bakar)
 * @param onBagli    bağlantı durumu değişti
 *
 * ⚠️ İKİ AYRI GERİ ÇAĞRI, tek bir "değişti" sinyali DEĞİL. İlk sürüm tek
 * `onChange()` gönderiyordu ve çağıran taraf durumu bir ref'ten okuyordu;
 * React'in çift-montaj davranışında bayat handle okunup arayüz "bağlı değil"
 * gösteriyordu (soket gayet açıkken). Durumu React state'ine AKTARMAK
 * o sınıf hatayı tamamen kaldırıyor.
 */
export function joinChat(
  onMessages: (msgs: ChatMessage[]) => void,
  onBagli: (bagli: boolean) => void,
  /**
   * Lonca etiketi geldi (yoksa `null`).
   * ⚠️ SUNUCUDAN geliyor, ayrı bir `/guild/mine` isteğinden DEĞİL: kanalı
   * yönlendiren kayıt ile arayüzün gösterdiği kilit AYNI kaynaktan okunmalı,
   * yoksa sekme açık görünüp mesajlar sessizce düşer.
   */
  onLonca?: (tag: string | null) => void,
): ChatHandle {
  const bos: ChatHandle = { messages: [], bagli: false, ghosts: [], say() {}, push() {}, close() {} };

  const token = getToken();
  if (!token || typeof window === 'undefined') return bos;

  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
  let url: string;
  try {
    const u = new URL(api);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/presence';
    u.searchParams.set('t', token);
    // ⚠️ Sunucunun varsayılanı zaten köy; yine de AÇIKÇA yazılıyor —
    // varsayılana güvenen kod, varsayılan değişince sessizce bozulur.
    u.searchParams.set('room', 'village');
    url = u.toString();
  } catch {
    return bos;
  }

  /**
   * ⚠️ `ws` DEĞİŞKEN, sabit değil: bağlantı KOPARSA yenisi kuruluyor ve
   * `push`/`say` her zaman güncel soketi kullanmak zorunda.
   */
  let ws: WebSocket;
  /** Yeniden bağlanma denemesi — gecikme bunun üzerinden büyür */
  let deneme = 0;
  let yenidenTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * ⚠️ KAPANMIŞ TUTAMAK ARTIK KONUŞMAZ.
   *
   * React geliştirme modunda (StrictMode) efektler ÇİFT çalışıyor:
   * mount → cleanup → mount. Eski soket kapatılırken `onclose` tetikleniyor
   * ve o olay YENİ soketin `onopen`'inden SONRA gelebiliyor; sonuç olarak
   * `setBagli(true)` hemen ardından `setBagli(false)` ile eziliyordu.
   * Arayüz "bağlı değil" gösteriyor, oysa soket gayet açık. ÖLÇÜLDÜ:
   * ham WebSocket testi bağlanıp mesaj alıyordu, panel ise kapalı diyordu.
   */
  let iptal = false;

  let sonKonum = 0;

  const handle: ChatHandle = {
    messages: [],
    bagli: false,
    ghosts: [],
    push(x, y, facingRight) {
      if (ws.readyState !== WebSocket.OPEN) return;
      // ⚠️ HIZ KISITI BURADA. `HubCanvas` her karede (60 Hz) çağırıyor;
      // kısıtsız göndermek sunucuya saniyede 60 mesaj demekti ve sunucu
      // zaten 5 Hz yayınlıyor — fazlası tamamen boşa giderdi.
      const now = Date.now();
      if (now - sonKonum < KONUM_MS) return;
      sonKonum = now;
      try {
        ws.send(JSON.stringify({ x: Math.round(x), y: Math.round(y), f: facingRight ? 1 : 0 }));
      } catch { /* yok */ }
    },
    say(text, kanal = 'world') {
      const t = text.trim();
      if (!t || ws.readyState !== WebSocket.OPEN) return;
      // ⚠️ Uzunluk/spam DOĞRULAMASI SUNUCUDA. Burada kesmek sadece boşuna
      // bayt göndermemek için; istemci kontrolü bir güvenlik katmanı DEĞİL.
      // ⚠️ `k` yalnız NİYET bildiriyor: mesajın hangi loncaya gideceğine
      // sunucu kendi kaydından karar veriyor (bkz. backend/presence.ts).
      try {
        ws.send(JSON.stringify({ t: 'say', c: t.slice(0, 180), k: kanal }));
      } catch { /* yok */ }
    },
    close() {
      iptal = true;   // bundan sonra hiçbir olay React'e yansımaz
      clearInterval(kalp);
      if (yenidenTimer) { clearTimeout(yenidenTimer); yenidenTimer = null; }
      try { ws.close(); } catch { /* zaten kapalı */ }
      handle.messages = [];
      handle.ghosts = [];
      handle.bagli = false;
      // ⚠️ Yalnız HÂLÂ BENSEM temizle (bkz. çift montaj notu)
      if (aktif === handle) aktif = null;
    },
  };

  const ekle = (msgs: ChatMessage[]) => {
    // ⚠️ Referansı değiştiriyoruz, diziyi yerinde değil: React kimliğe bakıyor,
    // yerinde değiştirmek yeniden çizimi tetiklemez.
    handle.messages = [...handle.messages, ...msgs].slice(-MAX);
    if (!iptal) onMessages(handle.messages);
  };

  aktif = handle;

  /**
   * KALP ATIŞI.
   *
   * ⚠️ NİYE VAR — ÖLÇÜLDÜ. Konum `requestAnimationFrame` döngüsünden
   * gönderiliyor ve rAF ARKA PLANDAKİ SEKMEDE DURUYOR. Sunucunun 20 sn'lik
   * boşta kalma kapısı (`IDLE_MS`) bu yüzden sekme değiştiren HER oyuncuyu
   * odadan atıyordu: geri döndüğünde ne hayalet görüyor ne mesaj alıyordu,
   * ve yeniden bağlanma da yoktu — köy sayfa yenilenene kadar sessiz
   * kalıyordu. İki sekmeli denemede sunucu sürekli tek bağlantı gösterdi;
   * bunu önce yayın hatası sandım.
   *
   * ⚠️ `setInterval` KULLANILIYOR, `requestAnimationFrame` DEĞİL: zamanlayıcı
   * gizli sekmede çalışmaya devam eder (rAF ve `requestIdleCallback`
   * durur). Bu ayrım bu projede daha önce de yanlış teşhise yol açtı.
   */
  const kalp = setInterval(() => {
    if (iptal) return;
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ t: 'ping' })); } catch { /* yok */ }
    }
  }, KALP_MS);

  /**
   * ⚠️ YENİDEN BAĞLANMA. Kopan bağlantı kendiliğinden dönmüyordu; ağ bir
   * saniye titrese sohbet oyunun geri kalanı çalışırken ölü kalıyordu.
   * Gecikme katlanarak büyüyor — sunucu gerçekten kapalıysa saniyede bir
   * deneyen bir istemci onu daha da zorlar.
   */
  const yenidenBagla = () => {
    if (iptal || yenidenTimer) return;
    const gecikme = Math.min(1000 * 2 ** deneme, 15_000);
    deneme += 1;
    yenidenTimer = setTimeout(() => {
      yenidenTimer = null;
      if (iptal) return;
      try { ws = new WebSocket(url); } catch { return; }
      bagla();
    }, gecikme);
  };

  function bagla() {
    ws.onopen = () => {
      deneme = 0;             // başarılı bağlantı gecikmeyi sıfırlar
      handle.bagli = true;
      if (!iptal) onBagli(true);
    };
    ws.onmessage = onMsg;
    ws.onerror = () => { handle.bagli = false; if (!iptal) onBagli(false); };
    ws.onclose = () => {
      handle.bagli = false;
      // ⚠️ Hayaletler TEMİZLENİYOR: bağlantı yokken ekranda donmuş
      // hayaletler bırakmak, orada olmayan insanları varmış gibi göstermek
      // olurdu — sosyal katmanda en kötü yalan budur.
      handle.ghosts = [];
      if (!iptal) { onBagli(false); yenidenBagla(); }
    };
  }

  const onMsg = (ev: MessageEvent) => {
    try {
      const m = JSON.parse(String(ev.data)) as {
        t?: string; msg?: ChatMessage; msgs?: ChatMessage[]; peers?: Ghost[];
        g?: string | null;
      };
      if (m.t === 'me') { if (!iptal) onLonca?.(m.g ?? null); return; }
      if (m.t === 'chat_history' && Array.isArray(m.msgs)) {
        handle.messages = m.msgs.slice(-MAX);
        if (!iptal) onMessages(handle.messages);
      } else if (m.t === 'chat' && m.msg) {
        ekle([m.msg]);
      } else if (m.t === 'peers' && Array.isArray(m.peers)) {
        // ⚠️ ARTIK YOK SAYILMIYOR. Eskiden buradaki yorum "bu bağlantı köyde,
        // hayalet çizmiyor" diyordu — köy tek kişilikti. Oda kavramı gelince
        // köy de kendi yayınını alıyor.
        // ⚠️ Referans DEĞİŞTİRİLİYOR: çizim döngüsü her karede okuyor, yerinde
        // değiştirmek yarım güncellenmiş bir kare gösterebilirdi.
        handle.ghosts = m.peers;
      }
    } catch { /* bozuk mesaj — yok say */ }
  };

  try { ws = new WebSocket(url); } catch { clearInterval(kalp); return bos; }
  bagla();

  return handle;
}
