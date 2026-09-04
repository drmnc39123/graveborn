// HOLD-TO-PLAY EŞİĞİ — $GRAVE tutmayan cüzdan TOKEN EKONOMİSİNE giremez.
//
// Kaynak karar `TOKEN.md` §4'te ve üç şartı var; üçü de burada:
//
//   1. ⚠️ ADET KODA GÖMÜLMEZ. Eşik `HOLD_MIN` ortam değişkeni. 1.000 adet
//      açılış günü 10 dolar, altı ay sonra 400 dolar olabilir; koda gömülü
//      bir adet eşiği sessizce bir duvara dönüşür. Dolar hedefine göre elle
//      ayarlanır ve deploy gerektirmez.
//
//   2. ⚠️ YUMUŞAK. Eşik OYUNA girişi DEĞİL, TOKEN ekonomisine girişi
//      kapatır. Demo, koşu, Forge, lonca, kasa, PvP — hepsi eşiksiz açık
//      kalır. Sert hold-to-play huniyi öldürüyor (BOMB Miner'da ölçüldü).
//
//   3. ⚠️ VARSAYILAN KAPALI. `TOKEN_MINT` ya da `HOLD_MIN` yoksa kapı
//      TAMAMEN açık. Beta boyunca hiçbir davranış değişmiyor; token günü
//      iki değişken yazılarak açılıyor.
//
// ⚠️ NEREYE UYGULANDIĞI DAR TUTULDU: yalnız `/market/list` ve
// `/market/buy` — yani gold'un $GRAVE ile el değiştirdiği iki uç. Kasa
// çekimi (`/crypt/claim`) ve lonca GOLD işlemleri BİLEREK dışarıda:
// onlar token'a dokunmuyor, oraya eşik koymak "oyuna girişi kapatma"
// yasağını dolambaçlı yoldan çiğnemek olurdu.

import { splBakiye } from './rpc.js';

/** Token'ın ondalık basamağı — SPL varsayılanı 9, mint'e göre değişebilir. */
function ondalik(): number {
  const n = Number(process.env.TOKEN_DECIMALS ?? 9);
  return Number.isInteger(n) && n >= 0 && n <= 18 ? n : 9;
}

/** İnsan okunur eşik (örn. "1000") → ham birim. 0/yok ise eşik KAPALI. */
export function esikHam(): bigint {
  const ham = (process.env.HOLD_MIN ?? '').trim();
  if (!ham) return 0n;
  // ⚠️ Kesirli eşik KABUL EDİLMİYOR. "0.5" gibi bir değer `BigInt()` ile
  // patlar; sessizce yuvarlamak da operatörün yazdığından farklı bir eşik
  // uygulamak olurdu. Geçersiz değer = eşik kapalı + log.
  if (!/^\d+$/.test(ham)) {
    console.error(`[hold] HOLD_MIN geçersiz ("${ham}") — tam sayı olmalı, eşik KAPALI sayıldı`);
    return 0n;
  }
  return BigInt(ham) * 10n ** BigInt(ondalik());
}

export function esikAcikMi(): boolean {
  return Boolean(process.env.TOKEN_MINT) && esikHam() > 0n;
}

export interface EsikSonuc {
  /** geçti mi — eşik kapalıysa her zaman true */
  ok: boolean;
  /** ham birimde gereken (eşik kapalıysa 0n) */
  gereken: bigint;
  /** ham birimde bulunan (okunamadıysa null) */
  bulunan: bigint | null;
  /** kapı neden bu sonucu verdi — log ve hata gövdesi için */
  sebep: 'kapali' | 'gecti' | 'yetersiz' | 'rpc_yok';
}

/**
 * Önbellek. RPC çağrısı her ilan denemesinde tekrarlanamaz: hem yavaş hem
 * de ücretli sağlayıcıda kota yakar.
 *
 * ⚠️ SÜRE ASİMETRİK ve bu bilinçli. GEÇEN sonuç uzun (2 dk) tutuluyor —
 * bakiyesi olan biri iki dakika daha var sayılırsa zarar yok. KALAN sonuç
 * kısa (20 sn) — token'ı yeni almış oyuncuyu iki dakika kapıda bekletmek,
 * tam da satın almayı yeni yapmış kişiyi cezalandırmak olurdu.
 */
const onbellek = new Map<string, { sonuc: EsikSonuc; bitis: number }>();
const GECTI_MS = 120_000;
const KALDI_MS = 20_000;

/** Test ve admin için — eşik ayarı değişince eski cevaplar yapışıp kalmasın */
export function esikOnbellegiTemizle() { onbellek.clear(); }

export async function esikKontrol(wallet: string): Promise<EsikSonuc> {
  const gereken = esikHam();
  const mint = process.env.TOKEN_MINT;
  if (!mint || gereken <= 0n) {
    return { ok: true, gereken: 0n, bulunan: null, sebep: 'kapali' };
  }

  const anahtar = `${wallet}|${mint}|${gereken}`;
  const onbellekli = onbellek.get(anahtar);
  if (onbellekli && onbellekli.bitis > Date.now()) return onbellekli.sonuc;

  let sonuc: EsikSonuc;
  try {
    const bulunan = await splBakiye(wallet, mint);
    sonuc = bulunan >= gereken
      ? { ok: true, gereken, bulunan, sebep: 'gecti' }
      : { ok: false, gereken, bulunan, sebep: 'yetersiz' };
  } catch (e) {
    /**
     * 🔴 RPC ULAŞILAMIYORSA KAPI AÇIK BIRAKILIYOR — ve bu, `auth.ts`teki
     * Turnstile kararının TERSİ. Fark bilerek:
     *
     * Turnstile ulaşılamazken kapı KAPANIYOR, çünkü orada yanlış yön
     * "sınırsız bot hesabı" demek ve saldırganın maliyeti sıfır.
     * Burada yanlış yön "token'ı olan HERKESİN ekonomisi kapandı" demek:
     * sağlayıcının bir dakikalık kesintisi, parasını ödemiş oyuncuyu
     * dışarıda bırakır. Ters yöndeki kötüye kullanım ise sınırlı ve GERİ
     * ALINABİLİR (ilan iptal edilebilir, hesap banlanabilir).
     *
     * Yine de bu bir tercih, dogma değil: `HOLD_FAIL_CLOSED=1` ile
     * kesintide kapı kapatılabilir.
     */
    const kapat = process.env.HOLD_FAIL_CLOSED === '1';
    console.error(`[hold] bakiye okunamadı (${wallet}): ${String(e)} — kapı ${kapat ? 'KAPALI' : 'AÇIK'}`);
    sonuc = { ok: !kapat, gereken, bulunan: null, sebep: 'rpc_yok' };
  }

  onbellek.set(anahtar, { sonuc, bitis: Date.now() + (sonuc.ok ? GECTI_MS : KALDI_MS) });
  return sonuc;
}

/** İnsan okunur eşik metni — hata gövdesinde oyuncuya gösterilir. */
export function esikMetni(): string {
  const b = 10n ** BigInt(ondalik());
  return (esikHam() / b).toString();
}
