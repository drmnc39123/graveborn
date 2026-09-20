// KOŞU SONRASI SIRADAKİ ADIM — "kazandım, şimdi ne?" boşluğu.
//
// 🔴 NİYE VAR (2026-09-20 denetimi): `FirstRun` kartı yeni oyuncunun köyde
// kaybolma sorununu İLK KOŞU İÇİN çözüyor, sonra kendini kapatıyor. Koşu
// bitince ödeme ekranının tek çıkışı hedefsiz bir CONTINUE ve oyuncu 24
// binalı köye geri bırakılıyor. Ölçülen an: ilk koşunun 300 gold'u tam iki
// Forge yükseltmesi ediyor ve bunu söyleyen hiçbir şey yok.
//
// ⚠️ TEK ÖNERİ, SABİT ÖNCELİK. Üç şey birden önermek "menü" olur ve menü
// zaten köyün kendisi. Sıra: bedava olan ve süresi geçebilen önce.
//
// ⚠️ SAF: ağ yok, `Date.now()` yok. Öneri, ancak GERÇEKTEN yapılabilir bir iş
// varsa dönüyor — yoksa `null` ve satır hiç çizilmiyor. Yapılamayacak bir şey
// öneren kart, rozetle aynı güveni kaybettirir (bkz. `game/rozet.ts`).

import type { Progress } from './progress';
import { forgeAlinabilir, streakAlinabilir } from './rozet';

export interface AdimGirdi {
  progress: Progress | null;
  /** `/me/card` özeti — demo'da null */
  ozet: { quests?: { claimable: number } | null } | null;
  /** bugünün UTC günü */
  gun: string;
}

export interface Adim {
  /** açılacak panel kimliği (`hedefiAc`) */
  panel: string;
  /** düğme etiketi — oyuncunun gideceği yerin adı */
  etiket: string;
  /** tek cümle: neden gidiyor */
  metin: string;
}

/**
 * Koşudan sonra önerilecek TEK adım.
 *
 * Öncelik sırası ve gerekçesi:
 *   1. GÖREV ÖDÜLÜ — bekliyor, gün dönünce KAYBOLUYOR (tek geri dönüşsüz olan)
 *   2. GİRİŞ SERİSİ — bugün alınmazsa seri kırılıyor
 *   3. FORGE — kaybolmuyor ama koşunun kazancını kalıcı güce çeviren adım;
 *      yeni oyuncunun ilk 300 gold'u tam buraya gidiyor
 */
export function sonrakiAdim(g: AdimGirdi): Adim | null {
  const alinabilir = g.ozet?.quests?.claimable ?? 0;
  if (alinabilir > 0) {
    return {
      panel: 'daily',
      etiket: 'TODAY',
      metin: alinabilir === 1
        ? 'A quest reward is waiting to be claimed.'
        : `${alinabilir} quest rewards are waiting to be claimed.`,
    };
  }
  const p = g.progress;
  if (p && streakAlinabilir(p, g.gun)) {
    return {
      panel: 'tavern',
      etiket: 'TAVERN',
      metin: 'Your nightly gift is ready in the tavern.',
    };
  }
  if (p && forgeAlinabilir(p)) {
    return {
      panel: 'upgrade',
      etiket: 'FORGE',
      metin: 'That gold is enough for a permanent upgrade at the Forge.',
    };
  }
  return null;
}
