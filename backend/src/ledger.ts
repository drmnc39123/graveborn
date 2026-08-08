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
import type { Prisma } from '@prisma/client';
import { prisma, YarisHatasi } from './db.js';
import { contributeToVault } from './crypt.js';
import { trackQuest } from './quests.js';

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
  | 'market_cancel'  // escrow'dan geri dönen gold
  | 'crypt'          // Crypt Vault'tan haftalık çekim (YENİ GOLD DEĞİL — bkz. crypt.ts)
  | 'crypt_deed'     // deed alımı. ⚠️ SINK_KINDS'ta YOK: kasaya katkı yapmaz,
                     // yoksa oyuncu kendi alımından pay alırdı. Tamamen imha.
  | 'skill'          // beceri ağacı respec'i. ⚠️ GÜÇ SATMIYOR — oyuncu zaten
                     // sahip olduğu gücü yeniden diziyor; sonsuz, tekrarlanabilir
                     // ve hiçbir şey ÜRETMEYEN bir sink.
  | 'guild'          // lonca kurma + hazine bağışı. ⚠️ GERİ ÇEKİLEMEZ —
                     // çekilebilseydi lonca oyuncular arası transfer kanalı olurdu.
  | 'reforge';       // ekipman yükseltme + yeniden dizme. ⚠️ SONSUZ SINK ve
                     // hiçbir şey ÜRETMİYOR: gold gidiyor, karşılığında
                     // oyuncunun ZATEN sahip olduğu parça yeniden diziliyor.

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
  /**
   * ⚠️ OKUNAN `rev`. Verilirse yazma KOŞULLU olur: arada başka bir istek
   * yazdıysa bu işlem `YarisHatasi` atar ve hiçbir şey değişmez.
   *
   * Neden zorunlu değil: koşu kapanışı gibi bazı yollar `increment` ile
   * yazıyor ve orada yarış zaten yok. Ama GOLD HARCAYAN her yol vermeli —
   * ölçüldü, vermeyince tek ödemeyle 5 çekiliş geçiyor.
   */
  rev?: number,
  /**
   * ⚠️ AYNI TRANSACTION İÇİNDE koşan ek yazma.
   *
   * Niye var: gold harcayıp BAŞKA bir tabloyu da değiştiren işlemler
   * (ekipman yeniden dövme) iki ayrı transaction'a bölünemez — arada bir
   * çökme "gold gitti ama parça değişmedi" bırakırdı. Alternatif, bu tür
   * işlemleri `withLedger` dışında kendi transaction'ıyla yazmaktı; o da
   * kasa katkısını ve "gold harca" görevini atlardı (bkz. aşağıdaki notlar).
   *
   * ⚠️ SADECE `rev` VERİLDİĞİNDE desteklenir: gold harcayan her yol zaten
   * `rev` vermek ZORUNDA, yani kısıt bir eksiklik değil, kuralın kendisi.
   */
  extra?: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  if (rev === undefined) {
    if (extra) throw new Error('withLedger: extra icin rev zorunlu');
    const [saved] = await prisma.$transaction([
      prisma.player.update({ where: { wallet }, data }),
      ledgerWrite({ ...entry, wallet }),
    ]);
    return saved;
  }
  return prisma.$transaction(async (tx) => {
    const hit = await tx.player.updateMany({
      where: { wallet, rev },
      data: { ...(data as object), rev: rev + 1 },
    });
    // ⚠️ ÖNCE BU. Sayı 0 ise atıp çıkıyoruz; defter kaydı sonra geldiği için
    // "para gitti ama defterde yok" durumu oluşamaz.
    if (hit.count === 0) throw new YarisHatasi();

    // ⚠️ KİLİTTEN SONRA: `rev` tutmadıysa yukarıda çıktık, yani buraya
    // gelen işlem gold'u gerçekten harcadı. Ek yazma burada patlarsa
    // transaction geri alınır ve gold da geri gelir.
    if (extra) await extra(tx);

    // ⚠️ CRYPT VAULT KATKISI BURADA — her gold sink'i zaten bu fonksiyondan
    // geçiyor. Uçlara tek tek eklemek denenmedi ve denenmemeli: yeni bir sink
    // açan kişi eklemeyi unutur, kasa sessizce eksik dolar. Aynı transaction
    // içinde olması da şart, yoksa kasa ile defter ayrışır.
    await contributeToVault(tx, entry.kind, entry.gold);
  // ⚠️ "GOLD HARCA" GÖREVİ BURADAN SAYILIYOR — defter zaten HER gold
  // çıkışının tek geçidi. Harcama noktalarına tek tek `trackQuest` serpmek
  // denenmedi ve denenmemeli: yeni bir sink eklendiğinde biri unutulur ve
  // "bazı harcamalar sayılıyor" hâli hiç saymamaktan kötüdür.
  if (entry.gold < 0) void trackQuest(wallet, 'spend', -entry.gold);
    await tx.ledger.create({
      data: {
        id: crypto.randomUUID(), wallet,
        kind: entry.kind, gold: Math.round(entry.gold), detail: entry.detail ?? null,
      },
    });
    return tx.player.findUniqueOrThrow({ where: { wallet } });
  });
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
/**
 * ⚠️ YENİDEN DAĞITIM MUSLUK DEĞİLDİR — ve işaretine bakarak ayırt EDİLEMEZ.
 *
 * `crypt` (Crypt Vault haftalık çekimi) POZİTİF gold yazıyor ama yeni gold
 * DEĞİL: daha önce bir sink'ten kesilip kasada bekleyen paranın el
 * değiştirmesi. İşaretine bakan bir pano onu musluk sayar ve "musluk büyüdü"
 * der — panonun tek işi "ekonomi sağlıklı mı" sorusuna cevap vermekken
 * yalan söylemiş olur.
 *
 * Aynı gerekçe `market_cancel` için de geçerli: escrow'dan geri dönen gold
 * kazanç değil, oyuncunun kendi parasının iadesi.
 */
const REDISTRIBUTION: ReadonlySet<string> = new Set<LedgerKind>(['crypt', 'market_cancel']);

export async function economy(sinceHours = 24 * 7): Promise<{
  since: string;
  slices: EconomySlice[];
  faucet: number;
  sink: number;
  /** el değiştiren ama YARATILMAYAN gold — musluğa dahil DEĞİL */
  redistributed: number;
  /** Crypt Vault'un anlık hâli — `paid <= filled` bozulursa gold basılmış demektir */
  vault: { balance: number; filled: number; paid: number; saglikli: boolean };
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

  // Musluk = YARATILAN gold, sink = YOK EDİLEN gold, dağıtım = el değiştiren
  let faucet = 0;
  let sink = 0;
  let redistributed = 0;
  for (const s of slices) {
    if (REDISTRIBUTION.has(s.kind)) { redistributed += Math.abs(s.gold); continue; }
    if (s.gold > 0) faucet += s.gold; else sink += -s.gold;
  }

  const v = await prisma.cryptVault.findUnique({ where: { id: 1 } });
  const vault = {
    balance: v?.balance ?? 0, filled: v?.filled ?? 0, paid: v?.paid ?? 0,
    // ⚠️ Bu bayrak panoda KIRMIZI yanmalı: bozulursa bir yerde gold basılmış.
    saglikli: (v?.paid ?? 0) <= (v?.filled ?? 0) && (v?.balance ?? 0) >= 0,
  };

  return { since: since.toISOString(), slices, faucet, sink, redistributed, vault };
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
