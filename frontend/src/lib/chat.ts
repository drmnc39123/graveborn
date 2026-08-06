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

export interface ChatMessage {
  /** kısa cüzdan */
  n: string;
  /** metin */
  m: string;
  /** sunucu zaman damgası (ms) */
  at: number;
}

export interface ChatHandle {
  /** en yeni sonda — arayüz bunu okur */
  messages: ChatMessage[];
  /** bağlı mı (arayüz "bağlanıyor…" gösterebilsin) */
  bagli: boolean;
  say(text: string): void;
  close(): void;
}

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
): ChatHandle {
  const bos: ChatHandle = { messages: [], bagli: false, say() {}, close() {} };

  const token = getToken();
  if (!token || typeof window === 'undefined') return bos;

  const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
  let url: string;
  try {
    const u = new URL(api);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/presence';
    u.searchParams.set('t', token);
    url = u.toString();
  } catch {
    return bos;
  }

  let ws: WebSocket;
  try { ws = new WebSocket(url); } catch { return bos; }

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

  const handle: ChatHandle = {
    messages: [],
    bagli: false,
    say(text) {
      const t = text.trim();
      if (!t || ws.readyState !== WebSocket.OPEN) return;
      // ⚠️ Uzunluk/spam DOĞRULAMASI SUNUCUDA. Burada kesmek sadece boşuna
      // bayt göndermemek için; istemci kontrolü bir güvenlik katmanı DEĞİL.
      try { ws.send(JSON.stringify({ t: 'say', c: t.slice(0, 180) })); } catch { /* yok */ }
    },
    close() {
      iptal = true;   // bundan sonra hiçbir olay React'e yansımaz
      try { ws.close(); } catch { /* zaten kapalı */ }
      handle.messages = [];
      handle.bagli = false;
    },
  };

  const ekle = (msgs: ChatMessage[]) => {
    // ⚠️ Referansı değiştiriyoruz, diziyi yerinde değil: React kimliğe bakıyor,
    // yerinde değiştirmek yeniden çizimi tetiklemez.
    handle.messages = [...handle.messages, ...msgs].slice(-MAX);
    if (!iptal) onMessages(handle.messages);
  };

  ws.onopen = () => { handle.bagli = true; if (!iptal) onBagli(true); };

  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data)) as {
        t?: string; msg?: ChatMessage; msgs?: ChatMessage[];
      };
      if (m.t === 'chat_history' && Array.isArray(m.msgs)) {
        handle.messages = m.msgs.slice(-MAX);
        if (!iptal) onMessages(handle.messages);
      } else if (m.t === 'chat' && m.msg) {
        ekle([m.msg]);
      }
      // 'peers' mesajları burada YOK SAYILIR — bu bağlantı köyde, hayalet
      // çizmiyor. Boss odasının kendi tutamağı var (lib/presence.ts).
    } catch { /* bozuk mesaj — yok say */ }
  };

  ws.onerror = () => { handle.bagli = false; if (!iptal) onBagli(false); };
  ws.onclose = () => { handle.bagli = false; if (!iptal) onBagli(false); };

  return handle;
}
