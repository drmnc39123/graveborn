// HUD KISAYOL GLİFLERİ — piksel piksel çizilmiş üç küçük simge. Saf veri.
//
// 🔴 NİYE ELLE ÇİZİLDİ, kit ikonu DEĞİL — ölçüldü (2026-09-15): mini ikon
// paketinin 32 çizimi kontakt sayfasına dökülüp gözle okundu. Lonca, arkadaş
// ve sıralama için tek bir uygun çizim YOK:
//   · `rosette` bir kupa değil DİŞLİ ÇARK — sıralamaya konsaydı "ayarlar"
//     diye okunurdu;
//   · `note` bir müzik notası;
//   · `sigil` Facebook logosuydu (bkz. `lib/icons.ts`, haritadan silindi).
// Emoji de değil: işletim sistemine göre farklı çiziliyor, piksel sanatın
// yanında yabancı duruyor ve bazı platformlarda mor tonlar taşıyor.
//
// ⚠️ SAF: React yok, `@/` yok — mühür (`hudKisayol.test`) doğrudan içe
// aktarıp her glifin dikdörtgen olduğunu ve boş olmadığını ölçüyor.
//
// Biçim: her satır bir dize; `X` dolu piksel, `.` boş. Renk bileşende,
// paletten (`C`) veriliyor — burada renk YOK, mor sızamaz.

export type GlifAdi = 'guild' | 'friends' | 'leaderboard';

export const GLIF: Record<GlifAdi, readonly string[]> = {
  /** Kalkan + haç — lonca */
  guild: [
    'XXXXXXXXXXX',
    'XXXXX.XXXXX',
    'XXXXX.XXXXX',
    'XX.......XX',
    'XXXXX.XXXXX',
    'XXXXX.XXXXX',
    '.XXXX.XXXX.',
    '.XXXXXXXXX.',
    '..XXXXXXX..',
    '...XXXXX...',
    '....XXX....',
    '.....X.....',
  ],
  /** Yan yana iki büst — arkadaşlar */
  friends: [
    '..XXX...XXX..',
    '.XXXXX.XXXXX.',
    '.XXXXX.XXXXX.',
    '..XXX...XXX..',
    '.............',
    // ⚠️ Omuzlar EĞİMLİ: ilk çizimde gövde düz bir bloktu ve büyütülmüş
    // önizlemede "insan" değil "iki kutu" diye okunuyordu.
    '..XXX...XXX..',
    '.XXXXX.XXXXX.',
    'XXXXXX.XXXXXX',
    'XXXXXX.XXXXXX',
  ],
  /** Kulplu kupa — sıralama */
  leaderboard: [
    '..XXXXXXX..',
    'XXXXXXXXXXX',
    'X.XXXXXXX.X',
    'X.XXXXXXX.X',
    '.XXXXXXXXX.',
    '...XXXXX...',
    '....XXX....',
    '.....X.....',
    '.....X.....',
    '...XXXXX...',
    '..XXXXXXX..',
  ],
};

/** Glifin dolu piksellerini `[x, y]` listesi olarak döndürür. */
export function glifPikselleri(ad: GlifAdi): { w: number; h: number; px: [number, number][] } {
  const satirlar = GLIF[ad];
  const px: [number, number][] = [];
  satirlar.forEach((s, y) => {
    for (let x = 0; x < s.length; x++) if (s[x] === 'X') px.push([x, y]);
  });
  return { w: satirlar[0]?.length ?? 0, h: satirlar.length, px };
}
