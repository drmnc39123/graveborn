// "BİR OYUNCU KAÇ SAAT HARCAMALI" — ekonominin takvim ölçümü.
//
// NİYE AYRI BİR ALET: `curve.test.mts` 5 seed'in ORTANCASINI raporluyor ve
// bu sayı ölçülemeyecek kadar gürültülü. Ölçüldü: aynı senaryo iki farklı
// commit'te d17 ve d9 verdi, ama İKİSİNDE DE dağılım 4–23'tü — yani ortanca
// değişti, dağılım değişmedi. Beş örnekle 4–23 aralığından çekilen bir
// ortancaya bakıp "ekonomi bozuldu" demek, gürültüyü bulgu sanmaktı.
//
// Bu dosya aynı soruyu DAĞILIMLA cevaplıyor: N seed, ortanca + çeyrekler +
// aralık. "Şu kadar saat" cümlesi ancak hata payıyla birlikte anlamlı.
//
// ⚠️ YZ SÜRÜCÜSÜ İNSANDAN KÖTÜ. Mutlak derinlik bir ALT SINIR; saat sayıları
// tavan tahminidir. Karşılaştırmalar (Forge'lu vs Forge'suz) geçerli çünkü
// iki tarafta da aynı sürücü var.
//
// Çalıştır:  npx tsx src/game/hours.test.mts

import { Game } from './engine.js';
import { RUN, STAGES, TICK } from './config.js';
import { FORGE, permanentBonus, spentOnOne, treeTotalCost } from './forge.js';
import { seedFromString } from './rng.js';

const SEEDS = 21;   // tek sayı: ortanca tek bir örneğe düşsün

// ── kaçış sürücüsü (curve.test.mts ile aynı davranış) ──
function flee(g: any): [number, number] {
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
    let bi = -1, bd = Infinity;
    for (let i = 0; i < g.gems.length; i++) {
      const dx = g.gems[i].x - g.px, dy = g.gems[i].y - g.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    if (bi >= 0) {
      const dx = g.gems[bi].x - g.px, dy = g.gems[bi].y - g.py;
      const d = Math.hypot(dx, dy) || 1;
      const w = threat === 0 ? 1.4 : 0.6;
      vx += dx / d * w; vy += dy / d * w;
    }
  }
  const dist = Math.hypot(g.px, g.py);
  if (dist > 2100) { vx += -g.px / dist * 0.6; vy += -g.py / dist * 0.6; }
  return [vx, vy];
}

/**
 * Kart seçimi — `offers[0]` DEĞİL.
 *
 * ⚠️ `offers[0]` rastgele oynamak demek ve ölçümü tamamen değiştiriyor:
 * insan oyuncu hasar/canını yükseltir, teklif listesinin ilk elemanını değil.
 * Basit ama tutarlı bir öncelik: silah seviyesi > hasar > can > diğer.
 */
function smartPick(g: any): string {
  const puan = (o: any) => {
    if (o.kind === 'weapon') return o.level ? 100 : 90;      // mevcut silahı yükselt
    const s = o.stat as string;
    if (s === 'might') return 80;
    if (s === 'maxHp' || s === 'armor') return 70;
    if (s === 'cooldown') return 65;
    return 40;
  };
  return [...g.offers].sort((a: any, b: any) => puan(b) - puan(a))[0].id;
}

interface Sonuc { depth: number; sec: number; gold: number; capped: boolean }

function kos(seed: number, perm: Partial<Record<string, number>>, startDepth: number): Sonuc {
  const g: any = new Game(seed, STAGES[0], perm as any, 'descent', undefined, startDepth);
  g.setViewport(1280, 720);
  const max = Math.round(RUN.durationSec / TICK);
  for (let i = 0; i < max; i++) {
    if (g.phase === 'levelup') { g.choose(smartPick(g)); continue; }
    if (g.phase !== 'running') break;
    g.setInput(...flee(g));
    g.step();
  }
  return {
    depth: g.stage.depth, sec: g.time, gold: g.rareGold,
    capped: g.time >= RUN.durationSec - 1,
  };
}

const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const ort = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

function rapor(ad: string, r: Sonuc[]) {
  const d = r.map((x) => x.depth);
  const t = r.map((x) => x.sec);
  const gld = r.map((x) => x.gold);
  console.log(`  ${ad.padEnd(22)} derinlik ort ${q(d, 0.5)} (Ç1 ${q(d, 0.25)} · Ç3 ${q(d, 0.75)} · aralık ${Math.min(...d)}–${Math.max(...d)})`);
  console.log(`  ${''.padEnd(22)} süre ${(ort(t) / 60).toFixed(1)} dk · nadir gold ort ${Math.round(ort(gld))} · süre tavanı ${r.filter((x) => x.capped).length}/${r.length}`);
  return { depth: q(d, 0.5), sec: ort(t), gold: ort(gld) };
}

