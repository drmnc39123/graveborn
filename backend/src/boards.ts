// LEADERBOARDS — kamuya açık panoların ortak kuralları.
//
// 🔴 NİYE AYRI DOSYA: "kim panoda görünebilir" sorusu her panoda ayrı ayrı
// cevaplanıyordu ve cevaplar ayrışmıştı — ölçüldü (2026-09-15):
//   · tüm-zamanlar / sezon / PvP → `banned: false` var, hazine süzülmüyor
//     (hazine kayda zaten yazmıyor, `ultraMi` kapısı — ama kapı YAZMADA)
//   · `/daily` → HİÇBİR süzgeç yok: banlı oyuncu ve hazine listeleniyordu
// Yeni merkez 11 pano açıyor. Kuralı 11 yere kopyalamak, birinin unutulması
// demekti; burası tek kaynak ve `boards.test` her panonun bunu kullandığını
// kaynaktan tarıyor.

import { GUNLUK_TABLO } from '@game/daily';
import { forgeLevelsOf } from '@game/forge';
import { prisma } from './db.js';
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
 * tüm bölümlerle geliyor. Toz, forge, ossuary gibi YENİ panolar bakiyeden
 * okuyor ve orada yazma kapısı yok — hazine hepsinde 1. sıraya otururdu.
 */
export function herkeseAcikOyuncu(): { banned: false; wallet?: { not: string } } {
  const h = hazineAdresi();
  return { banned: false, ...(h ? { wallet: { not: h } } : {}) };
}

export interface GunlukSatir { rank: number; wallet: string; name: string | null; depth: number; hero: string }

/**
 * GÜNLÜK İNİŞ tablosu — bugünün kapanmış, kırpılmamış koşuları.
 *
 * 🔴 SÜZGEÇSİZDİ (2026-09-15): `/daily` içinde yazılıydı ve banlı oyuncuyu
 * da hazineyi de listeliyordu. Buraya taşındı ki test edilebilsin ve
 * `/boards/daily` aynı sorguyu okusun — iki kopya olmasın.
 *
 * @param bas bugünün başlangıcı (`gunBaslangici()`)
 */
export async function gunlukTablo(bas: Date): Promise<GunlukSatir[]> {
  const rows = await prisma.run.findMany({
    where: {
      mode: 'daily', startedAt: { gte: bas }, claimedAt: { not: null }, capped: false,
      player: herkeseAcikOyuncu(),
    },
    // ⚠️ Beraberlikte ÖNCE BİTİREN üstte: aynı derinliğe önce ulaşan
    // daha iyi oynamıştır ve sıralama kararlı olmalı.
    orderBy: [{ awardedDepth: 'desc' }, { claimedAt: 'asc' }],
    take: GUNLUK_TABLO,
    // ⚠️ Ad AYNI SORGUDAN: ilişki süzgeç için zaten birleşiyor.
    select: { wallet: true, awardedDepth: true, hero: true, player: { select: { name: true } } },
  });
  return rows.map((r, i) => ({
    rank: i + 1, wallet: r.wallet, name: r.player.name, depth: r.awardedDepth ?? 0, hero: r.hero,
  }));
}

/**
 * PANO SÜTUNLARINI SIFIRDAN KUR — `goldEarned` ve `forgeLevels`.
 *
 * Deploy sonrası bir kez (migration BİLEREK doldurmuyor, bkz. migration.sql)
 * ve şüphe olduğunda. İDEMPOTENT: iki kez çalıştırmak aynı sonucu verir.
 *
 * ⚠️ `goldEarned` DEFTERDEN, `Run.awarded`dan DEĞİL: boss koşusu
 * `Run.awarded`a HASAR yazıyor (bkz. `/boss/finish`) ve profildeki "gold
 * earned" tam bu yüzden şişikti. Defterin `run` kaydı ise yalnız
 * `/run/finish`in kampanya/descent yolunda, gold ile birlikte yazılıyor —
 * sütunun canlıda artırıldığı AYNI yer. İki tanım tek kaynağa bağlı.
 *
 * ⚠️ Koşu başına `gold > 0`: canlı yazım `Math.max(0, …)` ile artırıyor.
 * 🔴 Hazine 0: ultra hesabın koşuları defterde duruyor ama sayılmıyor.
 */
export async function panoSutunlariniKur(): Promise<{ gold: number; forge: number }> {
  const h = hazineAdresi();
  const gold = await prisma.$executeRaw`
    UPDATE "Player" p SET "goldEarned" = COALESCE((
      SELECT SUM(l.gold)::int FROM "Ledger" l
      WHERE l.wallet = p.wallet AND l.kind = 'run' AND l.gold > 0
    ), 0)
    WHERE p.wallet <> ${h ?? ''}`;
  if (h) await prisma.player.updateMany({ where: { wallet: h }, data: { goldEarned: 0 } });

  // `upgrades` JSON — toplamı SQL'de değil, canlı yazımla AYNI fonksiyonla.
  // İkinci bir SQL tanımı, kırpma kuralı değişince sessizce ayrışırdı.
  let forge = 0;
  let imlec: string | undefined;
  for (;;) {
    const sayfa = await prisma.player.findMany({
      take: 500,
      ...(imlec ? { skip: 1, cursor: { wallet: imlec } } : {}),
      orderBy: { wallet: 'asc' },
      select: { wallet: true, upgrades: true, forgeLevels: true },
    });
    if (sayfa.length === 0) break;
    for (const p of sayfa) {
      const ups = p.upgrades && typeof p.upgrades === 'object' ? (p.upgrades as Record<string, number>) : {};
      const dogru = forgeLevelsOf(ups);
      if (dogru !== p.forgeLevels) {
        await prisma.player.updateMany({ where: { wallet: p.wallet }, data: { forgeLevels: dogru } });
        forge += 1;
      }
    }
    imlec = sayfa[sayfa.length - 1].wallet;
  }
  return { gold, forge };
}

/** Bir cüzdan panoda görünebilir mi — `Player` ilişkisi olmayan tablolar için */
export function herkeseAcikMi(wallet: string, banned: boolean): boolean {
  if (banned) return false;
  const h = hazineAdresi();
  return !(h && wallet === h);
}
