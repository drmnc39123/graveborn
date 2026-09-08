// DAVET — oyunun tek büyüme kanalı.
//
// ⚠️ NİYE VAR: `docs/RESEARCH.md` referral'ı *"Kintara'nın çözemediği şey —
// bizim avantajımız"* diye işaretlemişti ve GRAVEBORN'da tek satır referral
// kodu yoktu. Oyuncu getiren bir oyuncuya söyleyecek hiçbir şeyimiz yoktu.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 ÖDÜL KAYIT ANINDA VERİLMEZ — VERİLİRSE BOT ÇİFTLİĞİNE PARA BASARIZ.
//
// Bir cüzdan üretmek bedava; bin cüzdan üretmek de bedava. Kayıt başına
// ödül veren her sistem, en ucuz saldırıya en yüksek ödülü verir.
// Burada ödül DAVET EDİLENİN OYNAMASINA bağlı: ancak `ODUL_DERINLIGI`
// derinliğine indiğinde iki taraf da alır. O derinlik ölçüldü — sıfır
// Forge'la ortalama iniş 8,2, yani eşik gerçek bir oturum demek.
// Botun ödemesi gereken şey cüzdan değil ZAMAN.
// ══════════════════════════════════════════════════════════════════════
//
// ⚠️ ÖDÜL GOLD DEĞİL, TOZ. Gold'un tek kaynağı koşmaktır ve bu bir kural,
// bir tercih değil: ikinci bir gold kaynağı oyuncu sayısıyla büyür ve
// birincisini boğar. Codex bunu oyuncuya da söylüyor (`codex.ts` → GOLD)
// ve `codex.test` iddiayı tarıyor. Toz yalnız kozmetik alır, ekonomiye
// sızmaz.
//
// ⚠️ KOD BİR KİMLİK: `refCode @unique`. İki oyuncuya aynı kod düşerse
// ödül yanlış kişiye gider ve bunu geri almanın yolu yoktur.

import {
  KOD_ALFABE as ALFABE, KOD_PENCERESI_GUN, KOD_UZUNLUK, ODUL_DERINLIGI,
  ODUL_TAVANI, ODUL_TOZ, kodTemizle,
} from '@game/referral';
import { prisma } from './db.js';

// ⚠️ Sabitler `@game/referral`de: sunucu · arayuz · Codex ucu de ayni
// sayiyi okumali. Yeniden disa aktariliyor ki cagiranlar tek yerden alsin.
export {
  KOD_PENCERESI_GUN, ODUL_DERINLIGI, ODUL_TAVANI, ODUL_TOZ, kodTemizle,
};

export class ReferralError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/**
 * Kod alfabesi — KARIŞTIRILAN HARFLER YOK.
 *
 * ⚠️ `0/O`, `1/I/l` çıkarıldı: kod ağızdan ağıza ve ekran görüntüsünden
 * yazılıyor. Bir oyuncunun kodu yanlış yazması, davetin sessizce
 * kaybolması demek — ve kimse "yanlış harf yazdım" diye şikâyet etmez,
 * sadece bir daha denemez.
 */
function kodUret(): string {
  let out = '';
  for (let i = 0; i < KOD_UZUNLUK; i++) {
    out += ALFABE[Math.floor(Math.random() * ALFABE.length)];
  }
  return out;
}


/**
 * Oyuncunun kodu — yoksa üret.
 *
 * ⚠️ ÇAKIŞMA GERÇEK: 31^6 ≈ 887 milyon kombinasyon çok gibi görünür ama
 * doğum günü paradoksu yüzünden birkaç bin oyuncuda çakışma ihtimali
 * ihmal edilemez. `@unique` kısıtı çakışmayı YAZMA anında kesiyor ve
 * burada birkaç kez yeniden deneniyor.
 */
