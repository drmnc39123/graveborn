'use client';
// CANLI BOSS ODASI — istemci tarafı.
//
// ⚠️ HAYALETLER MOTORA HİÇ GİRMEZ. Bu dosyanın döndürdüğü liste sadece
// `render.ts`'e verilir; `Game`'in tek bir alanına yazılmaz. Sebep mimarinin
// temelinde: ödül doğrulaması "aynı seed → aynı koşu" varsayımına dayanıyor.
// Başka bir oyuncu senin simülasyonunu etkileseydi o varsayım çöker ve
// ekonominin güvenliği onunla çökerdi.
//
// ⚠️ Bağlantı kurulamazsa oyun NORMAL DEVAM EDER. Canlı görünürlük bir
// süstür; onun için koşuyu durdurmak, süsü zorunluluk yapmak olurdu.

import { getToken } from '@/lib/session';

export interface Ghost {
  /** kısa cüzdan — sunucu tam adresi yaymıyor */
  n: string;
  x: number;
  y: number;
  /** 1 = sağa bakıyor */
  f: number;
  /** takılı hale id'si (cosmetics.ts) — hayaletin rengi */
  a?: string;
  /** son sohbet mesajı — balon. Sunucu yalnız TAZEYSE gönderiyor. */
  b?: string;
  /** balonun yaşı (ms) — istemci solmayı buna göre yapar */
  bt?: number;
}

/** İstemcinin konum gönderme hızı — sunucu zaten 8 Hz yayınlıyor */
const SEND_MS = 125;

export interface PresenceHandle {
  /** o anki hayaletler — her karede okunur, kopyalanmaz */
  ghosts: Ghost[];
  /** konumu bildir (throttle içeride) */
  push(x: number, y: number, facingRight: boolean, aura: string | null): void;
  close(): void;
}

/**
 * Boss odasına bağlan. Cüzdan jetonu yoksa BAĞLANMAZ ve boş bir tutamak
 * döner — çağıran tarafın ayrı bir kontrol yazmasına gerek kalmıyor.
 */
export function joinBossRoom(): PresenceHandle {
  const bos: PresenceHandle = { ghosts: [], push() {}, close() {} };

  const token = getToken();
  if (!token || typeof window === 'undefined') return bos;

  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
  let url: string;
  try {
    const u = new URL(api);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/presence';
    u.searchParams.set('t', token);
    // ⚠️ ODAYI BAĞLANIRKEN BİLDİR. Sunucunun varsayılanı KÖY; bunu
    // göndermezsek boss odasındaki koşu köye hayalet olarak sızar.
    u.searchParams.set('room', 'boss');
    url = u.toString();
  } catch {
    return bos;
  }

  let ws: WebSocket;
  try { ws = new WebSocket(url); } catch { return bos; }

  const handle: PresenceHandle = {
    ghosts: [],
    push(x, y, facingRight, aura) {
      const now = Date.now();
      if (now - lastSend < SEND_MS) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      lastSend = now;
      try {
        ws.send(JSON.stringify({
          x: Math.round(x), y: Math.round(y), f: facingRight ? 1 : 0, a: aura ?? undefined,
        }));
      } catch { /* kapanıyorsa sessiz geç */ }
    },
    close() {
      try { ws.close(); } catch { /* zaten kapalı */ }
      handle.ghosts = [];
    },
  };

  let lastSend = 0;

  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data)) as { t?: string; peers?: Ghost[] };
      if (m.t === 'peers' && Array.isArray(m.peers)) {
        // ⚠️ Diziyi YERİNDE değiştirmiyoruz, referansı değiştiriyoruz:
        // çizim katmanı her karede `handle.ghosts` okuyor; yarı yazılmış bir
        // diziyi görmesi hayaletlerin titremesine yol açardı.
        handle.ghosts = m.peers;
      }
    } catch { /* bozuk mesaj — yok say */ }
  };

  // ⚠️ Hata ve kapanış SESSİZ: oyuncuya "sunucuya bağlanılamadı" demek,
  // tamamen kozmetik bir katman için oyunu bölmek olurdu.
  ws.onerror = () => { handle.ghosts = []; };
  ws.onclose = () => { handle.ghosts = []; };

  return handle;
}
