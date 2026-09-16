// BETA CÜZDAN ANLIK GÖRÜNTÜSÜ — kapanış hediyesinin dayanağı.
//
// 🔴 NİYE VAR (kullanıcı duyurusu, 2026-09-16): *"Beta aşamasında oyunu test
// edip cüzdanlarını bağlayan oyunculara, beta bittikten ve token çıktıktan
// sonra giriş hediyeleri otomatik gönderilecektir."* Bu söz halka açık
// verildi; dayanağı ise `Player` tablosuydu ve `betaSifirla()` o tablonun
// TAMAMINI siliyor. Yani söz verildiği hâliyle, sıfırlama anında kimin hak
// ettiği bilgisi de yok oluyordu.
//
// ⚠️ İKİ AĞIZDAN KAYIT: yönetici düğmesiyle istenildiği an, VE sıfırlamanın
// kendi içinde silmeden hemen önce. Yalnız düğmeye güvenseydik, o gün
// düğmeye basmayı unutan biri sözü tutulamaz hâle getirirdi.
//
// ⚠️ HAK EDİŞ KARARI BURADA VERİLMİYOR. Tablo herkesi ve sayılarını yazıyor
// (koşu sayısı, banlı mıydı); "kim hediye alacak" sorusu dağıtım anında,
// kullanıcının ölçütüyle cevaplanır. Kaydın işi hatırlamak, yargılamak değil.

import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';

export interface BetaSayim {
  /** tabloya yazılan/güncellenen cüzdan sayısı */
  kaydedilen: number;
  /** anlık görüntüden SONRA tabloda duran toplam */
  toplam: number;
}

/** Sayfa başına çekilen oyuncu — tek seferde belleğe almıyoruz */
const SAYFA = 500;

/**
 * Şu anki oyuncuları beta kaydına yaz. İDEMPOTENT: iki kez çalıştırmak
 * satırları çoğaltmaz, günceller.
 *
 * ⚠️ `firstSeen` KORUNUR (en eskisi kalır), `lastSeen`/`runs` İLERLER.
 * Beta boyunca birden çok kez anlık görüntü alınabilsin diye: ikinci kayıt
 * ilkini geriye çekmemeli.
 * ⚠️ `giftSentAt`e DOKUNULMAZ — hediye gönderildikten sonra alınan bir
 * anlık görüntü, damgayı silip ikinci kez göndermeye yol açardı.
 *
 * @param tx sıfırlama gibi çağıranlar kendi transaction'ını verir
 */
export async function betaAnlikGoruntu(
  tx: Prisma.TransactionClient = prisma,
): Promise<BetaSayim> {
  let imlec: string | undefined;
  let kaydedilen = 0;

  for (;;) {
    const sayfa = await tx.player.findMany({
      take: SAYFA,
      ...(imlec ? { skip: 1, cursor: { wallet: imlec } } : {}),
      orderBy: { wallet: 'asc' },
      select: {
        wallet: true, name: true, createdAt: true, lastSeen: true, banned: true,
        // ⚠️ KAPANMIŞ koşu sayısı: "oynadı mı" sorusunun cevabı bu. Açık
        // bırakılmış bir koşu oynanmış sayılmaz.
        _count: { select: { runs: { where: { claimedAt: { not: null } } } } },
      },
    });
    if (sayfa.length === 0) break;

    for (const p of sayfa) {
      await tx.betaWallet.upsert({
        where: { wallet: p.wallet },
        update: {
          name: p.name,
          lastSeen: p.lastSeen,
          runs: p._count.runs,
          banned: p.banned,
          takenAt: new Date(),
        },
        create: {
          wallet: p.wallet,
          name: p.name,
          firstSeen: p.createdAt,
          lastSeen: p.lastSeen,
          runs: p._count.runs,
          banned: p.banned,
        },
      });
      kaydedilen += 1;
    }
    imlec = sayfa[sayfa.length - 1].wallet;
  }

  return { kaydedilen, toplam: await tx.betaWallet.count() };
}

export interface BetaSatir {
  wallet: string;
  name: string | null;
  runs: number;
  banned: boolean;
  firstSeen: string;
  lastSeen: string;
  giftSentAt: string | null;
}

/**
 * Panelde gösterilecek liste — en çok oynayan üstte.
 * ⚠️ Tavan var: panel bir dağıtım aracı değil, bir bakış. Tam liste indirilir.
 */
export async function betaCuzdanlari(limit = 50): Promise<{
  toplam: number; oynayan: number; banli: number; hediyeli: number; rows: BetaSatir[];
}> {
  const [toplam, oynayan, banli, hediyeli, rows] = await Promise.all([
    prisma.betaWallet.count(),
    prisma.betaWallet.count({ where: { runs: { gt: 0 }, banned: false } }),
    prisma.betaWallet.count({ where: { banned: true } }),
    prisma.betaWallet.count({ where: { giftSentAt: { not: null } } }),
    prisma.betaWallet.findMany({
      orderBy: [{ runs: 'desc' }, { lastSeen: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
    }),
  ]);
  return {
    toplam, oynayan, banli, hediyeli,
    rows: rows.map((r) => ({
      wallet: r.wallet, name: r.name, runs: r.runs, banned: r.banned,
      firstSeen: r.firstSeen.toISOString(),
      lastSeen: r.lastSeen.toISOString(),
      giftSentAt: r.giftSentAt ? r.giftSentAt.toISOString() : null,
    })),
  };
}

/**
 * TAM LİSTE — NDJSON, satır satır akıtılır (`defterAkisi` deseninin aynısı).
 * ⚠️ Sona `#EOF` mührü konuyor: yarım inen bir dağıtım listesi, "hepsi bu
 * kadarmış" diye okunur ve hak eden oyuncu hediyesiz kalır.
 */
export async function* betaAkisi(batch = 2000): AsyncGenerator<string> {
  let imlec: string | undefined;
  for (;;) {
    const sayfa = await prisma.betaWallet.findMany({
      take: batch,
      ...(imlec ? { skip: 1, cursor: { wallet: imlec } } : {}),
      orderBy: { wallet: 'asc' },
    });
    if (sayfa.length === 0) break;
    for (const r of sayfa) yield `${JSON.stringify(r)}\n`;
    imlec = sayfa[sayfa.length - 1].wallet;
  }
  yield '#EOF\n';
}
