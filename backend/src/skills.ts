// BECERİ AĞACI — sunucu tarafı.
//
// Tasarım ve sayılar `@game/skills`'te. Burada üç iş var: PUANI TÜRETMEK,
// dağılımı doğrulamak ve respec bedelini almak.
//
// ⚠️ İSTEMCİNİN GÖNDERDİĞİ LİSTE BİR İSTEK, BİR YETKİ DEĞİL. Kaydedilen şey
// her zaman `sanitizeSkills`'in ÇIKTISI — istemci "hepsi açık" diyebilir,
// sunucu hak edilene indirger. Doğrulama iki yerde yazılmıyor: aynı saf
// fonksiyon hem arayüzde hem burada çalışıyor, çünkü ayrışan taraf bedava
// güç dağıtırdı.
//
// ⚠️ PUAN SATIN ALINMIYOR, TÜRETİLİYOR. Ayrı bir para birimi, ayrı bir
// kazanç yolu ve ayrı bir doğrulama yok: puan, sunucunun zaten kabul ettiği
// derinlikten (`depthPaid`) geliyor. Derinlik süre tabanına kırpıldığı için
// puan da kendiliğinden kırpılmış oluyor.

import { SKILLS, respecCost, sanitizeSkills, skillBonus, skillPoints, spentPoints } from '@game/skills';
import { STAGES } from '@game/config';
import { paidDepth, type Progress } from '@game/progress';
import type { StatKey } from '@game/config';
import { prisma, toProgress } from './db.js';
import { withLedger } from './ledger.js';

export class SkillError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/**
 * Oyuncunun HAK ETTİĞİ puan.
 *
 * ⚠️ `depthPaid`'ten türüyor — yani sunucunun ÖDEDİĞİ derinlikten, iddia
 * edilenden değil. Ascension kilidiyle aynı kaynak, aynı gerekçe.
 */
export function pointsOf(p: Progress): number {
  const enDerin = STAGES.reduce((m, st) => Math.max(m, paidDepth(p, st.id)), 0);
  return skillPoints(enDerin);
}

/** Kayıttaki dağılım — her okumada doğrulanır, bayat kayıt güç veremesin */
function allocOf(raw: unknown, points: number): string[] {
  return sanitizeSkills(raw, points);
}

export interface SkillView {
  nodes: string[];
  points: number;
  spent: number;
  /** dağılımı bozmanın gold bedeli */
  respec: number;
}

export async function listSkills(wallet: string): Promise<SkillView> {
  const player = await prisma.player.findUnique({ where: { wallet } });
  if (!player) throw new SkillError('oyuncu_yok', 404);
  const p = toProgress(player);
  const points = pointsOf(p);
  const nodes = allocOf(player.skills, points);
  return { nodes, points, spent: spentPoints(nodes), respec: respecCost(nodes) };
}

/**
 * Takılı becerilerin motora gidecek bonusu.
 *
 * ⚠️ `/run/start` BUNU ÇAĞIRIR — istemci kendi beceri bonusunu BEYAN ETMEZ.
 * Lonca ve ekipmandaki kuralın aynısı: bir bonusun kaynağı hiçbir zaman
 * istemci olmamalı.
 *
 * ⚠️ Okurken de doğrulanıyor. Kayıt bir şekilde bayatlarsa (denge değişti,
 * bir düğüm kaldırıldı) geçersiz düğümler burada eleniyor — veritabanındaki
 * eski bir satır sessizce güç vermeye devam edemez.
 */
export async function skillsBonusOf(wallet: string): Promise<Partial<Record<StatKey, number>>> {
  const player = await prisma.player.findUnique({ where: { wallet } });
  if (!player) return {};
  const p = toProgress(player);
  return skillBonus(allocOf(player.skills, pointsOf(p)));
}

/**
 * Dağılımı kaydet.
 *
 * ⚠️ İKİ FARKLI İŞLEM, TEK UÇ:
 *   • YALNIZCA EKLEME (yeni liste eskinin üst kümesi) → BEDAVA. Bu normal
 *     ilerleme; kazandığı puanı harcayan oyuncudan para almak saçma olurdu.
 *   • BİR ŞEY ÇIKARILIYORSA → RESPEC, gold ödenir. Bedel MEVCUT dağılıma
 *     göre hesaplanıyor (yeniye göre değil): oyuncu önce hepsini silip
 *     sonra bedava yeniden dizemesin.
 */
export async function setSkills(
  wallet: string, raw: unknown,
): Promise<{ view: SkillView; charged: number }> {
  const player = await prisma.player.findUnique({ where: { wallet } });
  if (!player) throw new SkillError('oyuncu_yok', 404);
  if (player.banned) throw new SkillError('yasakli', 403);

  const p = toProgress(player);
  const points = pointsOf(p);
  const mevcut = allocOf(player.skills, points);
  const istenen = sanitizeSkills(raw, points);

  const eski = new Set(mevcut);
  const yeni = new Set(istenen);
  const cikarilan = mevcut.filter((id) => !yeni.has(id));
  const eklenen = istenen.filter((id) => !eski.has(id));
  if (cikarilan.length === 0 && eklenen.length === 0) {
    return { view: { nodes: mevcut, points, spent: spentPoints(mevcut), respec: respecCost(mevcut) }, charged: 0 };
  }

  const bedel = cikarilan.length > 0 ? respecCost(mevcut) : 0;
  if (bedel > 0 && p.gold < bedel) throw new SkillError('yetersiz_gold');

  if (bedel > 0) {
    // ⚠️ `withLedger`: iyimser kilit + defter kaydı + Crypt Vault katkısı
    // hepsi orada. Elle `player.update` yazmak üçünü de sessizce atlardı.
    await withLedger(wallet, { gold: { decrement: bedel }, skills: istenen },
      { kind: 'skill', gold: -bedel, detail: `respec ${mevcut.length}→${istenen.length}` },
      player.rev);
  } else {
    // ⚠️ Ücretsiz yolda da KOŞULLU yazma: `skills` alanının araya giren bir
    // istekle değişmemiş olması gerekiyor, yoksa iki sekme birbirinin
    // dağılımını ezerdi.
    const hit = await prisma.player.updateMany({
      where: { wallet, rev: player.rev },
      data: { skills: istenen, rev: { increment: 1 } },
    });
    if (hit.count === 0) throw new SkillError('es_zamanli_degisim', 409);
  }

  return {
    view: { nodes: istenen, points, spent: spentPoints(istenen), respec: respecCost(istenen) },
    charged: bedel,
  };
}

export { SKILLS };
