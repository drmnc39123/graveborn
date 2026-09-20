// KOŞU PAYLAŞIMI — biten koşuyu tek dokunuşta X'e taşıyan metin.
//
// 🔴 NİYE VAR (2026-09-20): panolar boş ve oyuncudan "derinliğinin ekran
// görüntüsünü at" diye isteniyor, ama oyunun kendisi bunu hiç
// kolaylaştırmıyordu — ölüm ekranında yalnız TRY AGAIN ve RETURN TO VILLAGE
// vardı. Oyuncunun ekran görüntüsü alıp kırpması gerekiyordu; kimse yapmaz.
//
// ⚠️ SAF FONKSİYON: ağ yok, `window` yok. Mühür metni ÖLÇÜYOR — paylaşılan
// cümle oyuncunun gerçekten yaptığı şeyi söylemeli.
//
// ⚠️ BAĞLANTI `/s/<kod>` — davet panelinin kullandığı sayfanın AYNISI:
// orada oyuncunun kendi rakamlarıyla bir kart çiziliyor. Kod yoksa (demo,
// cüzdansız) düz ana sayfa; olmayan bir kodu uydurmak kırık bağlantı olurdu.
//
// ⚠️ TOKEN/FİYAT/KAZANÇ SÖZÜ YOK. Paylaşılan şey bir başarı, bir yatırım
// çağrısı değil.

export const SITE = 'https://playgraveborn.com';

export interface KosuOzeti {
  /** 'descent' | 'campaign' | 'daily' | 'wilderness' … */
  mode: string;
  stageName: string;
  /** descent: üstünde savaşılan derinlik */
  depth: number;
  /** descent: tamamen bitirilen en derin kat */
  deepestCleared: number;
  level: number;
  kills: number;
  /** koşu bitti mi — `won` kazanarak bitirdi */
  kazandi: boolean;
  /** davet kodu (cüzdanlı oyuncu); yoksa düz site bağlantısı */
  kod?: string | null;
}

/**
 * Paylaşım cümlesi.
 *
 * ⚠️ DERİNLİKTE `depth`, `deepestCleared` DEĞİL: oyuncunun anlattığı şey
 * indiği yer. İkisinin farkı ölüm ekranında zaten ayrı ayrı yazıyor.
 */
export function paylasimMetni(o: KosuOzeti): string {
  if (o.mode === 'descent') {
    return `I made it to depth ${Math.max(1, o.depth)} in GRAVEBORN.`
      + ` LV ${o.level} · ${o.kills} kills. How deep can you go?`;
  }
  if (o.kazandi) {
    return `I cleared ${o.stageName} in GRAVEBORN.`
      + ` LV ${o.level} · ${o.kills} kills. Your turn.`;
  }
  return `${o.stageName} took me down in GRAVEBORN.`
    + ` LV ${o.level} · ${o.kills} kills. See how far you get.`;
}

/** Paylaşılacak adres — kodu olan oyuncunun kendi kartlı sayfası */
export function paylasimLinki(kod?: string | null): string {
  return kod ? `${SITE}/s/${kod}` : SITE;
}

/** X paylaşım penceresinin adresi */
export function paylasimXLinki(o: KosuOzeti): string {
  const metin = paylasimMetni(o);
  const link = paylasimLinki(o.kod);
  return `https://x.com/intent/tweet?text=${encodeURIComponent(metin)}&url=${encodeURIComponent(link)}`;
}
