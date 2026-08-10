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

export const ICON = {
  star: '01', starOff: '02', health: '03', healthOff: '04',
  gold: '05', skull: '06', alert: '07', unknown: '08',
  damage: '09', armor: '10', speed: '11', garb: '12',
  magic: '13', heal: '14', urn: '15', gem: '16',
  potion: '17', magnet: '18', rosette: '19', note: '20',
  sound: '21', tome: '22', feather: '23', mallet: '24',
  keySilver: '25', keyGold: '26', flaskGreen: '27', flaskTeal: '28',
  flaskRed: '29', sigil: '30', target: '31', voidMark: '32',
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
  revival: 'sigil',
  crit: 'star',
  critMul: 'star',
};

/** Bir stat'ın ikonu — bilinmeyen stat sessizce soru işaretine düşer */
export function statIcon(stat: string): IconName {
  return STAT_ICON[stat] ?? 'unknown';
}
