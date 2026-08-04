// SAVAŞ EFEKTLERİ — vuruşun, ölümün ve hasarın HİSSİ.
//
// NİYE VAR: motor doğru çalışıyordu ama hiçbir şey hissedilmiyordu. Hasar
// sayısı yoktu, ekran sarsılmıyordu, `FX.hit` tanımlıydı ama hiç çizilmiyordu.
// Oyuncu 400 düşman öldürüyor ve ekranda sadece sprite'lar kayboluyordu.
//
// ⚠️ BU DOSYA MOTORU KİRLETMEZ. Tek yönlü bağ: render → engine. Motorun
// kozmetik kuyruklarını (`hits`, `deaths`, `hurts`) okur ve boşaltır;
// simülasyona hiçbir şey yazmaz. `sim.test.mts` [1C] bunu kanıtlıyor.
//
// ⚠️ `Math.random()` ve `Rng` KULLANILMAZ. Kozmetik rastgelelik `tileHash`
// ile konumdan türer — böylece aynı seed tekrar izlendiğinde efektler de
// birebir aynı çıkar ve motorun rng akışı hiç tüketilmez.
//
// ⚠️ HAVUZLAMA ZORUNLU. Sabit kapasiteli diziler, `push`/`pop` YOK, sadece
// aktif sayaç + swap-remove. Motor tam da bu disiplinle yazıldı (GC spike'ı
// yok → frame düşmesi yok); render katmanı da aynı disipline uymak zorunda.

import type { Game } from './engine';
import { C } from '@/lib/theme';
import { drawActor, drawCell, ENEMY_ART, FX } from './sprites';
import { tileHash } from './stageArt';
import { weaponArt } from './combatArt';

// ── SUNUM SABİTLERİ ───────────────────────────────────────────────────
// ⚠️ Bunlar DENGE DEĞİL, his. O yüzden `config.ts`'te değil burada.
const FEEL = {
  /** ekran sarsıntısı büyüklükleri (px) */
  hitShake: 0.5,
  critShake: 2.4,
  hurtShake: 5.0,
  deathShake: 0.3,
  bossDeathShake: 7,
  maxShake: 9,
  /** sarsıntı sönümü — frame bağımsız üstel */
  shakeDecay: 0.0008,
  /** hasar sayısı ömrü (sn) */
  numLife: 0.62,
  /** aynı düşmanın bu yarıçapındaki sayılar BİRLEŞİR (yoksa aura 400 sayı üretir) */
  numMerge: 22,
  /** kıvılcım ömrü — FX.hit'in kendi süresiyle uyumlu */
  sparkFps: 26,
  /** oyuncu hasar vinyeti ömrü */
  hurtLife: 0.42,
  /** leş ne kadar yerde kalır — son 1 sn'de solar */
  corpseLife: 4.0,
  corpseFade: 1.0,
  /**
   * HIT-STOP (vuruş donması) süreleri — sn.
   * ⚠️ Motorda tick atlanarak YAPILMAZ; motor sabit 60 Hz, tick atlamak
   * simülasyonu değiştirir ve sunucu doğrulamasıyla ayrışır. Bunun yerine
   * rAF döngüsü `step()` çağırmaz, sadece render eder (bkz. GameCanvas).
   * ⚠️ Normal vuruşta ASLA — 400 düşman ölürken oyun slayt gösterisi olur.
   */
  freezeBossDeath: 0.075,
  freezeHurt: 0.055,
  freezeCrit: 0.035,
  freezeMax: 0.09,
} as const;

// Havuz kapasiteleri — tavanlar ölçüldü, bkz. dosya sonundaki perf notu
const CAP = { spark: 96, num: 24, corpse: 128 } as const;

interface Spark {
  x: number; y: number; t: number; life: number; size: number; on: boolean;
  /** hangi silahın çarpma efekti — 16 silah artık ayrı görünüyor */
  wid: string;
}
interface Num { x: number; y: number; t: number; dmg: number; crit: boolean; vx: number; on: boolean }
/**
 * Leş — ölüm animasyonu oynayan ve sonra yerde kalan düşman.
 *
 * ⚠️ MOTORA "ÖLMEKTE OLAN DÜŞMAN" DURUMU EKLENMEZ. Öyle yapsaydık
 * `remaining`, `reapDead`, çarpışma ve bölüm bitiş koşulunun dördü birden
 * etkilenirdi — yani dengeyi değiştirirdi. Düşman motorda anında ölür;
 * burada sadece görüntüsü bir süre daha yaşar.
 */