export async function kodumu(wallet: string): Promise<string> {
  const p = await prisma.player.findUnique({
    where: { wallet }, select: { refCode: true },
  });
  if (p?.refCode) return p.refCode;

  for (let deneme = 0; deneme < 8; deneme++) {
    const kod = kodUret();
    try {
      // ⚠️ `refCode: null` ŞARTI: iki eşzamanlı istek aynı oyuncuya iki
      // farklı kod yazamaz — ilki geçer, ikincisi 0 satır günceller.
      const hit = await prisma.player.updateMany({
        where: { wallet, refCode: null }, data: { refCode: kod },
      });
      if (hit.count > 0) return kod;
      // Araya giren istek kodu yazmış olabilir — okuyup dön
      const tekrar = await prisma.player.findUnique({
        where: { wallet }, select: { refCode: true },
      });
      if (tekrar?.refCode) return tekrar.refCode;
    } catch {
      // benzersiz kısıt çakışması — yeni kod dene
    }
  }
  throw new ReferralError('kod_uretilemedi', 500);
}

export interface ReferralView {
  code: string;
  /** kaç kişi bu kodla geldi */
  invited: number;
  /** kaçı ödülü açtı (derinliğe indi) */
  rewarded: number;
  /** bu oyuncu kimin koduyla geldi (kısaltılmış) — yoksa null */
  joinedWith: string | null;
  /** kod girme hakkı hâlâ açık mı */
  canEnter: boolean;
  rewardDust: number;
  rewardDepth: number;
  cap: number;
}

export async function referralDurum(wallet: string, now = new Date()): Promise<ReferralView> {
  const [kod, p, davetliler] = await Promise.all([
    kodumu(wallet),
    prisma.player.findUnique({
      where: { wallet }, select: { referredBy: true, createdAt: true },
    }),
    prisma.player.findMany({
      where: { referredBy: wallet },
      select: { refRewarded: true },
    }),
  ]);
  const yas = p ? (now.getTime() - p.createdAt.getTime()) / 86_400_000 : 0;
  return {
    code: kod,
    invited: davetliler.length,
    rewarded: davetliler.filter((d) => d.refRewarded).length,
    joinedWith: p?.referredBy ? `${p.referredBy.slice(0, 4)}…${p.referredBy.slice(-4)}` : null,
    // ⚠️ Zaten kod girmişse ya da pencere kapandıysa alan gösterilmemeli:
    // tıklanınca hep hata veren bir kutu, bozuk bir kutudur.
    canEnter: !p?.referredBy && yas <= KOD_PENCERESI_GUN,
    rewardDust: ODUL_TOZ,
    rewardDepth: ODUL_DERINLIGI,
    cap: ODUL_TAVANI,
  };
}

/**
 * Kod gir — kimin daveti olduğunu BİR KEZ işaretle.
 *
 * ⚠️ ÖDÜL BURADA VERİLMİYOR. Sadece bağ kuruluyor; ödeme oyuncu gerçekten
 * oynayınca (`odulKontrol`) yapılıyor. Bu ayrım sistemin bel kemiği.
 */
