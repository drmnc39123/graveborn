// GOLD DEFTERİ — her hareketin kaydı.
//
// ⚠️ TASARIM KURALI: defter kaydı, bakiyeyi değiştiren yazma ile AYNI
// transaction'da gider. Ayrı `create` çağrısı yapmak cazip ve kısa ama bir
// tanesi başarısız olduğunda defter gerçeği yansıtmaz. Yalan söyleyen bir
// defter hiç defter olmamasından KÖTÜDÜR: ona bakıp "ekonomi sağlıklı" denir.
//
// Bu yüzden dışarı tek bir yardımcı veriliyor: `withLedger`. Oyuncu
// güncellemesini ve kaydı birlikte yapar; çağıran ikisini ayırmayı seçemez.

import crypto from 'node:crypto';
import { prisma } from './db.js';

/** Defter kalemi türü. Yeni bir gold yolu açan HER uç buraya bir tür eklemeli. */
export type LedgerKind =
  | 'run'            // koşu ödülü (musluk)
  | 'forge'          // kalıcı yükseltme
  | 'charm'          // tek koşuluk tılsım
  | 'reliquary'      // kozmetik çekilişi
  | 'dust'           // tozla hedefli alım (gold hareketi yok, iz için)
  | 'ossuary'        // anıt seviyesi
  | 'wager'          // bahis yatırımı (koşu açılırken yanar)
  | 'market_list'    // ilana kilitlenen gold (escrow)
  | 'market_cancel'; // escrow'dan geri dönen gold

export interface LedgerEntry {
  wallet: string;
  kind: LedgerKind;
  /** POZİTİF kazanç, NEGATİF harcama */
  gold: number;
  detail?: string;
}

/** Prisma'nın `create` girdisi — transaction dizisine eklenmek üzere */
export function ledgerWrite(e: LedgerEntry) {
  return prisma.ledger.create({
    data: {
      id: crypto.randomUUID(),
      wallet: e.wallet,
      kind: e.kind,
      gold: Math.round(e.gold),
      detail: e.detail ?? null,
    },
  });
}

/**
 * Oyuncu güncellemesi + defter kaydı, TEK transaction.
 *
 * `data` doğrudan `prisma.player.update`'e gider; dönüş güncellenmiş satırdır.
 * Böylece çağıran taraf "önce güncelle sonra logla" hatasını yapamaz.
 */
export async function withLedger(
  wallet: string,
  data: Parameters<typeof prisma.player.update>[0]['data'],
  entry: Omit<LedgerEntry, 'wallet'>,
) {
  const [saved] = await prisma.$transaction([
    prisma.player.update({ where: { wallet }, data }),
    ledgerWrite({ ...entry, wallet }),
  ]);
  return saved;
}

// ── OKUMA ─────────────────────────────────────────────────────────────

export interface EconomySlice {
  kind: string;
  /** bu türün toplam gold hareketi (musluklar +, sinkler −) */
  gold: number;
  count: number;
}

/**
 * EKONOMİ PANOSU — musluk/sink dengesi.
 *
 * ⚠️ Bu tablonun asıl işi TEK BİR SORUYU cevaplamak: üretilen gold
 * harcanıyor mu? Üretim sürekli tüketimi aşıyorsa gold birikir ve
 * değersizleşir; tersi olursa oyuncu hiçbir şey alamaz. Faz 2'nin bütün
 * sink çalışması bu oranı dengelemek içindi, artık ölçülebiliyor.
 */
export async function economy(sinceHours = 24 * 7): Promise<{
  since: string;
  slices: EconomySlice[];
  faucet: number;
  sink: number;
}> {
  const since = new Date(Date.now() - sinceHours * 3600_000);
  const rows = await prisma.ledger.groupBy({
    by: ['kind'],
    where: { at: { gte: since } },
    _sum: { gold: true },
    _count: true,
  });

  const slices: EconomySlice[] = rows
    .map((r) => ({ kind: r.kind, gold: r._sum.gold ?? 0, count: r._count }))
    .sort((a, b) => a.gold - b.gold);

  // Musluk = pozitif toplamlar, sink = negatiflerin mutlak değeri
  let faucet = 0;
  let sink = 0;
  for (const s of slices) {
    if (s.gold > 0) faucet += s.gold; else sink += -s.gold;
  }
  return { since: since.toISOString(), slices, faucet, sink };
}

/** Bir oyuncunun son hareketleri — kendi Tavern geçmişi ve admin dosyası için */
export async function ledgerOf(wallet: string, limit = 60) {
  const rows = await prisma.ledger.findMany({
    where: { wallet },
    orderBy: { at: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((r) => ({
    id: r.id, kind: r.kind, gold: r.gold, detail: r.detail,
    at: r.at.toISOString(),
  }));
}
