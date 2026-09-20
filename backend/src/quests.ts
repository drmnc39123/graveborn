// GÜNLÜK GÖREVLER — sunucu tarafı.
//
// Tasarım ve havuz `@game/quests`'te. Burada iki iş var: ilerlemeyi
// DOĞRULANMIŞ olaylardan işlemek ve ödülü BİR KEZ vermek.
//
// ⚠️ "GÖREVİ BİTİRDİM" DİYEN BİR UÇ YOK. İlerleme yalnızca sunucunun zaten
// doğruladığı yerlerden geliyor: kapanan koşu, kabul edilen derinlik,
// kazanılan düello/arena, defterden geçen harcama, parçalanan ekipman.
//
// ⚠️ GÜN DEĞİŞİMİ TEMBEL. Cron yok; kayıt okunduğunda günü eskiyse
// ilerleme sıfırdan başlıyor. Gece yarısı milyonlarca satır güncellemek
// gerekmiyor ve uyuyan sunucuda çalışmayan bir işe bağımlılık doğmuyor.

import {
  QUESTS, dayDustCeiling, questAccumulate, questById, questDone, questsFor,
  type QuestKind, type QuestProfile,
} from '@game/quests';
import { SIM_VERSION, STAGES } from '@game/config';
import { paidDepth, utcDay, type Progress } from '@game/progress';
import { eventMul } from '@game/events';
import { seasonWeek } from '@game/season';
import { prisma, toProgress } from './db.js';

interface QuestState {
  day: string;
  /**
   * ⚠️ GÜNÜN GÖREVLERİ DONDURULUYOR.
   *
   * Havuz oyuncunun derinliğine göre süzülüyor (bkz. QuestDef.minDepth) ve
   * derinlik GÜN İÇİNDE değişebiliyor. Her okumada yeniden hesaplasaydık,
   * oyuncu öğlen derinleştiği anda sabahki görevleri listeden düşerdi:
   * aldığı ödüller kaybolur, yarım kalan ilerleme silinirdi. Set bir kez
   * seçiliyor ve gün boyunca sabit kalıyor.
   */
  ids: string[];
  progress: Record<string, number>;
  claimed: string[];
  /** üçünü de bitirme bonusu alındı mı */
  bonus: boolean;
}

function bosDurum(day: string): QuestState {
  return { day, ids: [], progress: {}, claimed: [], bonus: false };
}

/** Havuzu belirleyen durum — SUNUCUDAN, istemciden değil */
function profil(p: Progress, pvpAcik: boolean): QuestProfile {
  return {
    deepestDepth: STAGES.reduce((m, st) => Math.max(m, paidDepth(p, st.id)), 0),
    cleared: Object.values(p.cleared ?? {}).some(Boolean),
    pvpAcik,
  };
}

/**
 * OYNANACAK RAKİP VAR MI — PvP görevlerinin kapısı.
 *
 * 🔴 NİYE (2026-09-20, canlı ölçüm: 2 oyuncu): "Win a match in the Pit"
 * görevi tek oyuncuya da düşüyordu ve yapılması İMKÂNSIZDI — kuyrukta kimse
 * yok. Aynı tuzak bu dosyanın 1. gün havuzunda bir kez ölçülüp düzeltilmişti.
 *
 * İki kanıttan biri yetiyor:
 *   · son 7 günde BAŞKASININ yayınladığı, BU motor sürümüyle oynanabilir bir
 *     düello kaydı (asenkron kol — karşıda canlı kimse gerekmiyor), VEYA
 *   · bu hafta arena maçı yapmış başka bir oyuncu (canlı kol işliyor).
 *
 * ⚠️ `simVersion` ŞART: eski sürümde yazılmış kayda meydan okunamıyor
 * (`duel.ts` sürüm kapısı), yani o kayıt oynanacak bir rakip değil.
 * ⚠️ Kendi kaydın sayılmıyor — kimse kendine görev açamaz.
 * ⚠️ Hata durumunda `false`: olmayan rakibi vadetmektense görev eksik olsun.
 *
 * ⚠️ 5 DAKİKALIK ÖNBELLEK: `trackQuest` her koşu sonunda çağrılıyor ve görev
 * seti orada da türeyebiliyor. Önbelleksiz her koşu iki ek sayım sorgusu
 * demekti; bu cevap dakikalar ölçeğinde değişen bir cevap değil.
 */
const PVP_TTL_MS = 5 * 60_000;
const pvpOnbellek = new Map<string, { at: number; val: boolean }>();

