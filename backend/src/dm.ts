// ÖZEL MESAJ — arkadaşlar arası.
//
// ⚠️ NİYE VAR: kullanıcı isteği — *"oyuncular birbirlerini ekleyebilsin ve
// mesajlaşabilsin, bu ticareti hızlandırır, gold satışı konuşabilirler."*
// Marketplace bir emir defteri; pazarlık onun yapamadığı şey.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 KARŞILIKLI TAKİP = ARKADAŞ. Tek yönlü takip YETMEZ.
//
// Takip bu oyunda tek yönlü ve onaysız (bkz. `follow.ts`): "izliyorum"
// demek, "tanışıyoruz" demek değil. Tek yönlü takiple DM açmak, herkesin
// herkese yazabilmesi demekti — yani bir spam kanalı.
//
// Karşılıklı takip, iki tarafın da onay verdiği TEK işaret ve fazladan
// bir "istek kabul et" ekranı gerektirmiyor. İstek/kabul akışı üç ekran,
// iki bildirim ve bir bekleyen-durum demekti; aynı korumayı sıfır
// makineyle alıyoruz.
// ══════════════════════════════════════════════════════════════════════
//
// ⚠️ DM EMANET DEĞİLDİR. Amaç gold ticareti olduğu için dolandırıcılık
// riski gerçek: "önce sen gönder" en eski oyun dolandırıcılığıdır.
// Arayüz bunu AÇIKÇA söylüyor (`FriendsPanel`) ve marketplace'i
// gösteriyor — orada gold escrow'a kilitleniyor ve alım tek işlemde
// kapanıyor.

import { adlariCoz } from './names.js';
import { oyuncuAdi } from '@game/playerName';
import crypto from 'node:crypto';
import { prisma } from './db.js';

export class DmError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/** Tek mesajın en fazla uzunluğu */
export const MAX_UZUNLUK = 400;
/** Bir konuşmada geriye dönük getirilen mesaj sayısı */
export const SAYFA = 60;

/**
 * Spam penceresi — sohbetinkinden AYRI.
 *
 * ⚠️ Ortak sayaç kullanılsaydı, köyde konuşan biri arkadaşına yazamaz
 * hâle gelirdi; ikisi farklı eylem. Ama DM de sınırsız olamaz: bir
 * arkadaşa saniyede on mesaj atmak taciz aracıdır.
 */
const PENCERE_MS = 60_000;
const PENCERE_TAVANI = 20;
const gonderimler = new Map<string, number[]>();

export function dmGonderebilir(wallet: string, now = Date.now()): boolean {
  const guncel = (gonderimler.get(wallet) ?? []).filter((t) => now - t < PENCERE_MS);
  if (guncel.length >= PENCERE_TAVANI) { gonderimler.set(wallet, guncel); return false; }
  guncel.push(now);
  gonderimler.set(wallet, guncel);
  return true;
}

/** ⚠️ Yalnız test için */
export function dmSayaclariSifirla(): void { gonderimler.clear(); }

/**
 * Metni temizle — `chat.ts`teki kuralın aynısı.
 *
 * ⚠️ HTML YOK ve satır sonları tek boşluğa iniyor: çok satırlı bir mesaj
 * konuşma listesini ele geçirebilirdi.
 */
export function temizle(ham: unknown): string | null {
  if (typeof ham !== 'string') return null;
  const t = ham.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length === 0) return null;
  return t.slice(0, MAX_UZUNLUK);
}

/**
 * ⭐ ARKADAŞ MI — iki yönlü takip.
 *
 * ⚠️ TEK SORGU, iki değil: `in` ile her iki yönü birden okuyup sayıyoruz.
 * İki ayrı sorgu her mesajda iki gidiş-dönüş demekti.
 */
export async function arkadasMi(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const satirlar = await prisma.follow.findMany({
    where: {
      OR: [{ wallet: a, target: b }, { wallet: b, target: a }],
    },
    select: { wallet: true },
  });
  return satirlar.some((s) => s.wallet === a) && satirlar.some((s) => s.wallet === b);
}

export interface DmMesaj {
  id: string;
  /** gönderen BEN miyim */
  mine: boolean;
  body: string;
  at: number;
}

/**
 * Bir konuşmayı oku ve OKUNDU işaretle.
 *
 * ⚠️ İŞARETLEME BURADA, ayrı bir uçta DEĞİL: "okundu" bir görüntüleme
 * sonucudur ve istemcinin ayrıca bildirmesine bırakılırsa unutulur —
 * sayaç sonsuza kadar kırmızı kalırdı.
 */
export async function konusma(ben: string, oteki: string): Promise<DmMesaj[]> {
  if (!(await arkadasMi(ben, oteki))) throw new DmError('arkadas_degil', 403);

  const satirlar = await prisma.directMessage.findMany({
    where: {
      OR: [{ from: ben, to: oteki }, { from: oteki, to: ben }],
    },
    orderBy: { createdAt: 'desc' },
    take: SAYFA,
  });

  // ⚠️ Yalnız KARŞIDAN gelenler okundu sayılır; kendi mesajını okumak
  // diye bir şey yok ve `readAt` orada anlamsız bir alan olurdu.
  await prisma.directMessage.updateMany({
    where: { from: oteki, to: ben, readAt: null },
    data: { readAt: new Date() },
  });

  // ⚠️ Ters çevriliyor: sorgu EN YENİDEN alıyor (indeks öyle), ekran
  // eskiden yeniye okuyor.
  return satirlar.reverse().map((m) => ({
    id: m.id, mine: m.from === ben, body: m.body, at: m.createdAt.getTime(),
  }));
}

