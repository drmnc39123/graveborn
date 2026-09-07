// SOL ÖDEMESİ — istemci tarafı.
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 AKIŞTA İMZA MESAJI YOK. Cüzdan TEK BİR ŞEY soruyor: düz bir SOL
// transferi. Araya bir `signMessage` adımı koymak (ör. "ödemeyi onayla"
// diye bir metin imzalatmak) cüzdanların şüpheli site uyarısını tetikliyor
// ve oyuncu tam ödeme anında korkup çıkıyor. Herkesin yaptığı gibi
// doğrudan transfer aşamasına geçiliyor.
//
// ⚠️ BU BİR GÜVENLİK ZAAFI DEĞİL. Kim olduğumuz zaten OTURUM JETONUYLA
// belli (giriş anında bir kez imzalandı); ödemenin kime ait olduğunu ise
// sunucu ZİNCİRDEN okuyor — `solPay.ts` işlemin fee payer'ının oturumu
// açan cüzdan olmasını şart koşuyor. Yani ek bir imza hiçbir şey
// kanıtlamazdı, sadece bir uyarı ekranı üretirdi.
// ══════════════════════════════════════════════════════════════════════
//
// ⚠️ `signAndSendTransaction` KULLANILIYOR, `signTransaction` DEĞİL:
// ikincisinde imzalı işlemi zincire biz yollarız ve "cüzdan imzaladı ama
// yayın düştü" durumu oyuncunun parasını belirsiz bırakır.
//
// ⚠️ BLOCKHASH SUNUCUDAN GELİYOR. Tarayıcıdan doğrudan RPC çağırmak (a)
// özel sağlayıcı anahtarını herkese açardı, (b) genel uç hız sınırlıdır ve
// tam ödeme anında düşerdi.

import type { Cuzdan } from '@/lib/wallets';

export class SolOdemeHatasi extends Error {
  constructor(public code: string, mesaj?: string) { super(mesaj ?? code); }
}

/** Sunucunun bildirdiği ray durumu */
export interface SolConfig {
  /** ray açık mı — hazine adresi + özel RPC ikisi de gerekiyor */
  open: boolean;
  /** hazine adresi (kapalıysa null) */
  treasury: string | null;
}

/**
 * Bir SOL ödemesi yap ve zincir imzasını dön.
 *
 * Adımlar — üçü de tek bir cüzdan onayına iniyor:
 *   1. sunucudan hazine adresi + taze blockhash
 *   2. transfer işlemini kur
 *   3. cüzdan imzalayıp GÖNDERİYOR → zincir imzası
 *
 * ⚠️ Dönen imza TEK BAŞINA bir şey satın almaz; ürün ucu onu ayrıca
 * zincirden doğrular (`backend/solPay.ts`) ve tek kullanımlık olarak
 * kaydeder.
 */
export async function solOde(
  cuzdan: Cuzdan, odeyen: string, lamports: number,
  cfg: { treasury: string; blockhash: string },
): Promise<string> {
  if (!cuzdan.odemeGonder) throw new SolOdemeHatasi('cuzdan_odeme_desteklemiyor');
  if (!Number.isFinite(lamports) || lamports <= 0) throw new SolOdemeHatasi('gecersiz_tutar');

  /**
   * ⚠️ DİNAMİK IMPORT: `@solana/web3.js` 3 MB. Oyuncuların çoğu hiç SOL
   * ödemesi yapmayacak; açılış paketine koymak herkesin yüklemesini
   * ağırlaştırırdı. `rpc.ts`in kütüphaneyi hiç almama gerekçesi burada
   * geçerli değil — işlem KURMAK iki JSON-RPC çağrısından başka bir iş.
   */
  const { PublicKey, SystemProgram, Transaction } = await import('@solana/web3.js');

  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: new PublicKey(odeyen),
    toPubkey: new PublicKey(cfg.treasury),
    lamports: Math.round(lamports),
  }));
  tx.feePayer = new PublicKey(odeyen);
  tx.recentBlockhash = cfg.blockhash;

  /**
   * ⚠️ `requireAllSignatures: false` ŞART: işlem henüz imzasız ve
   * varsayılan serileştirme imza eksikliğinde HATA FIRLATIR. Cüzdan
   * imzayı kendisi ekleyecek.
   */
  const baytlar = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return cuzdan.odemeGonder(new Uint8Array(baytlar));
}

/**
 * TAM AKIŞ — bir ürünü SOL ile satın al.
 *
 * ⚠️ TEK CÜZDAN ONAYI: sunucudan fiyat ve blockhash alınır, işlem kurulur,
 * cüzdan imzalayıp gönderir, imza sunucuya verilir. Arada hiçbir yerde
 * `signMessage` YOK (bkz. dosya başlığı).
 *
 * ⚠️ SIRA ÖNEMLİ: `/sol/quote` ÖNCE çağrılıyor. "Zaten loncada",
 * "yükseltilemez", "yasaklı" gibi red sebepleri oyuncu parayı GÖNDERMEDEN
 * önce söylenmeli; parayı alıp ürün verememek en pahalı hatadır.
 */
export async function solIleAl<T>(
  urun: 'reliquary10' | 'ossuary' | 'guild' | 'guild_up',
  redeem: (sig: string) => Promise<T>,
  ek?: Record<string, unknown>,
): Promise<T> {
  const { api } = await import('@/lib/session');
  const { getWalletId, getWallet } = await import('@/lib/session');

  const teklif = await api<{ lamports: number | null }>('/sol/quote', {
    method: 'POST', body: { product: urun, ...ek },
  });
  if (!teklif.lamports) throw new SolOdemeHatasi('sol_rayinda_degil');

  const cfg = await api<SolConfig>('/sol/config');
  if (!cfg.open || !cfg.treasury) throw new SolOdemeHatasi('sol_kapali');

  /**
   * ⚠️ CÜZDAN KİMLİKTEN YENİDEN BULUNUYOR, saklanmış bir nesneden değil:
   * eklenti yeniden yüklendiğinde eski nesne ölü kalırdı.
   */
  const { bulunanCuzdanlar } = await import('@/lib/wallets');
  const id = getWalletId();
  const adres = getWallet();
  const cuzdan = bulunanCuzdanlar().find((c) => c.id === id)
    // ⚠️ Kimlik tutmuyorsa (eklenti güncellendi, ad değişti) ödeme
    // yapabilen ilk cüzdana düşülüyor — oyuncuyu çıkışa zorlamaktansa.
    ?? bulunanCuzdanlar().find((c) => !!c.odemeGonder);
  if (!cuzdan || !adres) throw new SolOdemeHatasi('cuzdan_bulunamadi');
  if (!cuzdan.odemeGonder) throw new SolOdemeHatasi('cuzdan_odeme_desteklemiyor');

  // ⚠️ Sessiz yeniden bağlanma: cüzdan zaten güveniyorsa ekran açılmaz.
  await cuzdan.baglan();

  const { blockhash } = await api<{ blockhash: string }>('/sol/blockhash');
  const sig = await solOde(cuzdan, adres, teklif.lamports, { treasury: cfg.treasury, blockhash });
  return redeem(sig);
}
