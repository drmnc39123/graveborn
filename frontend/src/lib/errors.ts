// SUNUCU HATA KODU → OYUNCUNUN OKUYACAĞI CÜMLE.
//
// 🔴 NİYE VAR: sunucunun İÇ KODLARI ekranda ham görünüyordu. Oyuncu köyde
// kırmızı bir kutuda "oturum_yok" yazısı görüyordu — hem TÜRKÇE hem de
// bir hata kimliği. Depo kuralı net: oyuncuya giden metin İNGİLİZCE, kod
// yorumları Türkçe. Kod kimliği geliştiricinin işi.
//
// ⚠️ TEK KAYNAK. `MarketPanel` kendi küçük çeviri tablosunu yazmıştı ve
// yalnız 4 kodu kapsıyordu; geri kalan her panel ham kod basıyordu. Bu
// depoda aynı sınıf bir hata pahalıya mal oldu (`smartPick` üç ayrı
// yerde, ikisi bozuk). Yeni bir tablo YAZMA — buraya ekle.
//
// ⚠️ BİLİNMEYEN KOD SESSİZCE YUTULMAZ ama ham da GÖSTERİLMEZ: genel bir
// cümle döner ve kod konsola yazılır. Oyuncuya anlamsız bir kimlik
// göstermek, ona çözemeyeceği bir sorunu okutmaktır.

/**
 * ⚠️ SUNUCUDAKİ HER KOD BURADA OLMALI. Liste `backend/src/*.ts` içindeki
 * `error: '...'` dizelerinden çıkarıldı (40 kod). Sunucuya yeni bir kod
 * eklenirse buraya da eklenmeli.
 */
const METIN: Record<string, string> = {
  // ── oturum / kimlik ──
  oturum_yok: 'Sign in with your wallet first.',
  token_yok: 'Your session expired — sign in again.',
  yetkisiz: 'You are not allowed to do that.',
  yasakli: 'This account is banned.',
  imza_dogrulanamadi: 'Signature could not be verified. Try signing in again.',
  gecersiz_cuzdan: 'That wallet address is not valid.',
  bot_kontrolu_basarisiz: 'The bot check failed. Reload and try again.',
  admin_kapali: 'The admin panel is disabled on this server.',

  // ── koşu ──
  kosu_yok: 'That run no longer exists.',
  baslatilamaz: 'This run cannot be started yet.',
  kosu_zaman_asimi: 'That run took too long and was closed.',
  zaten_kapatildi: 'That run was already finished.',
  boss_devrildi: 'This week’s boss is already down.',
  // ⚠️ Bakım mesajı özel: sunucu ayrıca `notice` alanı döndürüyor ve
  // arayüz onu gösterebiliyor. Buradaki cümle yedek.
  bakim: 'The game is in maintenance — no new runs right now.',

  // ── ekonomi / satın alma ──
  yetersiz_gold: 'Not enough gold.',
  slot_dolu: 'No free slot — remove something first.',
  zaten_max: 'That is already at maximum.',
  yukseltilemedi: 'That could not be upgraded.',
  cekilis_yok: 'No pull is available.',
  bahis_kurulamadi: 'That wager could not be placed.',
  bakiye_negatife_duserdi: 'That would take the balance below zero.',
  // ⚠️ Hold-to-play eşiği. Sunucu ayrıca `need` alanında gereken adedi
  // döndürüyor; panel onu gösterebilir, buradaki cümle yedek.
  esik_yetersiz: 'You need to hold $GRAVE in your wallet to trade on the market.',

  // ── 🔴 SINIFLA FIRLATILAN KODLAR — bu 13'ü TABLOYA HİÇ GİRMEMİŞTİ.
  // Ölçüldü (`errors.test`): kodlar oyuncuya üç yoldan gidiyor ve tablo
  // yalnız birincisini (`res.json({ error: '...' })`) kapsıyordu. Sınıfla
  // fırlatılanlar (`throw new QuestError('tavan')`) ve `reason` dönenler
  // ekranda HAM TÜRKÇE KİMLİK olarak görünüyordu — tam da bu dosyanın
  // önlemek için yazıldığı şey.
  bonus_hazir_degil: 'That bonus is not ready yet.',
  bugunun_gorevi_degil: 'That is not one of today’s quests.',
  gecersiz_gorev: 'That quest does not exist.',
  tamamlanmadi: 'That quest is not finished yet.',
  deed_yok: 'You do not own a Crypt Deed.',
  bu_hafta_alindi: 'You already claimed this week.',
  gecersiz_kayit: 'That duel record does not exist.',
  kendini_takip: 'You cannot follow yourself.',
  talep_yok: 'That ticket does not exist.',
  senin_talebin_degil: 'That ticket is not yours.',
  takilamadi: 'That could not be equipped.',
  tavan: 'That is already at its maximum level.',
  // ⚠️ İki istek aynı satırı aynı anda değiştirdi. Tekrar denemek çözer —
  // "bir şeyler ters gitti" demek oyuncuya ne yapacağını söylemezdi.
  yaris: 'Something changed while you were doing that — try again.',

  // ── yalnız ADMIN panelinde görünür ──
  // ⚠️ Oyuncuya asla gitmez ama yine de eşlendi: mühür (`errors.test`)
  // istisna listesi tutmuyor. İstisna listesi tutan mühürler, listeye bir
  // kod eklenerek sessizce etkisizleştirilebilir.
  bakim_kapali: 'Turn maintenance on before running this.',
  onay_hatali: 'The confirmation text does not match.',

  // ── geçersiz girdi ──
  gecersiz_istek: 'Something in that request was wrong.',
  gecersiz_id: 'That item does not exist.',
  gecersiz_karakter: 'That character does not exist.',
  // ⚠️ Sunucu ayrıca `need` alanında şartı döndürüyor; kart onu gösterir.
  kahraman_kilitli: 'That character is still locked.',
  // ⚠️ Hak BAŞLATINCA yanıyor, bitirince değil — mesaj bunu ima etmeli.
  gunluk_bitti: 'You have already used today’s daily descent. Come back after 00:00 UTC.',
  gecersiz_tilsim: 'That charm does not exist.',
  bilinmeyen_tilsim: 'That charm does not exist.',
  gecersiz_yukseltme: 'That upgrade does not exist.',
  bilinmeyen_yukseltme: 'That upgrade does not exist.',
  gecersiz_lonca: 'That guild does not exist.',
  oyuncu_yok: 'No such player.',

  // ── yarış / sistem ──
  es_zamanli_degisim: 'Something changed while you were doing that — try again.',
  cok_fazla_istek: 'Too many requests. Wait a moment.',
  internal: 'Something broke on our side. Try again in a moment.',
  alinamadi: 'That could not be loaded.',

  // ── market ──
  // ⚠️ `MarketPanel` bunların bir kısmını PARAMETRELİ olarak kendi
  // sözlüğünde eziyor ("Minimum listing is 500 gold") ve orası doğru yer:
  // sayı panelin kendi ayarından geliyor. Buradakiler yedek.
  gecersiz_miktar: 'That amount is not valid.',
  gecersiz_fiyat: 'Set a price above zero.',
  ilan_siniri: 'You already have the maximum number of listings.',
  ilan_yok: 'That listing is no longer active.',
  gecersiz_liste: 'That listing is not valid.',
  gecersiz_islem: 'That transaction is not valid.',

  // ── ekipman / pet ──
  gecersiz_parca: 'That item does not exist.',
  parca_yok: 'You do not have that item.',
  gecersiz_yuva: 'That slot is not valid.',
  gecersiz_pet: 'That companion does not exist.',
  bagli_degil: 'You have not bound that companion yet.',
  max_kopya: 'You already hold the maximum copies.',
  sadece_legendary: 'Only legendary companions can be fused.',
  zaten_mythic: 'That companion is already mythic.',
  en_ust_kademe: 'That is already at the highest tier.',
  gold_yetersiz: 'Not enough gold.',
  bos_secim: 'Nothing selected.',
  cok_fazla: 'Too many.',
  cok_kucuk: 'Too small.',

  // ── lonca ──
  lonca_yok: 'That guild does not exist.',
  lonca_dolu: 'That guild is full.',
  loncada_degil: 'You are not in a guild.',
  zaten_loncada: 'You are already in a guild.',
  sadece_kurucu: 'Only the founder can do that.',
  etiket_kullanimda: 'That tag is taken.',
  hazine_yetersiz: 'The guild treasury is short.',

  // ── kasa / düello / diğer ──
  kasa_bos: 'The vault is empty.',
  kasa_yetersiz: 'The vault is short.',
  kayit_yok: 'No record found.',
  rakip_yasakli: 'That opponent is not available.',
  zaten_alindi: 'You already claimed that.',
  zaten_acik: 'That is already open.',

  // ── yalnız admin panelinde görünenler ──
  // ⚠️ Bunlar oyuncuya ULAŞMAZ ama panel de ham kod göstermemeli.
  gecersiz_bakim: 'Invalid maintenance value.',
  gecersiz_duyuru: 'Invalid notice text.',
  sebep_zorunlu: 'A reason is required.',
  tam_sayi_olmali: 'Must be a whole number.',
  tavan_asildi: 'That is over the allowed limit.',
  bos_verme: 'Nothing to grant.',
};