async function pvpAcikMi(wallet: string): Promise<boolean> {
  const simdi = Date.now();
  const onbellek = pvpOnbellek.get(wallet);
  if (onbellek && simdi - onbellek.at < PVP_TTL_MS) return onbellek.val;
  // ⚠️ Sınırsız büyümesin — süresi dolanları at (oyuncu sayısı artabilir)
  if (pvpOnbellek.size > 500) {
    for (const [k, v] of pvpOnbellek) if (simdi - v.at >= PVP_TTL_MS) pvpOnbellek.delete(k);
  }
  let val = false;
  try {
    const kayit = await prisma.duelRecord.count({
      where: {
        wallet: { not: wallet },
        simVersion: SIM_VERSION,
        createdAt: { gte: new Date(simdi - 7 * 24 * 3600_000) },
      },
    });
    // Arena maçı ayrı satır tutmuyor; haftalık sayaç oyuncu kaydında (`markPvpMatch`)
    val = kayit > 0 || (await prisma.player.count({
      where: {
        wallet: { not: wallet },
        duelWeek: seasonWeek(new Date(simdi)),
        duelMatches: { gt: 0 },
      },
    })) > 0;
  } catch {
    val = false;
  }
  pvpOnbellek.set(wallet, { at: simdi, val });
  return val;
}

/** SADECE TEST — rakip kapısını elle kur */
export function debugPvpAcik(wallet: string, val: boolean) {
  pvpOnbellek.set(wallet, { at: Date.now(), val });
}

/**
 * Kayıttaki durumu OKU — günü eskiyse sıfırdan.
 *
 * ⚠️ Elle düzenlenmiş kayda karşı da temizleniyor: bilinmeyen görev id'si,
 * bugünün görevlerinde olmayan bir claim ve sayı olmayan ilerleme atılıyor.
 * Aksi hâlde kayda "claimed: [hepsi]" yazmak ödülleri tekrar almanın yolu
 * olurdu.
 */
function oku(raw: unknown, wallet: string, day: string, p: QuestProfile): QuestState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<QuestState>;
  const yeniGun = s.day !== day;
  // ⚠️ Set YALNIZCA gün başında ya da kayıt bozuksa seçiliyor — bkz. `ids`
  const ids = !yeniGun && Array.isArray(s.ids) && s.ids.length > 0
    && s.ids.every((x) => typeof x === 'string' && questById(x))
    ? s.ids
    : questsFor(wallet, day, p).map((q) => q.id);
  if (yeniGun) return { ...bosDurum(day), ids };

  const bugun = new Set(ids);
  const progress: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.progress ?? {})) {
    if (!bugun.has(k)) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) progress[k] = Math.floor(n);
  }
  const claimed = Array.isArray(s.claimed)
    ? s.claimed.filter((x): x is string => typeof x === 'string' && bugun.has(x))
    : [];
  return { day, ids, progress, claimed, bonus: s.bonus === true };
}

export interface QuestView {
  day: string;
  quests: {
    id: string; text: string; goal: number; dust: number;
    progress: number; done: boolean; claimed: boolean;
  }[];
  /** üçü de alınınca verilen ek toz */
  bonus: { dust: number; ready: boolean; claimed: boolean };
  /** günün toplam toz tavanı — oyuncu ne kadarını aldığını görebilsin */
  ceiling: number;
}

export async function listQuests(wallet: string, now = new Date()): Promise<QuestView> {
  const day = utcDay(now);
  const row = await prisma.player.findUnique({ where: { wallet } });
  if (!row) throw new QuestError('oyuncu_yok', 404);
  const st = oku(row.quests, wallet, day, profil(toProgress(row), await pvpAcikMi(wallet)));
  // ⚠️ Seçilen set HEMEN yazılıyor: yoksa oyuncu paneli açtıktan sonra
  // derinleşirse bir sonraki okumada başka görevler görürdü.
  await yaz(wallet, row.quests, st);
  return goruntule(day, st, now);
}

/** Durumu KOŞULLU yaz — araya giren bir isteği ezmesin */
async function yaz(wallet: string, onceki: unknown, st: QuestState): Promise<boolean> {
  if (JSON.stringify(onceki ?? {}) === JSON.stringify(st)) return true;
  const hit = await prisma.player.updateMany({
    where: { wallet, quests: { equals: (onceki ?? {}) as object } },
    data: { quests: st as unknown as object },
  });
  return hit.count > 0;
}

/**
 * ⚠️ GÖSTERİLEN SAYI ÖDENECEK SAYI OLMALI. Etkinlik çarpanı hem `claimQuest`
 * hem burada uygulanıyor: sadece ödemede uygulansaydı panel 40 toz yazar,
 * oyuncu 80 alırdı — bu iyi bir sürpriz gibi görünüp aslında paneli yalancı
 * yapardı. Aynı gerekçeyle `ceiling` de çarpılıyor, yoksa "günün tavanı"
 * gerçek kazancın yarısını gösterirdi.
 */
function goruntule(day: string, st: QuestState, now: Date): QuestView {
  const mul = eventMul(now, 'questDust');
  const liste = st.ids.map((id) => questById(id)).filter((q): q is NonNullable<typeof q> => !!q).map((q) => {
    const ilerleme = st.progress[q.id] ?? 0;
    return {
      id: q.id, text: q.text, goal: q.goal, dust: Math.floor(q.dust * mul),
      progress: Math.min(ilerleme, q.goal),
      done: questDone(q, ilerleme),
      claimed: st.claimed.includes(q.id),
    };
  });
  return {
    day,
    quests: liste,
    bonus: {
      dust: Math.floor(QUESTS.allBonus * mul),
      // ⚠️ Bonus, üçünün de ALINMASINA bağlı (sadece bitmesine değil):
      // yoksa oyuncu bonusu alıp tek tek ödülleri almayı unutabilirdi.
      ready: liste.every((q) => q.claimed),
      claimed: st.bonus,
    },
    ceiling: Math.floor(dayDustCeiling(st.ids) * mul),
  };
}

