// SOL ÖDEME DOĞRULAMA — hazineye gerçekten para geldi mi.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 BU DOSYADAKİ HER KONTROL BİR OLAYDAN GELİYOR.
//
// Kardeş projede (Ghost Hunter) tam bu doğrulama eksikti: sunucu işlemin
// PARSED INSTRUCTION'ına bakıp "ödendi" diyordu. Oyuncu 0,0009 SOL'la
// 0,3 SOL gönderecek bir işlem kuruyordu — işlem ZİNCİRDE BAŞARISIZ
// oluyor ama İMZA yine de üretiliyordu. İki hesap böyle 42 SOL değerinde
// sandık açtı ve banlandı.
//
// Ders tek cümle: **BAŞARISIZ BİR İŞLEM DE İMZA ÜRETİR.**
// ══════════════════════════════════════════════════════════════════════
//
// ⚠️ NİYE `@solana/web3.js` YOK: `rpc.ts`in gerekçesinin aynısı — burada
// ihtiyacımız olan tek şey bir `getTransaction` çağrısı ve iki dizi
// karşılaştırması. Kütüphane 3 MB bağımlılık getirirdi.

import bs58 from 'bs58';
import { rpcCagir } from './rpc.js';

export class OdemeHatasi extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/**
 * Bir metin geçerli bir Solana adresi mi — base58 çözülüp TAM 32 bayt mı.
 *
 * 🔴 NİYE UZUNLUK YETMİYOR: eski sürüm yalnız `length >= 32` bakıyordu.
 * Base58 alfabesinde olmayan bir karakter (0, O, I, l) ya da eksik/fazla
 * hane o kontrolden GEÇİYORDU ve gerçek para bizim olmayan bir adrese
 * gidiyordu — sessizce, hiçbir hata üretmeden.
 *
 * ⚠️ BU KONTROL YAZIM HATALARINI TAM YAKALAMAZ ve yakaladığını iddia
 * etmiyor: tek harfi değişmiş bir adres de çoğu zaman 32 bayta çözülür.
 * Eğri (`isOnCurve`) kontrolü onun ancak yarısını ekler ve elle yazılacak
 * alan matematiği kazandırdığından fazla risk taşır.
 * ASIL KORUMA GÖRÜNÜRLÜK: adres açılışta loglanıyor ve `/sol/config` ile
 * yayınlanıyor — yanlışsa ilk gün GÖZLE yakalanır.
 */
export function gecerliAdres(a: unknown): a is string {
  if (typeof a !== 'string') return false;
  const t = a.trim();
  if (t.length < 32 || t.length > 44) return false;
  let bayt: Uint8Array;
  try { bayt = bs58.decode(t); } catch { return false; }
  if (bayt.length !== 32) return false;
  /**
   * ⚠️ SIFIR ADRES REDDEDILIYOR. Base58'de '1' sifir demek, yani
   * "11111111111111111111111111111111" TAM 32 bayta cozuluyor ve bicim
   * kontrolunden GECIYOR — ama o adres System Program'in kendisi. Yanlis
   * yapilandirmada oraya giden SOL geri alinamaz.
   * (Bu kontrol testte yakalandi: '1'.repeat(32) gecerli sayiliyordu.)
   */
  if (bayt.every((b) => b === 0)) return false;
  return true;
}

/** ⚠️ Bir kez uyar, her istekte değil — log gürültüsü uyarıyı görünmez yapar */
let bozukUyarildi = false;

/** Hazine adresi — yapılandırılmadıysa ya da BOZUKSA SOL rayı tamamen KAPALI */
export function hazineAdresi(): string | null {
  const a = (process.env.TREASURY_ADDRESS ?? '').trim();
  if (!a) return null;
  if (!gecerliAdres(a)) {
    if (!bozukUyarildi) {
      bozukUyarildi = true;
      // ⚠️ Sessizce `null` dönmek "yapılandırılmamış" ile "yanlış girilmiş"i
      // aynı şeye çevirirdi; ikincisi acil bir operatör hatası.
      console.error('[HAZINE] TREASURY_ADDRESS gecersiz — SOL rayi KAPALI tutuluyor:', a);
    }
    return null;
  }
  return a;
}

/**
 * SOL rayı açık mı.
 *
 * ⚠️ İKİSİ BİRDEN GEREKİYOR: hazine adresi ve en az bir RPC ucu.
 *
 * ⚠️ ÖZEL SAĞLAYICI ŞART DEĞİL — ölçüldü (2026-09-09). Bir satın alma
 * ~2-4 RPC çağrısı ediyor (1 blockhash + 1 getTransaction, artı olası
 * tekrar) ve genel uçların sınırları bunun çok üzerinde. Asıl risk hız
 * sınırı değil KESİNTİ; onu da üç ucun cezalı yedeklemesi (`rpc.ts`) ve
 * ödeme kurtarma (imza cihazda saklanıyor, `lib/solPay.ts`) karşılıyor.
 * Önceki yorum "genel uç yetersiz" diyordu; o hüküm ölçülmeden verilmişti.
 *
 * Yapılandırma HİÇ yoksa kapı yine de açılmıyor: doğrulayamadığımız bir
 * ödemeyi kabul etmek, olabilecek en kötü hatadır.
 */
