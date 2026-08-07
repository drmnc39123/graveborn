'use client';
// ARENA İSTEMCİSİ — kuyruk yoklaması + maç soketi + kare tamponu.
//
// ⚠️ EN KRİTİK KURAL: OYUN KENDİ GİRDİNLE İLERLEMEZ.
//
// Tuşa bastığında motora dokunulmuyor; girdi sunucuya gönderiliyor ve
// sunucu onu KARE AKIŞINDA geri yolluyor. Motor yalnızca o kareyle
// ilerliyor. Yerel girdiyi doğrudan uygulamak (ve sonra sunucununkini de
// uygulamak) aynı tick'i iki kez işlerdi; sadece yerel uygulamak da iki
// tarayıcıyı ayrıştırırdı. Bedeli gidiş-dönüş gecikmesi — lockstep'in
// kabul edilmiş bedeli budur.
//
// ⚠️ MOTOR SUNUCUDAN HIZLI KOŞAMAZ. Elde kare yoksa `step()` çağrılmıyor;
// oyun kısa süre donar ve kare gelince YETİŞİR (`catchUp`). Tahmin
// (prediction) yapılmıyor: yanlış tahmini geri almak, determinizmi
// korumak zorunda olan bir motorda tek satırla bile mümkün değil.

import { ARENA, buildArenaGame, type ArenaSetup, type InputFrame } from '@/game/arena';
import type { Game } from '@/game/engine';
import { api, getToken } from '@/lib/session';

export interface ArenaEnd {
  /** 0 / 1 = kazanan taraf, null = maç sonuçsuz kapandı (kopma / tavan) */
  winner: 0 | 1 | null;
  tick: number;
  kills: [number, number];
  /** kazananın puan değişimi */
  delta: number;
}

export interface QueueState {
  state: 'waiting' | 'matched';
  setup?: ArenaSetup;
  waited?: number;
}

/** Kuyruğa gir / yoklama yap — eşleşince `setup` döner */
export async function pollQueue(): Promise<QueueState> {
  return api<QueueState>('/arena/queue', { method: 'POST', body: {} });
}

export async function leaveQueue(): Promise<void> {
  await api('/arena/queue', { method: 'DELETE' }).catch(() => { /* çıkış sessiz */ });
}

export interface ArenaHandle {
  game: Game;
  /** kendi tarafım — HUD "sen" etiketini buna göre koyuyor */
  side: 0 | 1;
  /** her karede çağrılır: yönü sunucuya gönderir */
  send(x: number, y: number): void;
  /**
   * Elde biriken kareleri motora uygula. Kaç tick işlendiğini döndürür.
   * ⚠️ Render döngüsünden çağrılmalı, kendi zamanlayıcısı YOK — böylece
   * çizim ile simülasyon aynı karede kalıyor.
   */
  catchUp(maxTicks?: number): number;
  /** sunucudan kaç tick geride kaldık — HUD gecikme göstergesi */
  behind(): number;
  connected(): boolean;
  close(): void;
}

/**
 * Maça bağlan.
 *
 * ⚠️ `onEnd` SUNUCUDAN gelir. İstemci kendi motorunda ölümü görse bile maçı
 * bitmiş SAYMAZ: yetkili olan sunucunun simülasyonu. İki taraf birkaç tick
 * kayabilir ve "ben kazandım" diyen taraf yanılıyor olabilir.
 */
export function joinArena(setup: ArenaSetup, onEnd: (e: ArenaEnd) => void): ArenaHandle {
  const game = buildArenaGame(setup);
  const bekleyen: InputFrame[] = [];
  let bagli = false;
  let kapandi = false;
  /** son gönderilen yön — değişmediyse tekrar göndermiyoruz */
  let sx = 0, sy = 0;
  let sonGonderim = 0;

  // ⚠️ `session.ts` ile AYNI değişken (`NEXT_PUBLIC_API_URL`). Farklı bir ad
  // kullanmak, üretimde HTTP doğru sunucuya giderken ws'in localhost'a
  // gitmesi demekti — ve bu ancak canlıda fark edilirdi.
  const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100')
    .replace(/^http/, 'ws');
  const ws = new WebSocket(
    `${base}/arena?t=${encodeURIComponent(getToken() ?? '')}&m=${encodeURIComponent(setup.matchId)}`,
  );

  ws.onopen = () => { bagli = true; };
  ws.onclose = () => { bagli = false; };
  ws.onerror = () => { bagli = false; };
  ws.onmessage = (ev) => {
    let m: { t?: string; frames?: InputFrame[]; winner?: 0 | 1 | null; tick?: number; kills?: [number, number]; delta?: number };
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    if (m.t === 'arena:frames' && Array.isArray(m.frames)) {
      for (const f of m.frames) bekleyen.push(f);
    } else if (m.t === 'arena:end') {
      onEnd({
        winner: m.winner ?? null, tick: m.tick ?? 0,
        kills: m.kills ?? [0, 0], delta: m.delta ?? 0,
      });
    }
  };

  return {
    game,
    side: setup.side,
    send(x, y) {
      if (!bagli || kapandi) return;
      const simdi = Date.now();
      // ⚠️ YÖN DEĞİŞMEDİYSE GÖNDERME. 60 Hz'de her karede mesaj atmak
      // gereksiz: sunucu zaten son girdiyi kullanmaya devam ediyor.
      // Yine de arada bir yenileniyor ki kopup dönen bağlantı sessizce
      // eski yöne saplanmasın.
      if (Math.abs(x - sx) < 0.01 && Math.abs(y - sy) < 0.01 && simdi - sonGonderim < 500) return;
      sx = x; sy = y; sonGonderim = simdi;
      try { ws.send(JSON.stringify({ t: 'in', x, y })); } catch { /* yok */ }
    },
    catchUp(maxTicks = ARENA.hz) {
      let n = 0;
      while (bekleyen.length && n < maxTicks) {
        // ⚠️ SEVİYE KARTI OYUNU DURDURMAZ — sunucu da ilk teklifi seçiyor.
        // Burada beklemek iki tarafı ayrıştırırdı.
        if (game.phase === 'levelup') {
          if (game.offers.length) game.choose(game.offers[0].id);
          else break;
          continue;
        }
        if (game.phase === 'dead' || game.phase === 'won') break;
        const f = bekleyen.shift()!;
        game.setInput(f[0], f[1]);
        game.setRivalInput(f[2], f[3]);
        game.step();
        n += 1;
      }
      return n;
    },
    behind() { return bekleyen.length; },
    connected() { return bagli; },
    close() {
      kapandi = true;
      try { ws.close(1000, 'ayrildi'); } catch { /* yok */ }
    },
  };
}
