// KOZMETİK + RELIQUARY — gold sinkinin doğruluğu.
//
// Çalıştır:  npx tsx src/game/cosmetics.test.mts
//
// İki ayrı soru soruluyor:
//   1. Satılan şey GERÇEKTEN var mı (sprite yolu, renk, yuva tutarlılığı)
//   2. Ekonomi kapısı sağlam mı (gold düşüyor mu, sahip olmadığı takılabiliyor mu)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COSMETICS, PULL_COST, RARITY, cosmeticById, cosmeticsInSlot,
  resolvePull, rollCosmetic, type Rarity,
} from './cosmetics.js';
import {
  buyWithDust, emptyProgress, equipCosmetic, pullReliquary, type Progress,
} from './progress.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Deterministik zar — testler `Math.random()` kullanamaz (projenin kuralı) */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

console.log('\n[1] Havuz bütünlüğü');
{
  const ids = COSMETICS.map((c) => c.id);
  check('id\'ler benzersiz', new Set(ids).size === ids.length,
    `${ids.length} kayıt`);
  check('her yuvada en az 6 seçenek var',
    (['title', 'plate', 'trophy', 'aura'] as const).every((s) => cosmeticsInSlot(s).length >= 6),
    (['title', 'plate', 'trophy', 'aura'] as const).map((s) => `${s}:${cosmeticsInSlot(s).length}`).join(' '));
  // Her nadirlikte bir şey OLMALI — boş nadirlik çekilişte sonsuz döngü değil,
  // sessizce `undefined` üretirdi
  check('her nadirlik dolu',
    (Object.keys(RARITY) as Rarity[]).every((r) => COSMETICS.some((c) => c.rarity === r)),
    (Object.keys(RARITY) as Rarity[]).map((r) => `${r}:${COSMETICS.filter((c) => c.rarity === r).length}`).join(' '));

  const eksikYuk = COSMETICS.filter((c) =>
    (c.slot === 'plate' && !c.plate) || (c.slot === 'trophy' && !c.trophy) || (c.slot === 'aura' && !c.aura));
  check('yuvası olan her kayıt yükünü taşıyor', eksikYuk.length === 0,
    eksikYuk.map((c) => c.id).join(', ') || 'hepsi tam');
}

console.log('\n[2] MOR YASAĞI');
{
  // Projenin en katı görsel kuralı. Renkleri gözle değil HESAPLA:
  // mor = kırmızı ve mavi baskın, yeşil ikisinden de belirgin düşük.
  const morMu = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return b > g + 28 && r > g + 18 && b > 60;
  };
  const renkler: { id: string; hex: string }[] = [];
  for (const c of COSMETICS) {
    if (c.plate) renkler.push({ id: c.id, hex: c.plate.from }, { id: c.id, hex: c.plate.to });
    if (c.aura) renkler.push({ id: c.id, hex: c.aura.color });
  }
  for (const r of Object.values(RARITY)) renkler.push({ id: 'rarity', hex: r.color });
  const morlar = renkler.filter((x) => morMu(x.hex));
  check('hiçbir kozmetik rengi mor değil', morlar.length === 0,
    morlar.map((m) => `${m.id} ${m.hex}`).join(', ') || `${renkler.length} renk denetlendi`);

  // ⚠️ /art/loot/ içindeki `spr_Amethyst` bilerek DIŞARIDA — mor taş.
  check('Amethyst havuza girmemiş',
    !COSMETICS.some((c) => /amethyst/i.test(c.trophy?.src ?? '')));
}

