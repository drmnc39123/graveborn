// MİNİ İKON SÖZLÜĞÜ — saf veri, React YOK.
//
// ⚠️ NİYE AYRI DOSYA: `kit.tsx` bir istemci bileşeni ('use client' + JSX) ve
// node testinden içe aktarılamaz. Eşleme orada kalsaydı "ikon dosyası
// gerçekten var mı" sorusu TEST EDİLEMEZDİ — ve o soru bu projede bir kez
// pahalıya patladı: yanlış dosya adı → 404 → çizim sessizce başarısız →
// kimse sebebini anlamıyor. Projenin kendi ayrımı (`combatArt.ts` veri,
// `sprites.ts` çizim) burada da geçerli.
//
// ⚠️ İSİMLER ANLAMLA VERİLDİ, DOSYA NUMARASIYLA DEĞİL. `Icon_05` yazmak,
// altı ay sonra "05 neydi" sorusunu ve tek tek dosya açmayı garantiler.
// Eşleme kontakt sayfası ÜRETİLİP GÖZLE OKUNARAK yapıldı, tahminle değil —
// bu projede sprite'ı adına göre yargılamak daha önce yanılttı.

export const ICON_DIR = '/art/ui/kit/Mini-icons';

/**
 * 🔴 `Icon_30` HARİTADAN BİLEREK ÇIKARILDI — ve bu bir marka logosu yüzünden.
 *
 * KULLANICI BİLDİRİMİ (ilk tur): *"Charms tarafında bir skill seçtiğim kutuda
 * resmen Facebook işareti var… tekrar doğma, yani revival işareti olabilir."*
 * O turda yalnız koşu içindeki taslak kartının ikonu (`combatArt.ts` burial)
 * değiştirilmişti ve "düzeldi" denmişti — EKSİKTİ. Kontakt sayfası 32 ikonun
 * tamamıyla yeniden üretilip GÖZLE okununca (2026-09-15) asıl kaynak çıktı:
 * `Icon_30` "sigil" adıyla eşlenmişti ama çizimi mavi bir dairede beyaz
 * **"f" — düpedüz Facebook logosu.** `revival` stat'ı ona bağlıydı ve logo
 * BEŞ yerde görünüyordu: Forge "Second Burial", Pedlar's Stall "Grave
 * Offering" tılsımı (kullanıcının gördüğü yer), beceri ağacı, kahraman
 * seçimi, koşu içi diriliş sayacı.
 *
 * ⚠️ YENİDEN ADLANDIRILMADI, SİLİNDİ: ad ne olursa olsun çizim bir logo.
 * Anahtar yokken `<Icon name="sigil">` yazmak TİP HATASI veriyor — yani bir
 * dahaki dosya bu logoyu derlemeden geçiremez. Mühür: `guards.test` [8].
 *
 * ⚠️ AYNI SAYFADA DİKKAT İSTEYEN ÜÇ İKON DAHA VAR (değiştirilmedi, kullanıcıya
 * bildirildi): `target` (31) pembe iç içe kareler, `voidMark` (32) koyu
 * dairede X, `tome` (22) disket gibi. Bu kit bir "uygulama" ikon paketi; adı
 * değil çizimi yargıla.
 */
export const ICON = {
  star: '01', starOff: '02', health: '03', healthOff: '04',
  gold: '05', skull: '06', alert: '07', unknown: '08',
  damage: '09', armor: '10', speed: '11', garb: '12',
  magic: '13', heal: '14', urn: '15', gem: '16',
  potion: '17', magnet: '18', rosette: '19', note: '20',
  sound: '21', tome: '22', feather: '23', mallet: '24',
  keySilver: '25', keyGold: '26', flaskGreen: '27', flaskTeal: '28',
  flaskRed: '29', target: '31', voidMark: '32',
} as const;

export type IconName = keyof typeof ICON;

/** İkonun dosya yolu. `dim` paketin kendi dış-hat çizimini kullanır. */
export function iconSrc(name: IconName, dim = false): string {
  return `${ICON_DIR}/Icon_${ICON[name]}${dim ? '_Outline' : ''}.png`;
}

/**
 * STAT → İKON.
 *
 * ⚠️ TEK YERDE DURMAK ZORUNDA. Aynı stat Forge'da, pasif kartında, tılsımda
 * ve ekipmanda görünüyor; her panelin kendi eşlemesini yazması "aynı şey dört
 * panelde dört farklı ikon" demekti ve bu, ikon eklemenin amacını (tanıma)
 * tam tersine çevirirdi.
 *
 * ⚠️ İKİ STAT AYNI İKONU PAYLAŞABİLİR ve bu kasıtlı: `crit` ile `critMul`
 * oyuncu için TEK kavram (kritik vuruş), ikisini ayrı resimle göstermek
 * olmayan bir ayrımı varmış gibi gösterirdi.
 */
export const STAT_ICON: Record<string, IconName> = {
  might: 'damage',
  armor: 'armor',
  maxHp: 'health',
  recovery: 'flaskRed',
  cooldown: 'rosette',
  area: 'target',
  // ⚠️ Tüy `projSpeed` için — 23 numaralı ikon bir OK TÜYÜ. Hızı değil
  // MERMİYİ anlatıyor; `moveSpeed`e çizme (11) gidiyor, ikisi karışmasın.
  projSpeed: 'feather',
  duration: 'potion',
  amount: 'gem',
  moveSpeed: 'speed',
  magnet: 'magnet',
  greed: 'gold',
  growth: 'tome',
  curse: 'voidMark',
  // ⚠️ URN (cenaze urnası), sigil DEĞİL — bkz. `ICON` başlığı: 30 numara bir
  // Facebook logosu. Urn "Second Burial" ve "Grave Offering" adlarının ta kendisi.
  revival: 'urn',
  crit: 'star',
  critMul: 'star',
};

/** Bir stat'ın ikonu — bilinmeyen stat sessizce soru işaretine düşer */
export function statIcon(stat: string): IconName {
  return STAT_ICON[stat] ?? 'unknown';
}