const GENEL = 'Something went wrong. Try again in a moment.';

/**
 * TEK KOD → cümle. `ApiError` bunu kurucusunda çağırıyor, yani hata
 * nesnesinin `message`'ı zaten oyuncunun okuyacağı cümle oluyor ve
 * ekrandaki 23 `e.message` çağrısının HİÇBİRİNE dokunmak gerekmiyor.
 */
export function kodMetni(kod: string): string {
  const bulunan = METIN[kod];
  if (bulunan) return bulunan;
  // ⚠️ Bilinmeyen kod: oyuncuya genel cümle, geliştiriciye konsol.
  // Ham kodu ekrana basmak, oyuncuya çözemeyeceği bir kimlik okutmaktır.
  if (kod && /^[a-z_0-9]+$/.test(kod)) {
    console.warn('[hata] çevirisi olmayan sunucu kodu:', kod);
    return GENEL;
  }
  // Zaten insan cümlesiyse (ağ hatası vb.) olduğu gibi geçir.
  return kod || GENEL;
}

/**
 * Herhangi bir yakalanmış değeri cümleye çevir.
 *
 * ⚠️ `ApiError` mesajı eskiden "401 oturum_yok" biçimindeydi; eski
 * kayıtlarla da uyumlu kalsın diye son parça da deneniyor.
 */
export function hataMetni(hata: unknown): string {
  const ham = hata instanceof Error ? hata.message : String(hata ?? '');
  const kod = (hata as { code?: string } | null)?.code ?? '';
  if (kod) return kodMetni(kod);
  if (METIN[ham]) return METIN[ham];
  const son = ham.split(' ').pop() ?? '';
  if (METIN[son]) return METIN[son];
  return ham || GENEL;
}
