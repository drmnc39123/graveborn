// SİMÜLE OYUNCU — ekonomi ölçümlerinin TEK ortak yapay oyuncusu.
//
// ⚠️ NİYE TEK DOSYA: bu depoda `smartPick` ÜÇ AYRI YERDE, ÜÇ FARKLI şekilde
// yazılmıştı (`curve.test`, `hours.test`, `ascension.test`). Yani üç ölçüm
// aleti ÜÇ FARKLI OYUNCUYU simüle ediyordu — ama çıktıları birbiriyle
// karşılaştırılıyor ve Forge fiyatlaması o karşılaştırmadan çıkıyordu.
//
// ⚠️ VE İKİSİ BOZUKTU. `hours.test` ile `ascension.test`teki sürüm şunu
// yapıyordu:
//     if (o.kind === 'weapon') ...
//     const s = o.stat as string;
// Motorun `Offer` tipinde NE `'weapon'` diye bir `kind` var (gerçekleri
// `weapon-new` / `weapon-up` / `passive-new` / `passive-up`) NE DE `stat`
// alanı. Yani her teklif aynı puanı (40) alıyor, sıralama ilkini döndürüyor
// ve teklifler rng ile karıldığı için sonuç RASTGELE OYNAMAK oluyordu.
// `curve.test` başlığı tam bu tuzağı yazıyor: "teklifler rng ile karılıyor,
// yani 'ilkine bas' = RASTGELE oyna... bütün gold/saat hesabını aşağı çeker."
// Uyarı yazılmış, kardeş dosyada hata aynen duruyordu.
//
// ⚠️ MÜMKÜN OLMASININ SEBEBİ `any`. İki bozuk sürüm de `(g: any)` ve
// `(o: any)` ile yazılmıştı; tip denetimi kapalı olduğu için TypeScript
// olmayan alanı söylemedi. Bu dosya BİLEREK tam tipli — aynı hata bir daha
// derlemeden geçemez.

import type { Game, Offer } from './engine.js';

/**
 * KAÇIŞ + TOPLAMA — "makul oyuncu" hareketi.
 *
 * ⚠️ SADECE KAÇAN bir yapay oyuncu YAZMA. Bir kez denendi ve ölçüm yalan
 * söyledi: mücevherler düşmanın öldüğü yere düşüyor, sürekli kaçan oyuncu
 * hiç XP toplamıyor ve "18 dakikada 5 level-up" gibi tamamen uydurma bir
 * tablo çıkıyor. Tehdit azken mücevhere gitmek ŞART.
 */
export function fleeInput(g: Game): [number, number] {
  let ax = 0, ay = 0, threat = 0;
  for (const e of g.enemies) {
    const dx = e.x - g.px, dy = e.y - g.py;
    const d2 = dx * dx + dy * dy;
    if (d2 > 260 * 260) continue;
    const d = Math.sqrt(d2) || 1;
    ax += dx / d / d; ay += dy / d / d;
    if (d < 120) threat += 1;
  }
  let vx = -ax, vy = -ay;

  if (threat < 3 && g.gems.length) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < g.gems.length; i++) {
      const dx = g.gems[i].x - g.px, dy = g.gems[i].y - g.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    if (best >= 0) {
      const dx = g.gems[best].x - g.px, dy = g.gems[best].y - g.py;
      const d = Math.hypot(dx, dy) || 1;
      const w = threat === 0 ? 1.4 : 0.6;
      vx += (dx / d) * w; vy += (dy / d) * w;
    }
  }
  const dist = Math.hypot(g.px, g.py);
  if (dist > 2100) { vx += -g.px / dist * 0.6; vy += -g.py / dist * 0.6; }
  return [vx, vy];
}

/**
 * KART SEÇİMİ — "makul oyuncu" vekili.
 *
 * ⚠️ `sim.test.mts` bilerek `offers[0]`'ı seçiyor ve ORASI doğru: amacı
 * determinizmi ölçmek, oynanışı değil. Ekonomi ölçümünde aynısını yapmak
 * rastgele oynamak demektir (bkz. dosya başlığı).
 *
 * Kural VS'in gerçek oynanışına yakın: önce elini kur (yeni silah), sonra
 * elindekini büyüt (düşük seviyeliyi öne al), pasifi ihmal etme. Puanlar
 * mutlak değil SIRALAMA içindir.
 */
export function smartPick(g: Game): string {
  let bestId = g.offers[0]?.id ?? '';
  let bestScore = -Infinity;
  for (const o of g.offers as readonly Offer[]) {
    let s: number;
    if (o.kind === 'weapon-new') s = g.weapons.length < 4 ? 100 : 12;
    else if (o.kind === 'weapon-up') s = 80 - (o.level ?? 1) * 3;
    else if (o.kind === 'passive-new') s = g.passives.length < 4 ? 62 : 22;
    else s = 50 - (o.level ?? 1) * 2;
    if (s > bestScore) { bestScore = s; bestId = o.id; }
  }
  return bestId;
}