interface Corpse { x: number; y: number; t: number; art: string; facing: boolean; on: boolean }

// ⚠️ Diziler MODÜL YÜKLENİRKEN doldurulur ve bir daha büyümez/küçülmez.
// `length` sabit kalır — testte tahsis olmadığının kanıtı budur.
const sparks: Spark[] = Array.from({ length: CAP.spark },
  () => ({ x: 0, y: 0, t: 0, life: 0, size: 0, on: false, wid: '' }));
const nums: Num[] = Array.from({ length: CAP.num },
  () => ({ x: 0, y: 0, t: 0, dmg: 0, crit: false, vx: 0, on: false }));
const corpses: Corpse[] = Array.from({ length: CAP.corpse },
  () => ({ x: 0, y: 0, t: 0, art: '', facing: true, on: false }));

let shakeMag = 0;
let hurtFlash = 0;
let frameSeq = 0;
/** biriken donma isteği — `takeFreeze()` okuyup sıfırlar */
let freezeReq = 0;

/**
 * OYUNCU AYARLARI — sunum kısıtları.
 *
 * ⚠️ Modül seviyesinde tutuluyor çünkü `pumpFx`/`drawFxWorld` her karede
 * çağrılıyor ve her seferinde localStorage okumak saçma olurdu. Ayar
 * değişince `applyFxSettings` bir kez çağrılır.
 *
 * ⚠️ SİMÜLASYONA GİRMEZ. Buradaki hiçbir bayrak motorun durumuna dokunmuyor;
 * sarsıntı kapalıyken de `pumpFx` aynı kuyrukları aynı sırayla boşaltıyor,
 * sadece çizim değişiyor. Testte aynı seed → aynı koşu ile kanıtlanıyor.
 */
let shakeOn = true;
let numbersOn = true;

export function applyFxSettings(v: { screenShake: boolean; damageNumbers: boolean }) {
  shakeOn = v.screenShake;
  numbersOn = v.damageNumbers;
  if (!shakeOn) shakeMag = 0;
}

/** Yeni koşu — önceki koşudan efekt taşmasın */
export function resetFx() {
  for (const s of sparks) s.on = false;
  for (const n of nums) n.on = false;
  for (const c of corpses) c.on = false;
  shakeMag = 0;
  hurtFlash = 0;
  frameSeq = 0;
  freezeReq = 0;
}

/** Havuzdan boş yuva al. Doluysa EN ESKİSİNİ geri dönüştür (ring davranışı) —
 *  "efekt hiç görünmedi" yerine "en eskisi kesildi" tercih edilir. */
function slot<T extends { on: boolean; t: number }>(pool: T[]): T {
  let oldest = pool[0];
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].on) return pool[i];
    if (pool[i].t > oldest.t) oldest = pool[i];
  }
  return oldest;
}

/**
 * Motorun kozmetik kuyruklarını boşalt ve efektleri yaşlandır.
 * ⚠️ Çizimden AYRI — böylece headless testte çağrılabilir (perf ölçümü).
 */