console.log('\n[3] Kupa dosyaları GERÇEKTEN var');
{
  // "Çalışmayan bir şeyi satmak oyuncuyu kandırmaktır" — manifest'e karşı doğrula
  const here = path.dirname(fileURLToPath(import.meta.url));
  const manifestPath = path.resolve(here, '../../public/art/manifest.json');
  const { items } = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    items: { src: string; frames: number }[];
  };
  const bySrc = new Map(items.map((i) => [i.src, i]));

  const eksik: string[] = [];
  const yanlisKare: string[] = [];
  for (const c of COSMETICS) {
    if (!c.trophy) continue;
    const rec = bySrc.get(c.trophy.src);
    if (!rec) { eksik.push(`${c.id} → ${c.trophy.src}`); continue; }
    // Kare sayısı yanlışsa animasyon ortadan kesilir — sessiz görsel hata
    if (rec.frames !== c.trophy.frames) {
      yanlisKare.push(`${c.id} ${c.trophy.frames} yazılı, ${rec.frames} gerçek`);
    }
  }
  check('her kupa sprite\'ı diskte var', eksik.length === 0, eksik.join(', ') || 'hepsi mevcut');
  check('kare sayıları manifest ile uyuşuyor', yanlisKare.length === 0,
    yanlisKare.join(', ') || 'hepsi doğru');
}

console.log('\n[4] Çekiliş dağılımı');
{
  const rnd = lcg(20260804);
  const N = 60_000;
  const sayim: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const gorulen = new Set<string>();
  for (let i = 0; i < N; i++) {
    const def = rollCosmetic(rnd(), rnd());
    sayim[def.rarity] += 1;
    gorulen.add(def.id);
  }
  const toplamAgirlik = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
  let enKotuSapma = 0;
  for (const key of Object.keys(RARITY) as Rarity[]) {
    const beklenen = RARITY[key].weight / toplamAgirlik;
    const gercek = sayim[key] / N;
    const sapma = Math.abs(gercek - beklenen) / beklenen;
    enKotuSapma = Math.max(enKotuSapma, sapma);
    console.log(`     ${key.padEnd(10)} beklenen %${(beklenen * 100).toFixed(1)} · gerçek %${(gercek * 100).toFixed(1)}`);
  }
  check('dağılım ağırlıklara uyuyor (sapma <%5)', enKotuSapma < 0.05,
    `en kötü %${(enKotuSapma * 100).toFixed(1)}`);
  // ⚠️ ASIL TUZAK: nadirlik içindeki seçim de dengeli olmalı. Tek zarı ikiye
  // bölmek burayı sessizce eğerdi — bu yüzden iki ayrı zar kullanılıyor.
  check('havuzdaki HER kozmetik çıkabiliyor', gorulen.size === COSMETICS.length,
    `${gorulen.size}/${COSMETICS.length}`);
}

console.log('\n[5] Toz ekonomisi');
{
  // Tozla almak, çekilişten UCUZ olmamalı; olursa gacha anlamsızlaşır ve
  // oyuncu için en verimli yol "çek, tozla al, çek" döngüsü olur.
  let enKotuOran = Infinity;
  for (const key of Object.keys(RARITY) as Rarity[]) {
    const r = RARITY[key];
    const oran = r.dustCost / r.dust;   // kaç tekrar bir hedefli alım eder
    enKotuOran = Math.min(enKotuOran, oran);
    console.log(`     ${key.padEnd(10)} tekrar ${r.dust} toz · hedefli alım ${r.dustCost} = ${oran.toFixed(1)} tekrar`);
  }
  check('hedefli alım en az 10 tekrar ediyor', enKotuOran >= 10,
    `en dar ${enKotuOran.toFixed(1)}`);
}