export function solRayiAcik(): boolean {
  return hazineAdresi() !== null && (process.env.RPC_URLS ?? '').trim().length > 0;
}

/** İşlemin kabul edileceği en büyük yaş — saniye */
export const MAX_YAS_SN = 30 * 60;

interface TxYanit {
  meta: {
    err: unknown;
    preBalances: number[];
    postBalances: number[];
  } | null;
  transaction: {
    message: {
      accountKeys: ({ pubkey: string; signer?: boolean } | string)[];
    };
  };
  blockTime?: number | null;
}

function anahtar(k: { pubkey: string } | string): string {
  return typeof k === 'string' ? k : k.pubkey;
}

export interface OdemeSonuc {
  /** hazineye GERÇEKTEN giren lamport */
  lamports: number;
  /** işlemi imzalayan (ödeyen) */
  payer: string;
}

/**
 * Bir imzayı doğrula: hazineye en az `beklenen` lamport girdi mi.
 *
 * ⚠️ BURASI YALNIZ ZİNCİRİ OKUR. İmzanın TEK KULLANIMLIK olması çağıranın
 * işi ve VERİTABANI seviyesinde (`Payment.sig @unique`) yapılmalı —
 * uygulama kodu yarışır, benzersiz indeks yarışmaz.
 */
export async function odemeDogrula(
  sig: unknown, wallet: string, beklenen: number, now = Date.now(),
): Promise<OdemeSonuc> {
  const hazine = hazineAdresi();
  if (!hazine) throw new OdemeHatasi('sol_kapali', 503);
  if (typeof sig !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(sig)) {
    throw new OdemeHatasi('gecersiz_imza');
  }
  if (!Number.isFinite(beklenen) || beklenen <= 0) throw new OdemeHatasi('gecersiz_tutar');

  const tx = await rpcCagir<TxYanit | null>('getTransaction', [
    sig,
    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  ]);
  // ⚠️ `null` = işlem HENÜZ görülmedi. "Yok" demek değil; oyuncu birkaç
  // saniye sonra tekrar denemeli, o yüzden ayrı bir kod dönüyor.
  if (!tx || !tx.meta) throw new OdemeHatasi('islem_bulunamadi', 409);

  /**
   * 🔴 1. BAŞARISIZ İŞLEM REDDEDİLİYOR. Ghost Hunter'da 42 SOL'luk sahte
   * alım tam olarak buradan geçti: imza vardı, işlem zincirde FAIL'di.
   */
  if (tx.meta.err !== null && tx.meta.err !== undefined) {
    throw new OdemeHatasi('islem_basarisiz');
  }

  const anahtarlar = (tx.transaction?.message?.accountKeys ?? []).map(anahtar);
  const hazineIdx = anahtarlar.indexOf(hazine);
  if (hazineIdx < 0) throw new OdemeHatasi('hazine_yok');

  /**
   * 🔴 2. BAKİYE DEĞİŞİMİ — parsed instruction DEĞİL.
   *
   * Instruction "ne yapılmak istendiği"ni söyler; `pre/postBalances` ne
   * OLDUĞUNU söyler. İkisi ayrışabilir ve tam olarak sömürülen fark budur.
   * Ayrıca bu yöntem işlemin kaç transfer içerdiğini, iç işlem (CPI) olup
   * olmadığını umursamaz — hazinenin cebine giren neti ölçer.
   */
  const pre = tx.meta.preBalances?.[hazineIdx];
  const post = tx.meta.postBalances?.[hazineIdx];
  if (typeof pre !== 'number' || typeof post !== 'number') {
    throw new OdemeHatasi('bakiye_okunamadi');
  }
  const giren = post - pre;
  if (giren < beklenen) throw new OdemeHatasi('tutar_yetersiz');

  /**
   * 🔴 3. ÖDEYEN, OTURUMU AÇAN OYUNCU OLMALI.
   *
   * Olmasaydı biri BAŞKASININ işlemini kendi hesabına saydırabilirdi:
   * zincirde geçerli, tek kullanımlık kontrolünden de geçer (o imza ilk
   * kez kullanılıyor), ve parayı ödeyen kişi ürününü ALAMAZ.
   * İmzalayan = ilk hesap (Solana'da fee payer her zaman 0. anahtar).
   */
  const payer = anahtarlar[0];
  if (!payer || payer !== wallet) throw new OdemeHatasi('odeyen_farkli');

  /**
   * ⚠️ 4. YAŞ SINIRI. Olmadan, oyuncunun aylar önce hazineye yaptığı
   * herhangi bir transfer (ya da bir bağış) bugün bir ürüne çevrilebilirdi.
   * `blockTime` yoksa reddetmiyoruz — eski işlemlerde alan boş olabilir ve
   * asıl korumamız zaten tek kullanımlık imza; ama varsa uygulanıyor.
   */
  if (typeof tx.blockTime === 'number') {
    const yas = now / 1000 - tx.blockTime;
    if (yas > MAX_YAS_SN) throw new OdemeHatasi('islem_cok_eski');
    // ⚠️ Gelecekten gelen blockTime saat kaymasıdır, sahtekârlık değil —
    // küçük bir tolerans bırakıp reddetmiyoruz.
  }

  return { lamports: giren, payer };
}