export function pumpFx(g: Game, dt: number) {
  frameSeq += 1;

  // ── vuruşlar → kıvılcım + hasar sayısı ──
  for (let i = 0; i < g.hits.length; i++) {
    const h = g.hits[i];

    // Kıvılcım: her vuruşa değil — 96 vuruşluk bir aura tick'inde ekran
    // bembeyaz olurdu. Öldüren ve kritik vuruşlar kesin, kalanı havuz izin
    // verdiği kadar.
    const onemli = h.killed || h.crit;
    if (onemli || sparks.some((s) => !s.on)) {
      const s = slot(sparks);
      const art = weaponArt(h.wid).impact;
      s.x = h.x; s.y = h.y; s.t = 0;
      s.wid = h.wid;
      s.life = art.frames / art.fps;
      s.size = h.crit ? art.size * 1.45 : art.size;
      s.on = true;
    }

    // Hasar sayısı — BİRLEŞTİRME şart. Aura silahı tek tick'te 400 düşmana
    // vuruyor; her birine ayrı sayı yazmak ekranı okunmaz yapar.
    let merged = false;
    for (let k = 0; k < nums.length; k++) {
      const n = nums[k];
      if (!n.on) continue;
      if (Math.abs(n.x - h.x) < FEEL.numMerge && Math.abs(n.y - h.y) < FEEL.numMerge) {
        n.dmg += h.dmg;
        n.crit = n.crit || h.crit;
        n.t = 0;                       // birleşince ömrü tazelenir
        merged = true;
        break;
      }
    }
    if (!merged) {
      const n = slot(nums);
      n.x = h.x; n.y = h.y - 8; n.t = 0;
      n.dmg = h.dmg; n.crit = h.crit;
      // yatay sıçrama konumdan türer — rng'ye dokunmadan çeşitlilik
      n.vx = (tileHash(Math.round(h.x), Math.round(h.y), g.kills + 17) - 0.5) * 26;
      n.on = true;
    }

    shakeMag = Math.min(FEEL.maxShake, shakeMag + (h.crit ? FEEL.critShake : FEEL.hitShake));
    if (h.crit) freezeReq = Math.min(FEEL.freezeMax, freezeReq + FEEL.freezeCrit);
  }
  g.hits.length = 0;

  // ── ölümler → leş + sarsıntı ──
  for (let i = 0; i < g.deaths.length; i++) {
    const d = g.deaths[i];
    shakeMag = Math.min(FEEL.maxShake, shakeMag + (d.boss ? FEEL.bossDeathShake : FEEL.deathShake));
    if (d.boss) freezeReq = Math.min(FEEL.freezeMax, freezeReq + FEEL.freezeBossDeath);
    if (d.art) {
      const c = slot(corpses);
      c.x = d.x; c.y = d.y; c.t = 0; c.art = d.art; c.facing = d.facingRight; c.on = true;
    }
  }
  // ⚠️ `deaths` BURADA boşaltılmaz — render.ts'teki ölüm patlaması onu
  // kullanıyor. Tek boşaltma noktası olmalı, yoksa efektlerden biri aç kalır.

  // ── oyuncu hasarı → ekran flaşı + güçlü sarsıntı ──
  for (let i = 0; i < g.hurts.length; i++) {
    shakeMag = Math.min(FEEL.maxShake, shakeMag + FEEL.hurtShake);
    hurtFlash = FEEL.hurtLife;
    freezeReq = Math.min(FEEL.freezeMax, freezeReq + FEEL.freezeHurt);
  }
  g.hurts.length = 0;

  // ── yaşlandırma ──
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    if (!s.on) continue;
    s.t += dt;
    if (s.t >= s.life) s.on = false;
  }
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (!n.on) continue;
    n.t += dt;
    if (n.t >= FEEL.numLife) n.on = false;
  }
  for (let i = 0; i < corpses.length; i++) {
    const c = corpses[i];
    if (!c.on) continue;
    c.t += dt;
    if (c.t >= FEEL.corpseLife) c.on = false;
  }
  if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt);
  // frame bağımsız üstel sönüm
  shakeMag *= Math.pow(FEEL.shakeDecay, dt);
  if (shakeMag < 0.05) shakeMag = 0;
}

/**
 * Biriken donma isteğini AL ve sıfırla. rAF döngüsü çağırır.
 * ⚠️ Çıkışta biriken zaman `acc = 0` ile atılmalı, yoksa donma bitince
 * MAX_CATCHUP kadar tick birden koşar ve oyun ileri sıçrar.
 */
export function takeFreeze(): number {
  const f = freezeReq;
  freezeReq = 0;
  return f;
}

/**
 * Kamera sarsıntı ofseti.
 * ⚠️ SADECE dünya dönüşümüne uygulanır. Atmosfer katmanı (`drawAtmosphere`)
 * ekran uzayında çiziliyor ve oyuncunun taşıdığı ışık halesini temsil ediyor —
 * onu sarsmak kamerayı değil "gözlüğü" sallamak gibi görünür.
 */
export function shakeOffset(): { x: number; y: number } {
  // ⚠️ Kapatma BURADA, biriktirmede değil: `shakeMag` yine hesaplanıyor ama
  // kameraya uygulanmıyor. Böylece ayarı koşu ortasında açmak/kapatmak
  // anında ve tutarlı çalışıyor, hiçbir durum tutarsız kalmıyor.
  if (!shakeOn || shakeMag <= 0) return { x: 0, y: 0 };
  return {
    x: (tileHash(frameSeq, 0, 1) - 0.5) * 2 * shakeMag,
    y: (tileHash(0, frameSeq, 2) - 0.5) * 2 * shakeMag,
  };
}

/**
 * Leşler — düşmanların ALTINDA çizilir (canlıyı örtmesinler).
 * Kamera dönüşümü uygulanmış hâlde, `drawEnemies`'ten ÖNCE çağrılır.
 */
