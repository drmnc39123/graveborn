// TAKİP — tek yönlü arkadaş listesi.
//
// ⚠️ KARŞILIKLI DEĞİL, ONAY YOK. İstek/kabul akışı iki ekran, iki bildirim
// ve "bekleyen istek" durumu demekti. Oyunda kimseyi engellemek ya da gizli
// bir şey paylaşmak yok — listede görünen her şey zaten sıralamada görünüyor.
// Tek yönlü takip aynı değerin %90'ını sıfır makineyle veriyor.
//
// ⚠️ LİSTE BİR "KİM NE YAPIYOR" EKRANI. Sadece isim göstermek değersiz;
// çevrimiçi mi, kaç puanı var, en derin nereye indi ve MEYDAN OKUNABİLİR Mİ
// — asıl değer bunlarda.

import crypto from 'node:crypto';
import { duelBlocker } from '@game/duel';
import { SIM_VERSION } from '@game/config';
import { prisma } from './db.js';
import { onlineWallets } from './presence.js';

export class FollowError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/** Aynı anda takip edilebilecek en fazla kişi */
export const FOLLOW_MAX = 50;

export interface FollowRow {
  wallet: string;
  hero: string;
  online: boolean;
  duelRating: number;
  bestStage: number;
  bestDepth: number;
  /** meydan okunabilecek kaydı (varsa) — listeden doğrudan düello */
  recordId: string | null;
  recordDepth: number;
  /** meydan okunamıyorsa SEBEBİ */
  blocker: string | null;
}

export async function listFollows(
  wallet: string, cleared: Record<string, boolean>,
): Promise<{ rows: FollowRow[]; max: number }> {
  const rows = await prisma.follow.findMany({
    where: { wallet }, orderBy: { createdAt: 'asc' }, take: FOLLOW_MAX,
    select: { target: true },
  });
  if (rows.length === 0) return { rows: [], max: FOLLOW_MAX };
  const hedefler = rows.map((r) => r.target);

  // ⚠️ ÜÇ SORGU, N DEĞİL. Satır başına sorgu atmak 50 istek demekti ve
  // liste her açılışta yavaşlardı.
  const [oyuncular, kayitlar, sonMaclar] = await Promise.all([
    prisma.player.findMany({
      where: { wallet: { in: hedefler } },
      select: { wallet: true, hero: true, duelRating: true, bestStage: true, bestDepth: true, banned: true },
    }),
    prisma.duelRecord.findMany({
      where: { wallet: { in: hedefler } },
      orderBy: { rating: 'desc' },
      select: { id: true, wallet: true, stageId: true, depth: true, simVersion: true },
    }),
    prisma.duel.findMany({
      where: { challenger: wallet, defender: { in: hedefler } },
      orderBy: { createdAt: 'desc' },
      select: { defender: true, createdAt: true },
    }),
  ]);

  const online = onlineWallets();
  const enIyiKayit = new Map<string, { id: string; stageId: number; depth: number; simVersion: number }>();
  for (const k of kayitlar) if (!enIyiKayit.has(k.wallet)) enIyiKayit.set(k.wallet, k);
  const sonuncu = new Map<string, Date>();
  for (const d of sonMaclar) if (!sonuncu.has(d.defender)) sonuncu.set(d.defender, d.createdAt);

  const simdi = Date.now();
  const out: FollowRow[] = [];
  for (const t of hedefler) {
    const p = oyuncular.find((x) => x.wallet === t);
    // ⚠️ Banlı ya da silinmiş hesap listede GÖRÜNMÜYOR ama takip kaydı
    // silinmiyor: ban kalkarsa liste kendiliğinden geri geliyor.
    if (!p || p.banned) continue;
    const k = enIyiKayit.get(t);
    const son = sonuncu.get(t);
    const saat = son ? (simdi - son.getTime()) / 3_600_000 : Infinity;
    out.push({
      wallet: t, hero: p.hero, online: online.has(t),
      duelRating: p.duelRating, bestStage: p.bestStage, bestDepth: p.bestDepth,
      recordId: k?.id ?? null,
      recordDepth: k?.depth ?? 0,
      blocker: k
        ? duelBlocker({
            challenger: wallet, defender: t, hoursSince: saat,
            stageCleared: !!cleared[String(k.stageId)],
            // ⚠️ Takip listesi de aynı kapıdan geçiyor. Buradaki "CHALLENGE"
            // düğmesi `/duel/start`'a gidiyor; tabloda engellenip burada
            // engellenmeyen bir yol, kuralı olmayan bir yol demekti.
            recordSim: k.simVersion, engineSim: SIM_VERSION,
          })
        : 'They have not posted a descent yet.',
    });
  }
  // Çevrimiçi olanlar önce — listenin işe yaradığı an tam olarak o an
  out.sort((a, b) => Number(b.online) - Number(a.online) || b.duelRating - a.duelRating);
  return { rows: out, max: FOLLOW_MAX };
}

export async function follow(wallet: string, targetRaw: unknown): Promise<void> {
  if (typeof targetRaw !== 'string') throw new FollowError('gecersiz_cuzdan');
  const target = targetRaw.trim();
  if (!target) throw new FollowError('gecersiz_cuzdan');
  // ⚠️ Kendini takip etmek listeyi anlamsız kılar ve "meydan oku" düğmesi
  // kendi kaydını gösterirdi.
  if (target === wallet) throw new FollowError('kendini_takip');

  const p = await prisma.player.findUnique({
    where: { wallet: target }, select: { banned: true },
  });
  // ⚠️ "Yok" ile "banlı" AYNI cevabı veriyor: aksi hâlde liste, hangi
  // cüzdanların banlı olduğunu sorgulamanın aracı olurdu.
  if (!p || p.banned) throw new FollowError('Nobody by that name.', 404);

  const say = await prisma.follow.count({ where: { wallet } });
  if (say >= FOLLOW_MAX) throw new FollowError(`You can watch at most ${FOLLOW_MAX} hunters.`);

  try {
    await prisma.follow.create({ data: { id: crypto.randomUUID(), wallet, target } });
  } catch {
    // Tekil kısıt = zaten takip ediliyor. Hata değil, sessizce geç.
  }
}

export async function unfollow(wallet: string, target: unknown): Promise<void> {
  if (typeof target !== 'string') return;
  await prisma.follow.deleteMany({ where: { wallet, target } });
}
