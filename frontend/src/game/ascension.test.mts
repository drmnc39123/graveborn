// ASCENSION TESTİ — zorluk katmanı gerçekten işe yarıyor mu.
//
// Bu katman TEK BİR ÖLÇÜME cevaben eklendi: Forge yarıya geldiği anda 21
// koşunun 21'i 30 dakika tavanına çarpıyordu. Yani koşuyu bitiren şey ölüm
// değil SAAT'ti; oyuncu artık ölmüyor, sadece sıkılana kadar iniyordu.
//
// Test o iddiayı doğruluyor: yüksek kademede koşu ÖLÜMLE bitmeli, tavanla
// değil. İkinci soru da ölçülüyor — ödül zorluğu KARŞILIYOR mu, yoksa zoru
// seçmek saf ceza mı?
//
// ⚠️ ÜÇÜNCÜ VE EN ÖNEMLİ KONTROL: ascension YENİ BİR MUSLUK OLMAMALI.
// Kademe başına gold artışı, zorluk artışının çok altında kalmalı; yoksa
// "zoru seç, zengin ol" olur ve Faz 2'de kapatılan kapı yeniden açılır.
//
// Çalıştır:  npx tsx src/game/ascension.test.mts

import { Game } from './engine.js';
import { smartPick } from './simPlayer.mjs';
import {
  ASCENSION, RUN, STAGES, TICK, ascensionDropMul, ascensionHpMul,
  ascensionUnlockDepth, challengeRating, descentStage, maxAscensionFor,
} from './config.js';
import { FORGE, permanentBonus, spentOnOne } from './forge.js';
import { seedFromString } from './rng.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const SEEDS = 9;

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

// Forge yarı dolu oyuncu — ölçümdeki "duvara çarpan" profil
const yariAgac: Record<string, number> = {};
let yariToplam = 0;
for (const u of FORGE) {
  const yari = Math.floor(u.maxLevel / 2);
  yariAgac[u.id] = yari;
  yariToplam += spentOnOne(u, yari);
}
const perm = permanentBonus(yariAgac);

function kos(seed: number, asc: number) {
  const g: any = new Game(seed, STAGES[0], perm as any, 'descent', undefined, 1, asc);
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
    tavan: g.time >= RUN.durationSec - 1,
  };
}

const ort = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const seeds = Array.from({ length: SEEDS }, (_, i) => seedFromString(`asc-${i}`));

console.log('\n═══ ASCENSION ═══');
console.log(`Forge yarı dolu oyuncu (${yariToplam.toLocaleString('tr')} gold yatırım), ${SEEDS} seed\n`);

console.log('[1] Saf mantık');
{
  check('0. kademe hiçbir şeyi değiştirmiyor', ascensionHpMul(0) === 1 && ascensionDropMul(0) === 1);
  check('kademe arttıkça zorluk artıyor', ascensionHpMul(5) > ascensionHpMul(4));
  check('kademe arttıkça düşüş değeri artıyor', ascensionDropMul(5) > ascensionDropMul(4));
  check('kilit derinliğe bağlı', maxAscensionFor(0) === 0 && maxAscensionFor(ascensionUnlockDepth(1)) === 1,
    `d${ascensionUnlockDepth(1)} → kademe 1`);
  check('kilit tavanı aşmıyor', maxAscensionFor(100000) === ASCENSION.max, `${maxAscensionFor(100000)}`);
  check('negatif/bozuk girdi 0 veriyor', maxAscensionFor(-5) === 0 && ascensionHpMul(-3) === 1);

  // ⚠️ HIZ TAVANI: ascension'da da geçerli olmalı, yoksa kaçış tamamen ölür.
  const dusuk = descentStage(1, 30, 0).speedMul;
  const yuksek = descentStage(1, 30, ASCENSION.max).speedMul;
  console.log(`     hız: kademe 0 → ×${dusuk.toFixed(2)} · kademe ${ASCENSION.max} → ×${yuksek.toFixed(2)}`);
  check('hız tavanı ascension\'da da tutuyor', yuksek <= dusuk * 1.35,
    `${dusuk.toFixed(2)} → ${yuksek.toFixed(2)}`);

  // Sıralama puanı ascension'ı saymalı — katmanın ASIL ödülü bu
  const p0 = challengeRating(1, 20, 0);
  const p5 = challengeRating(1, 20, 5);
  console.log(`     puan: d20 kademe 0 → ${Math.round(p0)} · kademe 5 → ${Math.round(p5)} (×${(p5 / p0).toFixed(1)})`);
  check('aynı derinlik daha zor kademede DAHA ÇOK puan', p5 > p0 * 2, `×${(p5 / p0).toFixed(1)}`);
}