export function drawCorpses(ctx: CanvasRenderingContext2D) {
  let any = false;
  for (let i = 0; i < corpses.length; i++) if (corpses[i].on) { any = true; break; }
  if (!any) return;

  ctx.save();
  for (let i = 0; i < corpses.length; i++) {
    const c = corpses[i];
    if (!c.on) continue;
    const art = ENEMY_ART[c.art];
    if (!art?.anims.death) continue;
    // Son saniyede solar — birden yok olmak "silindi" gibi görünür
    const kalan = FEEL.corpseLife - c.t;
    ctx.globalAlpha = kalan < FEEL.corpseFade ? Math.max(0, kalan / FEEL.corpseFade) * 0.85 : 0.85;
    drawActor(ctx, art, 'death', c.t, c.x, c.y, c.facing);
  }
  ctx.restore();
}

/** Dünya uzayında çizilen efektler — kamera dönüşümü UYGULANMIŞ hâlde çağrılır */
export function drawFxWorld(ctx: CanvasRenderingContext2D) {
  // ── kıvılcımlar ──
  // Tek save/restore, tek composite ataması — ctx durum değişimi pahalı.
  let anySpark = false;
  for (let i = 0; i < sparks.length; i++) if (sparks[i].on) { anySpark = true; break; }
  if (anySpark) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (!s.on) continue;
      const art = weaponArt(s.wid).impact;
      drawCell(ctx, { ...art, size: s.size }, Math.floor(s.t * art.fps), s.x, s.y);
    }
    ctx.restore();
  }

  // ── hasar sayıları ──
  // ⚠️ Kapalıysa ÇİZİM atlanıyor, havuz yine işletiliyor (pumpFx). Havuzu
  // durdurmak, ayarı koşu ortasında açınca ekranı bir anda eski sayılarla
  // doldururdu.
  if (!numbersOn) return;
  let anyNum = false;
  for (let i = 0; i < nums.length; i++) if (nums[i].on) { anyNum = true; break; }
  if (!anyNum) return;

  ctx.save();
  // ⚠️ `shadowBlur` BURADA YASAK — tek başına 3-5 ms yiyebilir. Kontur için
  // strokeText kullanılıyor: tek geçiş, ölçülebilir maliyet.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.void;
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (!n.on) continue;
    const k = n.t / FEEL.numLife;
    const y = n.y - 30 * k;
    const x = n.x + n.vx * k;
    // Doğuşta hafif büyüme, sonunda sönme — "vurdu" hissi ilk 100 ms'de
    const pop = n.t < 0.09 ? 1 + (0.09 - n.t) * 3.2 : 1;
    const size = (n.crit ? 17 : 12.5) * pop;
    ctx.globalAlpha = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
    ctx.font = `900 ${size.toFixed(1)}px ${FONT_UI}`;
    ctx.lineWidth = 3;
    const txt = String(Math.max(1, Math.round(n.dmg)));
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = n.crit ? C.candleSoft : C.bone;
    ctx.fillText(txt, x, y);
  }
  ctx.restore();
}

/** Ekran uzayında çizilen efektler — kamera dönüşümü GERİ ALINMIŞ hâlde */
export function drawFxScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (hurtFlash <= 0) return;
  const k = hurtFlash / FEEL.hurtLife;

  // Kan vinyeti: kenarlardan içeri. Oyuncu "vuruldum" bilgisini ekranın
  // ortasına bakarken almalı — blink tek başına yetmiyordu.
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.62);
  g.addColorStop(0, 'rgba(160,18,38,0)');
  g.addColorStop(1, `rgba(160,18,38,${(0.5 * k).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// FONT.ui'yi doğrudan import etmek yerine sabit — `lib/theme` zaten import
// edildi ama font yığını uzun; her frame string birleştirmesi yapmayalım.
const FONT_UI = '"FantasyRPGtext", ui-monospace, "Courier New", monospace';

// ── PERF NOTU ─────────────────────────────────────────────────────────
// Ölçülen tavanlar (420 düşman senaryosu):
//   96 kıvılcım × drawCell   ≈ 0.30 ms
//   24 sayı × (stroke+fill)  ≈ 0.25 ms
//   1 radial gradient (vinyet, sadece hasar anında) ≈ 0.10 ms
// Toplam ≈ 0.65 ms — 16.7 ms bütçenin %4'ü.
//
// KIRMIZI ÇİZGİLER:
//   1. `ctx.shadowBlur` sıcak döngüde YASAK
//   2. `ctx.filter` sıcak döngüde YASAK (chunk'ta bedava, frame'de değil)
//   3. Havuzlarda push/pop YOK — dizi uzunlukları sabit kalmalı
//   4. Her katman tek save/restore, tek composite ataması
