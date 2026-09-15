// KAMU SÜZGECİ — "kim panoda görünebilir" sorusunun TEK cevabı.
//
// 🔴 NİYE VAR: soru her panoda ayrı ayrı cevaplanıyordu ve cevaplar
// ayrışmıştı — ölçüldü (2026-09-15):
//   · tüm-zamanlar / sezon / PvP → `banned: false` var, hazine süzülmüyor
//     (hazine kayda yazmıyor, `ultraMi` kapısı — ama kapı YAZMADA)
//   · `/daily` → HİÇBİR süzgeç yok: banlı oyuncu ve hazine listeleniyordu
// Leaderboards merkezi 11 pano açıyor. Kuralı 11 yere kopyalamak, birinin
// unutulması demekti.
//
// ⚠️ NİYE `boards.ts`TEN AYRI: pano okuyucusu `pvpSeason`, `duel`,
// `leaderboard` ve `season`ı içe aktarıyor; onlar da bu süzgeci. Süzgeç
// `boards.ts`te kalsaydı döngüsel içe aktarma olurdu.
//
// ⚠️ YAZMA/ÖDÜL YOLLARINDA KULLANILMAZ — yalnız GÖSTERİM. Ödül kapıları
// (`ultraMi`, `settleOne`un `banned:false`u) kendi yerlerinde.

import { hazineAdresi } from './solPay.js';

/**
 * Panoda görünebilecek oyuncuların `Player` süzgeci.
 *
 * ⚠️ HAZİNE KOŞULU ŞARTLI YAYILIYOR, `{ not: null }` YAZILMIYOR:
 * `hazineAdresi()` yapılandırılmamış ortamda `null` döndürüyor ve Prisma
 * `wallet: { not: null }`u zorunlu bir `String` alanda çalışma anında
 * reddediyor. Yerel geliştirmede her pano 500 dönerdi.
 *
 * ⚠️ HAZİNE NİYE SÜZÜLÜYOR (yazma kapısı varken): ultra hesap 100M gold ve
 * tüm bölümlerle geliyor. Toz, forge, ossuary gibi panolar bakiyeden
 * okuyor ve orada yazma kapısı yok — hazine hepsinde 1. sıraya otururdu.
 */
export function herkeseAcikOyuncu(): { banned: false; wallet?: { not: string } } {
  const h = hazineAdresi();
  return { banned: false, ...(h ? { wallet: { not: h } } : {}) };
}

/** Bir cüzdan panoda görünebilir mi — `Player` ilişkisi olmayan tablolar için */
export function herkeseAcikMi(wallet: string, banned: boolean): boolean {
  if (banned) return false;
  const h = hazineAdresi();
  return !(h && wallet === h);
}