/**
 * Doğrulanmış bir olayı görevlere işle.
 *
 * ⚠️ ÇAĞIRAN YERLER SUNUCUNUN KABUL ETTİĞİ DEĞERİ vermeli — istemcinin
 * iddiasını değil. `depth` için `settleRun`'ın kırpılmış çıktısı, `spend`
 * için deftere yazılan miktar.
 *
 * ⚠️ Hata YUTULUYOR: görev sayacı, bir koşunun kapanmasını ya da bir
 * harcamayı ASLA engellememeli. Görev bir süs; ödül akışı ana yol.
 */
export async function trackQuest(
  wallet: string, kind: QuestKind, amount = 1, now = new Date(),
): Promise<void> {
  if (amount <= 0) return;
  try {
    const day = utcDay(now);
    const row = await prisma.player.findUnique({ where: { wallet } });
    if (!row) return;
    const st = oku(row.quests, wallet, day, profil(toProgress(row), await pvpAcikMi(wallet)));
    const bugun = st.ids.map((id) => questById(id))
      .filter((q): q is NonNullable<typeof q> => !!q && q.kind === kind);
    if (bugun.length === 0) return;

    let degisti = false;
    for (const q of bugun) {
      const yeni = questAccumulate(kind, st.progress[q.id] ?? 0, Math.floor(amount));
      if (yeni !== (st.progress[q.id] ?? 0)) { st.progress[q.id] = yeni; degisti = true; }
    }
    if (!degisti) return;
    await yaz(wallet, row.quests, st);
  } catch (e) {
    console.warn('[gorev] islenemedi', wallet, kind, e);
  }
}

export class QuestError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/**
 * Ödülü al.
 *
 * ⚠️ TOZ `increment` İLE, durum KOŞULLU yazılıyor. Aynı ödüle iki kez
 * basmak (çift tık, iki sekme) tek bir ödeme yapmalı — bu oturumda aynı
 * sınıftan üç açık kapatıldı.
 */
export async function claimQuest(
  wallet: string, questId: unknown, now = new Date(),
): Promise<{ view: QuestView; dust: number }> {
  const day = utcDay(now);
  const row = await prisma.player.findUnique({ where: { wallet } });
  if (!row || row.banned) throw new QuestError('yasakli', 403);
  const st = oku(row.quests, wallet, day, profil(toProgress(row), await pvpAcikMi(wallet)));

  let toz = 0;
  if (questId === '__bonus') {
    const gorunum = goruntule(day, st, now);
    if (!gorunum.bonus.ready) throw new QuestError('bonus_hazir_degil');
    if (st.bonus) throw new QuestError('zaten_alindi');
    st.bonus = true;
    toz = QUESTS.allBonus;
  } else {
    if (typeof questId !== 'string') throw new QuestError('gecersiz_gorev');
    const q = questById(questId);
    if (!q) throw new QuestError('gecersiz_gorev');
    // ⚠️ BUGÜNÜN görevi mi — dünkü bir id ile ödül alınamamalı
    if (!st.ids.includes(questId)) throw new QuestError('bugunun_gorevi_degil');
    if (st.claimed.includes(questId)) throw new QuestError('zaten_alindi');
    if (!questDone(q, st.progress[questId] ?? 0)) throw new QuestError('tamamlanmadi');
    st.claimed.push(questId);
    toz = q.dust;
  }

  // ⚠️ ETKİNLİK ÖDEME ANINDAN ÇÖZÜLÜR, görevin verildiği andan değil.
  // Sebep: `st.ids` günün başında donuyor ve o listede etkinlik bilgisi yok.
  // "Cumartesi aldığın görev Pazartesi de çift ödesin" demek, oyuncuya
  // ödülünü BEKLETMEYİ öğretirdi — etkinliğin amacı tam tersi. Hafta sonu
  // bitmişse bonus da bitmiş olmalı.
  const mul = eventMul(now, 'questDust');
  if (mul > 1) toz = Math.floor(toz * mul);

  // ⚠️ KOŞULLU YAZMA: araya giren bir istek aynı ödülü almış olabilir.
  // `quests` alanı okuduğumuzdan farklıysa yazma düşer ve ödül tekrarlanmaz.
  const hit = await prisma.player.updateMany({
    where: { wallet, quests: { equals: (row.quests ?? {}) as object } },
    data: { quests: st as unknown as object, dust: { increment: toz } },
  });
  if (hit.count === 0) throw new QuestError('es_zamanli_degisim', 409);

  return { view: goruntule(day, st, now), dust: toz };
}