export async function gonder(ben: string, oteki: string, ham: unknown): Promise<DmMesaj> {
  const metin = temizle(ham);
  if (!metin) throw new DmError('bos_mesaj');
  if (!(await arkadasMi(ben, oteki))) throw new DmError('arkadas_degil', 403);
  // ⚠️ Sınır arkadaşlıktan SONRA: "yavaşla" demeden önce "yazabilir
  // misin" sorusu cevaplanmalı, yoksa yabancıya da sayaç harcatırdık.
  if (!dmGonderebilir(ben)) throw new DmError('cok_hizli', 429);

  const m = await prisma.directMessage.create({
    data: { id: crypto.randomUUID(), from: ben, to: oteki, body: metin },
  });
  return { id: m.id, mine: true, body: m.body, at: m.createdAt.getTime() };
}

export interface DmThread {
  wallet: string;
  /** kısaltılmış ad */
  name: string;
  online: boolean;
  lastBody: string | null;
  lastAt: number | null;
  unread: number;
}

/**
 * Arkadaş listesi + her biriyle son mesaj ve okunmamış sayısı.
 *
 * ⚠️ ARKADAŞI OLMAYAN DA BOŞ DÖNMEZ, LİSTE DÖNER: panel "kimse yok"
 * yerine "şunları ekle" diyebilsin. Boş bir ekran, sistemin bozuk
 * olduğunu düşündürür.
 */
export async function threadler(
  ben: string, online: (w: string) => boolean,
): Promise<DmThread[]> {
  const [benim, bana] = await Promise.all([
    prisma.follow.findMany({ where: { wallet: ben }, select: { target: true } }),
    prisma.follow.findMany({ where: { target: ben }, select: { wallet: true } }),
  ]);
  const takipEttiklerim = new Set(benim.map((f) => f.target));
  // ⚠️ Kesişim = karşılıklı takip = arkadaş
  const arkadaslar = bana.map((f) => f.wallet).filter((w) => takipEttiklerim.has(w));
  if (arkadaslar.length === 0) return [];

  /**
   * ⚠️ İKİ SORGU, N DEĞİL. Arkadaş başına sorgu atmak 50 istek demekti ve
   * panel her açılışta yavaşlardı — `follow.ts`te ölçülmüş aynı tuzak.
   */
  const [sonlar, okunmamis] = await Promise.all([
    prisma.directMessage.findMany({
      where: {
        OR: [
          { from: ben, to: { in: arkadaslar } },
          { to: ben, from: { in: arkadaslar } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      // ⚠️ Tavan: arkadaş başına birkaç satır yeter, hepsini çekmek
      // konuşma geçmişini belleğe almak olurdu.
      take: arkadaslar.length * 4,
      select: { from: true, to: true, body: true, createdAt: true },
    }),
    prisma.directMessage.groupBy({
      by: ['from'],
      where: { to: ben, readAt: null, from: { in: arkadaslar } },
      _count: { _all: true },
    }),
  ]);

  const sonHarita = new Map<string, { body: string; at: number }>();
  for (const m of sonlar) {
    const oteki = m.from === ben ? m.to : m.from;
    // ⚠️ Sorgu EN YENİDEN geliyor: ilk gördüğümüz o kişinin SON mesajı.
    if (!sonHarita.has(oteki)) {
      sonHarita.set(oteki, { body: m.body, at: m.createdAt.getTime() });
    }
  }
  const okunmamisHarita = new Map(okunmamis.map((o) => [o.from, o._count._all]));

  // ⚠️ TEK SORGU: satır başına `findUnique` çağırmak arkadaş sayısı kadar
  // sorgu açardı (bkz. `names.ts` başlığı).
  const adlar = await adlariCoz(arkadaslar);
  return arkadaslar
    .map((w) => ({
      wallet: w,
      // ⚠️ TEK ÇÖZÜCÜ — ad varsa ad, yoksa kısa cüzdan.
      name: oyuncuAdi({ wallet: w, name: adlar.get(w) ?? null }),
      online: online(w),
      lastBody: sonHarita.get(w)?.body ?? null,
      lastAt: sonHarita.get(w)?.at ?? null,
      unread: okunmamisHarita.get(w) ?? 0,
    }))
    /**
     * ⚠️ SIRALAMA: okunmamışı olanlar önce, sonra son konuşulan.
     * Alfabetik bir liste, bekleyen mesajı listenin dibinde bırakırdı.
     */
    .sort((a, b) => (b.unread - a.unread) || ((b.lastAt ?? 0) - (a.lastAt ?? 0)));
}

/** Toplam okunmamış — kart rozetinin okuduğu tek sayı */
export async function okunmamisSayisi(ben: string): Promise<number> {
  return prisma.directMessage.count({ where: { to: ben, readAt: null } });
}