export async function kodGir(wallet: string, hamKod: unknown, now = new Date()): Promise<void> {
  const kod = kodTemizle(hamKod);
  if (!kod) throw new ReferralError('gecersiz_kod');

  const ben = await prisma.player.findUnique({
    where: { wallet }, select: { referredBy: true, createdAt: true, refCode: true, banned: true },
  });
  if (!ben || ben.banned) throw new ReferralError('yasakli', 403);
  // ⚠️ BİR KEZ: davet bir başlangıç anıdır, sonradan değiştirilemez.
  if (ben.referredBy) throw new ReferralError('zaten_girildi');
  // ⚠️ KENDİ KODUN OLMAZ — en ucuz sömürü bu.
  if (ben.refCode === kod) throw new ReferralError('kendi_kodun');

  const yas = (now.getTime() - ben.createdAt.getTime()) / 86_400_000;
  /**
   * ⚠️ PENCERE ŞART. Olmadan, yıllardır oynayan iki oyuncu birbirinin
   * kodunu girip ödülü paylaşırdı — davet olmayan bir "davet".
   */
  if (yas > KOD_PENCERESI_GUN) throw new ReferralError('pencere_kapandi');

  const sahip = await prisma.player.findFirst({
    where: { refCode: kod }, select: { wallet: true, banned: true },
  });
  // ⚠️ "Yok" ile "banlı" AYNI cevap: aksi hâlde kod girişi, hangi
  // cüzdanların banlı olduğunu sorgulamanın aracı olurdu.
  if (!sahip || sahip.banned) throw new ReferralError('kod_bulunamadi', 404);
  if (sahip.wallet === wallet) throw new ReferralError('kendi_kodun');

  // ⚠️ Koşullu yazma: iki eşzamanlı istek iki farklı davetçi yazamaz.
  const hit = await prisma.player.updateMany({
    where: { wallet, referredBy: null }, data: { referredBy: sahip.wallet },
  });
  if (hit.count === 0) throw new ReferralError('zaten_girildi');
}

export interface OdulSonuc {
  /** ödül gerçekten verildi mi */
  odendi: boolean;
  /** davetçiye giden toz */
  toz: number;
}

/**
 * ⭐ ÖDÜL KAPISI — davet edilen oyuncu eşiği geçti mi.
 *
 * `/run/finish` her koşu kapanışında çağırıyor. Ucuz olmak ZORUNDA:
 * ödül zaten ödendiyse ya da davetçi yoksa tek bir alan okumasıyla çıkar.
 *
 * ⚠️ İKİ TARAF DA ALIR ama davetçinin TAVANI var. Davet edilenin ödülü
 * tavana bakmaz: onun tek bir daveti vardır ve o da bu.
 */
export async function odulKontrol(
  wallet: string, ulasilanDerinlik: number,
): Promise<OdulSonuc> {
  if (ulasilanDerinlik < ODUL_DERINLIGI) return { odendi: false, toz: 0 };

  const p = await prisma.player.findUnique({
    where: { wallet },
    select: { referredBy: true, refRewarded: true, banned: true },
  });
  if (!p || p.banned || !p.referredBy || p.refRewarded) return { odendi: false, toz: 0 };

  /**
   * ⚠️ TAVAN SAYIMI ÖDEMEDEN ÖNCE. Davetçi tavanı doldurduysa davet
   * edilen yine de ödülünü ALIR — onun suçu değil ve tavanı görmüyor bile.
   */
  const odenmis = await prisma.player.count({
    where: { referredBy: p.referredBy, refRewarded: true },
  });
  const davetciAlir = odenmis < ODUL_TAVANI;

  /**
   * 🔴 BAYRAK ÖNCE, ÖDEME SONRA — ve koşullu.
   *
   * `refRewarded: false` şartı olmadan iki eşzamanlı koşu kapanışı ödülü
   * İKİ KEZ ödeyebilirdi. Bayrağı önce yazmak, çökme hâlinde "işaretlendi
   * ama ödenmedi" bırakır; tersi "ödendi ama işaretlenmedi" bırakırdı ve
   * ikincisi sınırsız tekrarlanabilir bir musluktur.
   */
  const kilit = await prisma.player.updateMany({
    where: { wallet, refRewarded: false },
    data: { refRewarded: true },
  });
  if (kilit.count === 0) return { odendi: false, toz: 0 };

  await prisma.$transaction(async (tx) => {
    // ⚠️ ÖDÜL TOZ — gold DEĞİL. Gold'un tek kaynağı koşmaktır.
    await tx.player.update({
      where: { wallet }, data: { dust: { increment: ODUL_TOZ } },
    });
    if (davetciAlir) {
      await tx.player.update({
        where: { wallet: p.referredBy! }, data: { dust: { increment: ODUL_TOZ } },
      });
    }
  });

  return { odendi: true, toz: davetciAlir ? ODUL_TOZ : 0 };
}