console.log(`\n═══ GRAVEBORN — TAKVİM ÖLÇÜMÜ (${SEEDS} seed, dağılımlı) ═══`);
console.log('⚠️  YZ sürücüsü insandan kötü: derinlik ALT SINIR, saat TAVAN tahmini.\n');

const seeds = Array.from({ length: SEEDS }, (_, i) => seedFromString(`hours-${i}`));

// ── Forge senaryoları ──
const bos: Record<string, number> = {};
const yariAgac: Record<string, number> = {};
const tamAgac: Record<string, number> = {};
// ⚠️ MALİYETİ ELLE TOPLAMA — `forge.ts` bunu zaten veriyor (`treeTotalCost`,
// `totalCost`, `spentOnOne`). İlk sürümde döngü elle yazıldı ve toplam NaN
// çıktı; ölçüm aracının kendi aritmetiği sessizce bozulunca "ağaç kaç saat"
// sorusu cevapsız kaldı. Gönderilmiş fonksiyon varsa o kullanılır.
const agacToplam = treeTotalCost();
let yariToplam = 0;
for (const u of FORGE) {
  tamAgac[u.id] = u.maxLevel;
  const yari = Math.floor(u.maxLevel / 2);
  yariAgac[u.id] = yari;
  yariToplam += spentOnOne(u, yari);
}

console.log('[1] Forge boş — hiç yatırım yok');
const a = rapor('taze oyuncu', seeds.map((s) => kos(s, permanentBonus(bos), 1)));

console.log('\n[2] Forge yarı dolu');
const b = rapor(`yarı ağaç (${yariToplam.toLocaleString('tr')} gold)`, seeds.map((s) => kos(s, permanentBonus(yariAgac), 1)));

console.log('\n[3] Forge tam dolu');
const c = rapor(`tam ağaç (${agacToplam.toLocaleString('tr')} gold)`, seeds.map((s) => kos(s, permanentBonus(tamAgac), 1)));

// ── Tekrar koşusu geliri: checkpoint'ten başlayıp YENİ derinlik açamayan koşu ──
console.log('\n[4] Tekrar koşusu geliri (checkpoint\'ten, yeni derinlik yok)');
const ck = Math.max(5, Math.floor(a.depth / 5) * 5);
const tekrar = seeds.map((s) => kos(s, permanentBonus(yariAgac), ck));
const t4 = rapor(`d${ck}'ten başlayan koşu`, tekrar);
const goldSaat = t4.gold / (t4.sec / 3600);
console.log(`  → ${Math.round(goldSaat).toLocaleString('tr')} gold/saat (sadece nadir düşüş)`);

// ── Takvim ──
console.log('\n[5] TAKVİM');
console.log(`  Forge ağacı toplam       ${agacToplam.toLocaleString('tr')} gold`);
console.log(`  Tekrar koşusu geliri     ${Math.round(goldSaat).toLocaleString('tr')} gold/saat`);
console.log(`  → ağacı doldurma         ${(agacToplam / goldSaat).toFixed(0)} saat (sadece tekrar koşusuyla)`);
const kampanya = STAGES.reduce((s, x) => s + x.firstClearGold, 0);
console.log(`  Kampanyanın tamamı       ${kampanya.toLocaleString('tr')} gold = ağacın %${(kampanya / agacToplam * 100).toFixed(1)}'i`);
console.log(`  Forge'un etkisi          taze d${a.depth} → yarı d${b.depth} → tam d${c.depth}`);

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};
console.log('\n[6] Sağlık');
// ⚠️ Bunlar DAĞILIM üzerinden — tek bir ortancaya bakan eşik gürültüyü bulgu sanar.
check('Forge yatırımı işe yarıyor (tam ağaç taze oyuncudan derin)', c.depth > a.depth,
  `d${a.depth} → d${c.depth}`);
check('ağaç 500 saatin altında dolabiliyor', agacToplam / goldSaat < 500,
  `${(agacToplam / goldSaat).toFixed(0)} saat`);
check('ağaç 20 saatten uzun sürüyor (anında bitmiyor)', agacToplam / goldSaat > 20,
  `${(agacToplam / goldSaat).toFixed(0)} saat`);

console.log(`\n${FAIL.length === 0 ? '✅ TAKVİM SAĞLIKLI' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