console.log('\n[2] Duvarı kaldırıyor mu (asıl soru)');
const olcum: { asc: number; depth: number; sec: number; gold: number; tavan: number }[] = [];
for (const asc of [0, 3, 6, 10]) {
  const r = seeds.map((s) => kos(s, asc));
  const o = {
    asc,
    depth: Math.round(ort(r.map((x) => x.depth))),
    sec: ort(r.map((x) => x.sec)),
    gold: ort(r.map((x) => x.gold)),
    tavan: r.filter((x) => x.tavan).length,
  };
  olcum.push(o);
  console.log(`     kademe ${String(asc).padStart(2)}: derinlik ${String(o.depth).padStart(2)} · ${(o.sec / 60).toFixed(1)} dk · ${Math.round(o.gold)} gold · süre tavanı ${o.tavan}/${SEEDS}`);
}
const k0 = olcum[0], kMax = olcum[olcum.length - 1];

// ⭐ ASIL DEĞİŞMEZ: koşuyu bitiren şey SAAT DEĞİL ÖLÜM olmalı — HER kademede.
//
// ⚠️ Bu kontrolün ilk hâli yanlış yazılmıştı: "0. kademe hâlâ süre tavanına
// çarpıyor" diyordu, yani DÜZELTİLMESİ GEREKEN HATANIN VARLIĞINI şart
// koşuyordu. Ölçüm sırasında asıl kök neden bulununca (düşman hasarı
// derinlikle hiç ölçeklenmiyordu) 0. kademe de ölümle bitmeye başladı ve
// test kırmızı yandı. Eşiği gevşetmek değil, DEĞİŞMEZİ düzeltmek gerekiyordu.
const tavanaCarpan = olcum.reduce((s, o) => s + o.tavan, 0);
check('hiçbir kademede koşuyu SAAT bitirmiyor (duvar HP, takvim değil)',
  tavanaCarpan === 0, `${tavanaCarpan}/${olcum.length * SEEDS} koşu tavana çarptı`);
check('0. kademe hâlâ uzun bir koşu (katman oyunu kısaltmadı)', k0.sec > 15 * 60,
  `${(k0.sec / 60).toFixed(1)} dk`);
check('zorluk gerçekten derinliği düşürüyor', kMax.depth < k0.depth,
  `d${k0.depth} → d${kMax.depth}`);
// Kademeler arası eğri MONOTON olmalı — ortada bir sıçrama, seçimi anlamsızlaştırır
let monoton = true;
for (let i = 1; i < olcum.length; i++) if (olcum[i].depth > olcum[i - 1].depth) monoton = false;
check('derinlik kademeyle monoton azalıyor', monoton,
  olcum.map((o) => `A${o.asc}=d${o.depth}`).join(' '));

console.log('\n[3] Yeni musluk açıyor mu (kapatılan kapı)');
{
  // ⚠️ EN KRİTİK KONTROL. Zoru seçen oyuncu SAATTE daha çok gold kazanırsa
  // "zoru seç, zengin ol" olur ve Faz 2'de kapatılan musluk yeniden açılır.
  const saatlik = olcum.map((o) => ({ asc: o.asc, gs: o.gold / (o.sec / 3600) }));
  for (const x of saatlik) console.log(`     kademe ${String(x.asc).padStart(2)}: ${Math.round(x.gs).toLocaleString('tr')} gold/saat`);
  const enIyi = Math.max(...saatlik.map((x) => x.gs));
  const taban = saatlik[0].gs;
  check('zoru seçmek saatlik geliri PATLATMI YOR (≤1.6×)', enIyi <= taban * 1.6,
    `en iyi ${Math.round(enIyi).toLocaleString('tr')} vs taban ${Math.round(taban).toLocaleString('tr')}`);
  // Ama saf ceza da olmamalı — kimse bedavaya zorluk seçmez
  check('zoru seçmek saf ceza da DEĞİL (≥0.75×)', enIyi >= taban * 0.75,
    `${(enIyi / taban).toFixed(2)}×`);
}

console.log(`\n${FAIL.length === 0 ? '✅ ASCENSION SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