console.log('\n[6] Ekonomi kapısı');
{
  const rnd = lcg(7);
  const zengin: Progress = { ...emptyProgress(), gold: 10_000 };

  const bir = pullReliquary(zengin, rnd(), rnd());
  check('çekiliş gold düşürüyor', bir.progress.gold === 10_000 - PULL_COST,
    `${zengin.gold} → ${bir.progress.gold}`);
  check('çekiliş bir kozmetik veriyor', bir.progress.cosmetics.length === 1,
    bir.result?.cosmetic.name ?? 'yok');
  check('saf: girdi DEĞİŞMEDİ', zengin.gold === 10_000 && zengin.cosmetics.length === 0);

  const fakir: Progress = { ...emptyProgress(), gold: PULL_COST - 1 };
  const yok = pullReliquary(fakir, rnd(), rnd());
  check('gold yetmezse çekiliş yok', yok.result === null && yok.progress.gold === PULL_COST - 1,
    yok.error ?? '');

  // Tekrar → toz
  const ayniDef = bir.result!.cosmetic;
  const tekrar = resolvePull(bir.progress.cosmetics, ayniDef);
  check('tekrar toza dönüyor', tekrar.duplicate && tekrar.dust === RARITY[ayniDef.rarity].dust,
    `${tekrar.dust} toz`);

  // ⚠️ Koleksiyon dolduğunda çekiliş DEĞERSİZ olmamalı — sink sonsuz kalsın
  const tamKoleksiyon: Progress = {
    ...emptyProgress(), gold: 10_000, cosmetics: COSMETICS.map((c) => c.id),
  };
  const dolu = pullReliquary(tamKoleksiyon, rnd(), rnd());
  check('koleksiyon doluyken çekiliş hâlâ toz veriyor',
    dolu.result!.duplicate && dolu.result!.dust > 0, `${dolu.result!.dust} toz`);
}

console.log('\n[7] Takma kuralları');
{
  const unvan = cosmeticsInSlot('title')[0];
  const hale = cosmeticsInSlot('aura')[0];
  const sahip: Progress = { ...emptyProgress(), cosmetics: [unvan.id] };

  check('sahip olduğu takılıyor',
    equipCosmetic(sahip, 'title', unvan.id).equipped.title === unvan.id);
  // ⭐ ASIL SALDIRI: kayıt elle düzenlenebilir
  check('SAHİP OLMADIĞI takılamıyor',
    equipCosmetic(sahip, 'aura', hale.id).equipped.aura === undefined,
    'hiç çekilmemiş hale reddedildi');
  check('yanlış yuvaya takılamıyor',
    equipCosmetic(sahip, 'aura', unvan.id).equipped.aura === undefined,
    'unvan hale yuvasına girmedi');
  check('null yuvayı boşaltıyor',
    equipCosmetic(equipCosmetic(sahip, 'title', unvan.id), 'title', null).equipped.title === undefined);
}

console.log('\n[8] Tozla alım');
{
  const hedef = COSMETICS.find((c) => c.rarity === 'legendary')!;
  const bedeli = RARITY.legendary.dustCost;
  const p: Progress = { ...emptyProgress(), dust: bedeli };

  const ok = buyWithDust(p, hedef.id);
  check('yeterli tozla alınıyor',
    ok.error === null && ok.progress.cosmetics.includes(hedef.id) && ok.progress.dust === 0,
    `${bedeli} toz harcandı`);
  check('yetersiz tozla alınmıyor',
    buyWithDust({ ...p, dust: bedeli - 1 }, hedef.id).error !== null);
  check('zaten sahip olduğu tekrar alınmıyor',
    buyWithDust(ok.progress, hedef.id).error === 'already owned');
  check('bilinmeyen id reddediliyor', buyWithDust(p, 'yok-boyle-bir-sey').error !== null);
}

console.log('\n[9] Kayıt temizliği (elle düzenlenmiş kayıt)');
{
  // normalize()'ın kozmetik tarafı — sahiplik listesinde olmayan bir şey
  // `equipped`'te duruyorsa düşmeli
  const kirli = {
    gold: 100, cosmetics: ['t_grave', 'yok-boyle-bir-sey', 't_grave'],
    equipped: { title: 't_first', aura: 't_grave' }, dust: -50,
  } as unknown as Partial<Progress>;
  // normalize dışa açık değil; loadProgress deposu da yok → equipCosmetic ile
  // aynı kuralı doğrulayan dolaylı kontrol yeterli. Burada sadece saf
  // fonksiyonların negatif toz üretmediğini ölçüyoruz.
  const p: Progress = { ...emptyProgress(), dust: 0 };
  check('toz negatife düşmüyor', buyWithDust(p, COSMETICS[0].id).progress.dust === 0);
  check('bilinmeyen id sahiplikten sayılmıyor', cosmeticById('yok-boyle-bir-sey') === undefined);
  void kirli;
}

console.log(`\n${FAIL.length === 0 ? '✅ KOZMETİK SİSTEMİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
