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

import { rpcCagir } from './rpc.js';

export class OdemeHatasi extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}

/** Hazine adresi — yapılandırılmadıysa SOL rayı tamamen KAPALI */
export function hazineAdresi(): string | null {
  const a = (process.env.TREASURY_ADDRESS ?? '').trim();
  return a.length >= 32 ? a : null;
}

/**
 * SOL rayı açık mı.
 *
 * ⚠️ İKİSİ BİRDEN GEREKİYOR: hazine adresi ve özel RPC. Genel uç sert hız
 * sınırlı; ödeme doğrulaması onun üstünde çalışırsa oyuncunun parası gider
 * ve doğrulama "RPC yanıt vermedi" diye düşer. Bu, olabilecek en kötü
 * hatadır — bu yüzden yapılandırma eksikse kapı hiç açılmıyor.
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
