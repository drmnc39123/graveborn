// Canvas çizim katmanı — simülasyona DOKUNMAZ, sadece okur.
// Kalın hatlı, gotik, düşük detay: 600 varlık çizilirken stil bütçesi düşük olmalı.
// Kural: aynı renkteki nesneler tek path'te toplanır (ctx durum değişimi pahalı).

import { C } from '@/lib/theme';
import { BOSS, BOSS_ARCH, PLAYER, RUN, WEAPON } from './config';
import type { Game, Hero } from './engine';
import { BULLET, drawActor, drawCell, ENEMY_ART, FALLEN_ART, fallenKey, FX, playerArt } from './sprites';
import { drawAtmosphere, drawStageDecor, drawStageGround, resetStageGround } from './stageGround';
import { drawCorpses, drawFxScreen, drawFxWorld, pumpFx, resetFx, shakeOffset } from './fx';
import { weaponArt } from './combatArt';
import { cosmeticById } from './cosmetics';

// ── Kozmetik efektler ──
// Render katmanında yaşar, simülasyona GİRMEZ (determinizm bozulmasın).
// Engine ölüm konumlarını kuyruğa atar, burada boşaltılır.
interface Fx { x: number; y: number; t: number }
const deathFx: Fx[] = [];
const MAX_FX = 90; // ekranda aynı anda en fazla; sürü ölümünde çizim patlamasın

/** Yeni run başlarken çağrılır — modül seviyesindeki efektler önceki run'dan taşmasın. */
export function resetEffects() {
  deathFx.length = 0;
  artTime = 0;
  resetFx();
  resetStageGround(); // yeni bölüm gelirse chunk önbelleği geçersiz
}

function pumpEffects(g: Game, dt: number) {
  for (let i = 0; i < g.deaths.length; i++) {
    if (deathFx.length >= MAX_FX) break;
    const d = g.deaths[i];
    deathFx.push({ x: d.x, y: d.y, t: 0 });
  }
  g.deaths.length = 0; // kuyruğu boşalt

  const life = FX.death.frames / FX.death.fps;
  for (let i = deathFx.length - 1; i >= 0; i--) {
    deathFx[i].t += dt;
    if (deathFx[i].t >= life) {
      deathFx[i] = deathFx[deathFx.length - 1];
      deathFx.pop();
    }
  }
}

function drawEffects(ctx: CanvasRenderingContext2D) {
  if (!deathFx.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; // patlama parlasın
  for (let i = 0; i < deathFx.length; i++) {
    const f = deathFx[i];
    drawCell(ctx, FX.death, Math.floor(f.t * FX.death.fps), f.x, f.y);
  }
  ctx.restore();
}

/** Atmosfer animasyonu için biriken süre — simülasyona GİRMEZ, kozmetik */
let artTime = 0;

/**
 * KOZMETİK HALE — Reliquary'den takılan aura.
 *
 * ⚠️ Sadece ÇİZİM. Motorun durumuna, rng'sine ve dengeye hiç dokunmaz;
 * `artTime` üzerinden nefes alıyor, o da zaten simülasyon dışı.
 * ⚠️ `shadowBlur` YOK — sıcak döngüde yasak (projenin perf kuralı). Yumuşak
 * kenar radial gradient'ten geliyor, bedava.
 */
function drawCosmeticAura(ctx: CanvasRenderingContext2D, g: Game, auraId: string | null) {
  if (!auraId) return;
  const def = cosmeticById(auraId);
  if (!def?.aura) return;
  const nefes = 1 + Math.sin(artTime * 1.7) * 0.06;
  const r = def.aura.radius * nefes;
  const grad = ctx.createRadialGradient(g.px, g.py, r * 0.28, g.px, g.py, r);
  grad.addColorStop(0, `${def.aura.color}00`);
  grad.addColorStop(0.62, `${def.aura.color}3a`);
  grad.addColorStop(1, `${def.aura.color}00`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(g.px, g.py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * CANLI BOSS ODASI — başka oyuncular.
 *
 * ⚠️ TAMAMEN KOZMETİK. Motorun ne durumuna ne rng'sine dokunuyor; bunlar
 * `Game`'in içinde YOK, ayrı bir listeden geliyor. Ödül doğrulaması "aynı
 * seed → aynı koşu" varsayımına dayanıyor; başka bir oyuncu simülasyona
 * girseydi o varsayım çökerdi.
 *
 * ⚠️ Sprite ÇİZİLMİYOR, silüet çiziliyor. Sebep tasarım: hayalet kendi
 * karakterinden AYIRT EDİLEBİLİR olmalı, yoksa oyuncu kalabalıkta hangisinin
 * kendisi olduğunu kaybeder — ve bu, dövüşen bir oyunda en can sıkıcı hata.
 */
function drawGhosts(
  ctx: CanvasRenderingContext2D,
  ghosts: readonly { n: string; x: number; y: number; f: number; a?: string }[],
) {
  if (!ghosts.length) return;
  ctx.save();
  for (const p of ghosts) {
    const aura = p.a ? cosmeticById(p.a)?.aura : undefined;
    const renk = aura?.color ?? C.ice;

    // gövde — içi boş, ince: "burada biri var" der, dikkat çalmaz
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = renk;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4, PLAYER.radius * 0.9, PLAYER.radius * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = renk;
    ctx.lineWidth = 2;
    ctx.stroke();

    // bakış yönü — küçük bir çentik, kimin nereye gittiği okunsun
    ctx.beginPath();
    ctx.moveTo(p.x + (p.f ? 6 : -6), p.y - 2);
    ctx.lineTo(p.x + (p.f ? 13 : -13), p.y + 1);
    ctx.stroke();

    // isim — küçük ve soluk; okunabilir ama sahneyi doldurmuyor
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = C.bone;
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.n, p.x, p.y - PLAYER.radius - 8);
  }
  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, dpr: number, dt = 1 / 60,
  /** takılı kozmetik hale (cosmetics.ts id) — yoksa hiçbir şey çizilmez */
  auraId: string | null = null,
  /** canlı boss odasındaki diğer oyuncular — SADECE ÇİZİLİR (bkz. drawGhosts) */
  ghosts: readonly { n: string; x: number; y: number; f: number; a?: string }[] = [],
  /**
   * Kameranın takip ettiği dövüşçü. ⚠️ 1v1'de ŞART: 1. taraf oynayan
   * oyuncunun karakteri `g.rival`; odak sabit kalsaydı kendi karakterini
   * ekranın kenarında kovalardı.
   */
  focus: Hero = g.hero,
) {
  const cx = w / 2;
  const cy = h / 2;
  artTime += dt;

  // zemin
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false; // pixel-art: nearest-neighbor ZORUNLU, yoksa bulanıklaşır
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, w, h);

  // ⚠️ pumpFx kamera dönüşümünden ÖNCE: sarsıntı büyüklüğü bu karede
  // hesaplanmalı ki translate onu kullanabilsin.
  pumpFx(g, dt);
  const sh = shakeOffset();

  // kamera oyuncuyu ortalar (+ ekran sarsıntısı)
  ctx.save();
  ctx.translate(cx - focus.px + sh.x, cy - focus.py + sh.y);

  pumpEffects(g, dt);

  drawStageGround(ctx, g.stage.def.id, focus.px, focus.py, w, h);
  drawStageDecor(ctx, g.stage.def.id, focus.px, focus.py, w, h);
  drawArenaEdge(ctx, g);
  drawGems(ctx, g);
  drawChests(ctx, g);
  // ⚠️ Leşler düşmanlardan ÖNCE — canlı düşmanı örtmemeliler
  drawCorpses(ctx);
  drawEnemies(ctx, g);
  drawBossBars(ctx, g);
  drawEffects(ctx); // ölüm patlamaları düşmanların üstünde, oyuncunun altında
  drawHitZones(ctx, g);
  drawOrbits(ctx, g);
  drawAuras(ctx, g);
  drawProjectiles(ctx, g);
  drawArcs(ctx, g);         // zincir yayları mermilerin üstünde parlar
  drawEnemyShots(ctx, g);   // oyuncunun ÜSTÜNDE değil altında: karakteri örtmesin
  // ⚠️ Hayaletler OYUNCUNUN ALTINDA: kendi karakterin her zaman en üstte
  // kalmalı, kalabalıkta seni örten bir hayalet oyunu oynanamaz yapardı.
  drawGhosts(ctx, ghosts);
  drawCosmeticAura(ctx, g, auraId);  // halenin ALTINDA kalması gereken tek şey oyuncu
  // ⚠️ RAKİP ÖNCE ÇİZİLİYOR: üst üste geldiklerinde KENDİ karakterin
  // üstte kalmalı, yoksa kalabalıkta kendini kaybediyorsun.
  if (g.rival) drawPlayer(ctx, g, g.rival === focus ? g.hero : g.rival);
  drawPlayer(ctx, g, focus);
  // Kıvılcım ve hasar sayıları EN ÜSTTE — oyuncunun altında kalırlarsa
  // vuruşun geri bildirimi kayboluyor.
  drawFxWorld(ctx);

  ctx.restore();

  // ⚠️ ATMOSFER EN SONDA, ekran uzayında. Kameradan önce çizilseydi dünyayla
  // birlikte kayardı; oyuncunun taşıdığı ışık halesi ekranda SABİT durmalı.
  drawAtmosphere(ctx, g.stage.def.id, w, h, artTime);
  // Hasar vinyeti atmosferin ÜSTÜNDE — yoksa bölümün kendi karartması
  // kırmızıyı yutar ve "vuruldum" sinyali kaybolur.
  drawFxScreen(ctx, w, h);
}

function drawArenaEdge(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.strokeStyle = 'rgba(160,18,38,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, RUN.arenaRadius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGems(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.gems.length) return;
  ctx.fillStyle = C.candle;
  ctx.beginPath();
  for (let i = 0; i < g.gems.length; i++) {
    const m = g.gems[i];
    ctx.moveTo(m.x, m.y - 5);
    ctx.lineTo(m.x + 4, m.y);
    ctx.lineTo(m.x, m.y + 5);
    ctx.lineTo(m.x - 4, m.y);
  }
  ctx.fill();
}

/** Boss sandığı — nabız gibi parlar, kaçırılmasın */
function drawChests(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.chests.length) return;
  const t = g.time;
  for (const c of g.chests) {
    const pulse = 0.72 + Math.sin(t * 5) * 0.28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 44 * pulse);
    const tint = c.evolution ? '239,167,46' : '138,151,163';
    glow.addColorStop(0, `rgba(${tint},0.5)`);
    glow.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 44 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // sandık gövdesi
    ctx.fillStyle = c.evolution ? C.candle : C.ice;
    ctx.strokeStyle = C.void;
    ctx.lineWidth = 3;
    const s = 15;
    ctx.beginPath();
    ctx.roundRect(c.x - s, c.y - s * 0.75, s * 2, s * 1.5, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,8,6,0.55)';
    ctx.fillRect(c.x - s, c.y - 2.5, s * 2, 5);
  }
}

/** Boss HP barı — üstünde isim ve can. Normal düşmanda gösterilmez. */
function drawBossBars(ctx: CanvasRenderingContext2D, g: Game) {
  for (const e of g.enemies) {
    if (!e.boss) continue;
    const b = e.boss;

    // ── GİRİŞ HALKASI: boss belirirken dokunulmaz olduğunu göstermeli,
    //    yoksa oyuncu "vuruyorum ama canı inmiyor" der ve haklıdır.
    if (b.intro > 0) {
      const k = 1 - b.intro / 2.0;
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(b.intro * 9) * 0.2;
      ctx.strokeStyle = C.blood;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 26 - k * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── TELEGRAF: "buradan çık" mesajı yarım saniyede okunmalı.
    //    Dolan daire = kalan süre.
    //
    // ⚠️ `keeper` HALKASI DİSKTEN AYRI ÇİZİLMEK ZORUNDA. Tehlike alanı aynı
    // görünüp farklı davranırsa arketip bir çeşitlilik değil, bir TUZAK olur:
    // oyuncu öğrendiği refleksle (kaç) tam da vurulacağı yere koşar. Güvenli
    // merkez BOŞ bırakılıyor — "içerisi boyanmamış" tek bakışta okunuyor.
    if (b.telegraph > 0) {
      const A = BOSS_ARCH[b.arch];
      const sure = BOSS.telegraphSec * A.telegraphMul;
      const dolu = 1 - b.telegraph / sure;
      const ic = b.arch === 'keeper' && 'innerMul' in A ? b.slamR * A.innerMul : 0;
      ctx.save();
      ctx.fillStyle = `rgba(160,18,38,${(0.10 + dolu * 0.22).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, b.slamR, 0, Math.PI * 2);
      if (ic > 0) {
        // Deliği ters yönde çizip 'evenodd' ile oyuyoruz — güvenli merkez
        // boyanmadan kalıyor.
        ctx.arc(e.x, e.y, ic, 0, Math.PI * 2, true);
      }
      ctx.fill(ic > 0 ? 'evenodd' : 'nonzero');
      // kenar: dolan yay — süre bittiğinde tam tur
      ctx.strokeStyle = C.blood;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, b.slamR, -Math.PI / 2, -Math.PI / 2 + dolu * Math.PI * 2);
      ctx.stroke();
      if (ic > 0) {
        // Güvenli çemberin kenarı — "buraya gir" çizgisi tehlike renginde
        // DEĞİL: aynı renk, "buradan çık"la karışırdı.
        ctx.strokeStyle = C.ice;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, ic, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const w = 118, h = 8;
    const x = e.x - w / 2;
    const y = e.y - e.radius - 34;
    const k = Math.max(0, e.hp / e.maxHp);

    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // Öfke fazında bar rengi değişir — oyuncu "iş ciddileşti" bilgisini
    // sayı okumadan almalı
    ctx.fillStyle = b.phase === 1 ? C.candle : C.blood;
    ctx.fillRect(x, y, w * k, h);
    // Faz eşiği çentiği: nereye kadar dövüşeceğini görsün
    ctx.fillStyle = 'rgba(227,216,192,0.5)';
    ctx.fillRect(x + w * 0.5 - 1, y - 2, 2, h + 4);
    ctx.strokeStyle = 'rgba(227,216,192,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = C.bone;
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.phase === 1 ? `${e.boss.label} · ENRAGED` : e.boss.label, e.x, y - 6);
    ctx.textAlign = 'left';
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, g: Game) {
  // Sprite'ı olanları sprite ile çiz; olmayanlar (veya görsel henüz yüklenmediyse)
  // renk bazlı daire path'ine düşer. Oyun asla boş ekran vermez.
  const byColor = new Map<string, typeof g.enemies>();
  const flashing: typeof g.enemies = [];
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (e.art) {
      // ── DÜŞMÜŞ ŞAMPİYON: boss'un görseli ARKETİPİNDEN gelir ────────
      // Boyut kademeden (`e.art` = boss_mini/mega/nightmare), silüet
      // arketipten. Eşleşme yoksa eski canavar sprite'ına düşer — yeni bir
      // boss kademesi eklenirse oyun kırılmaz, sadece eski görünür.
      const art = (e.boss && FALLEN_ART[fallenKey(e.boss.arch, e.art)]) || ENEMY_ART[e.art];
      let anim = 'walk';
      if (e.boss) {
        // ⚠️ SIRA ÖNEMLİ. Giriş > telegraf > vuruş > koşu. Telegrafı vuruş
        // flaşının altına koymak en okunaklı anı yutardı: boss tam kurulum
        // yaparken oyuncu ona vurur ve sprite sürekli `hit`e sıçrar.
        if (e.boss.intro > 0) anim = 'idle';
        else if (e.boss.telegraph > 0) anim = 'attack';
        else if (e.hitFlash > 0) anim = 'hit';
      } else if (e.hitFlash > 0 && art?.anims.hit) {
        anim = 'hit';
      }
      // ⚠️ `attack`/`hit` DÖNGÜSÜZ (loop:false) → `animT` sürekli artarsa son
      // karede donar. Telegraf kendi süresini biliyor; animasyonu telegrafın
      // BAŞINDAN saydırıyoruz ki kurulum her seferinde baştan oynasın.
      const t = e.boss && anim === 'attack'
        ? Math.max(0, BOSS.telegraphSec * BOSS_ARCH[e.boss.arch].telegraphMul - e.boss.telegraph)
        : e.animT;
      if (art && drawActor(ctx, art, anim, t, e.x, e.y, e.facingRight)) continue;
    }
    if (e.hitFlash > 0) { flashing.push(e); continue; }
    let arr = byColor.get(e.color);
    if (!arr) { arr = []; byColor.set(e.color, arr); }
    arr.push(e);
  }

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = C.void;
  for (const [color, arr] of byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      ctx.moveTo(e.x + e.radius, e.y);
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  // vuruş parlaması — kemik beyazı
  if (flashing.length) {
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    for (let i = 0; i < flashing.length; i++) {
      const e = flashing[i];
      ctx.moveTo(e.x + e.radius, e.y);
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

/** Grave Lash — kesik izi. Ömrü boyunca solar ve hafifçe genişler. */

function drawHitZones(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.hitZones.length) return;
  ctx.save();
  for (let i = 0; i < g.hitZones.length; i++) {
    const z = g.hitZones[i];
    const k = z.life / z.maxLife;      // 1 → 0
    const grow = 1 + (1 - k) * 0.18;

    // ── KURULU TUZAK (Cairn Charge) ──
    // ⚠️ YANAN ALANDAN AYRI ÇİZİLİR. İkisi de yuvarlak ve yerde duruyor, ama
    // biri "buraya basma" diğeri "buraya çek" diyor. Aynı görünselerdi oyuncu
    // kendi tuzağından kaçar, sürüyü de üstüne çekmezdi — silahın tamamı
    // sürüyü tuzağa çekmek üzerine kurulu.
    // Yanan alan DOLU ve sıcak; tuzak İÇİ BOŞ, soğuk ve nabız atıyor.
    if (z.trap) {
      const r = z.w / 2;
      const kuruldu = z.trap.arm <= 0;
      // nabız: kurulmadan hızlı, kurulunca yavaş — "hazır" hâli okunsun
      const nabiz = 0.5 + 0.5 * Math.sin(artTime * (kuruldu ? 4 : 11));
      ctx.globalAlpha = 0.35 + nabiz * 0.35;
      ctx.strokeStyle = kuruldu ? C.ice : C.boneFaint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r * (0.8 + nabiz * 0.2), 0, Math.PI * 2);
      ctx.stroke();
      // çekirdek — küçük ama katı, "burada bir şey var" sinyali
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = kuruldu ? C.ice : C.boneFaint;
      ctx.beginPath();
      ctx.arc(z.x, z.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // YERE BIRAKILAN ALAN (Consecrated Ash) — kesikten tamamen farklı okunmalı:
    // oyuncu "burası hâlâ yanıyor mu" sorusuna bir bakışta cevap verebilmeli.
    if (z.round) {
      const r = z.w / 2;
      ctx.globalAlpha = Math.min(0.85, 0.25 + k * 0.5);
      const rg = ctx.createRadialGradient(z.x, z.y, r * 0.15, z.x, z.y, r);
      rg.addColorStop(0, 'rgba(239,167,46,0.55)');
      rg.addColorStop(0.6, 'rgba(200,50,74,0.30)');
      rg.addColorStop(1, 'rgba(160,18,38,0.0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
      ctx.fill();
      // dış hat: alanın SINIRI belirsiz kalmasın, oyuncu kenarını görsün
      ctx.globalAlpha = Math.min(0.7, k);
      ctx.strokeStyle = 'rgba(239,167,46,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r * 0.96, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }

    ctx.globalAlpha = Math.min(1, k * 1.6);
    const grad = ctx.createLinearGradient(z.x - z.w / 2, z.y, z.x + z.w / 2, z.y);
    const inner = z.facingRight ? 0 : 1;
    grad.addColorStop(inner, 'rgba(227,216,192,0.0)');
    grad.addColorStop(0.5, 'rgba(239,167,46,0.55)');
    grad.addColorStop(1 - inner, 'rgba(200,50,74,0.85)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, (z.w / 2) * grow, (z.h / 2) * grow, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Litany — dönen orb'lar. Motorla AYNI formülü kullanır, yoksa görsel ile
 *  hasar noktası ayrışır ve oyuncu "vurmuyor" hisseder. */
function drawOrbits(ctx: CanvasRenderingContext2D, g: Game) {
  for (const w of g.weapons) {
    if (w.def.pattern !== 'orbit') continue;
    const area = Math.pow(w.def.areaPerLevel ?? 1, w.level - 1);
    const rad = (w.def.orbitRadius ?? 78) * area;
    const orbR = (w.def.orbRadius ?? 13) * area;
    // ⚠️ `stats.amount` DAHİL olmalı. Yoksa Echo of War / Amount alan oyuncuda
    // motor 5 orb ile vururken ekranda 3 orb görünür — hasar görünmeyen
    // noktalardan gelir ve oyuncu sebebini asla anlayamaz.
    const n = 1 + (w.def.countLevels?.filter((l) => w.level >= l).length ?? 0) + g.stats.amount;
    for (let k = 0; k < n; k++) {
      const a = g.orbitAngle + (k * Math.PI * 2) / n;
      const ox = g.px + Math.cos(a) * rad;
      const oy = g.py + Math.sin(a) * rad;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Silahın KENDİ tonu — Litany altın, evrimi Black Vespers buz mavisi.
      // Eskiden ikisi de aynı altın gradyandı, evrim görsel olarak yok sayılıyordu.
      const [tr, tg, tb] = weaponArt(w.def.id).tint;
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, orbR);
      grad.addColorStop(0, `rgba(${Math.min(255, tr + 30)},${Math.min(255, tg + 30)},${Math.min(255, tb + 30)},0.95)`);
      grad.addColorStop(0.6, `rgba(${tr},${tg},${tb},0.5)`);
      grad.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Wardsalt — yakın alan aurası. Nabız gibi atar ki tik anı okunsun. */
function drawAuras(ctx: CanvasRenderingContext2D, g: Game) {
  for (const w of g.weapons) {
    if (w.def.pattern !== 'aura') continue;
    const area = Math.pow(w.def.areaPerLevel ?? 1, w.level - 1);
    const r = (w.def.auraRadius ?? 70) * area;
    // cd 0'a yaklaşırken parlaklık artar → tik anı görünür
    const cdMax = w.def.cooldownSec;
    const pulse = 1 - Math.min(1, Math.max(0, w.cd) / cdMax);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(g.px, g.py, r * 0.35, g.px, g.py, r);
    grad.addColorStop(0, 'rgba(160,18,38,0)');
    grad.addColorStop(0.75, `rgba(200,50,74,${0.05 + pulse * 0.1})`);
    grad.addColorStop(1, `rgba(239,167,46,${0.12 + pulse * 0.22})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.px, g.py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.projectiles.length) return;
  // Sprite varsa yöne döndürerek çiz; yoksa daireye düş.
  const fallback: typeof g.projectiles = [];
  for (let i = 0; i < g.projectiles.length; i++) {
    const p = g.projectiles[i];
    // ⚠️ Her silahın KENDİ mermisi. Eskiden 16 silah tek sprite'ı paylaşıyordu
    // ve oyuncu neyi kuşandığını ekrandan anlayamıyordu.
    const art = p.wid ? weaponArt(p.wid).bullet : undefined;
    const cell = art ?? BULLET;
    // uçuş süresinden frame türet — her mermi kendi fazında, sürü senkron olmasın
    const frame = Math.floor((WEAPON.projectileLifeSec - p.life) * cell.fps) % cell.frames;
    // ⚠️ BUMERANG KENDİ EKSENİNDE DÖNER, burnu ileri gitmez. `atan2(vy,vx)`
    // ok gibi çizerdi — bumerang takla atar. `spin` verilmişse zamanla döner.
    const angle = cell.spin
      ? (WEAPON.projectileLifeSec - p.life) * cell.spin
      : Math.atan2(p.vy, p.vx);
    if (!drawCell(ctx, cell, frame, p.x, p.y, angle)) fallback.push(p);
  }
  if (!fallback.length) return;
  ctx.fillStyle = C.bone;
  ctx.beginPath();
  for (let i = 0; i < fallback.length; i++) {
    const p = fallback[i];
    ctx.moveTo(p.x + p.radius, p.y);
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * Pale Lightning yayları. Motor `arcs` kuyruğuna yazar, BURADA boşaltılır —
 * zincir anlık hasar verir, görsel olmadan oyuncu neye vurduğunu göremez.
 * Kuyruk her frame temizleniyor: yaylar tek kare parlar (şimşek gibi).
 */
function drawArcs(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.arcs.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  // iki geçiş: geniş soluk hale + ince parlak çekirdek
  for (const [width, color, alpha] of [[7, C.ice, 0.28], [2.4, C.bone, 0.95]] as const) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < g.arcs.length; i++) {
      const a = g.arcs[i];
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
    }
    ctx.stroke();
  }
  ctx.restore();
  g.arcs.length = 0;   // kuyruğu boşalt — birikirse ekran ağ gibi olur
}

/**
 * Düşman mermileri. Oyuncunun mermisinden AYRI ve KAN KIRMIZISI çizilir —
 * hangi merminin sana zarar verdiğini yarım saniyede ayırt edebilmelisin.
 * Halka + dolgu: koyu zeminde de parlak zeminde de okunur.
 */
function drawEnemyShots(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.enemyShots.length) return;
  ctx.fillStyle = C.blood;
  ctx.beginPath();
  for (let i = 0; i < g.enemyShots.length; i++) {
    const s = g.enemyShots[i];
    ctx.moveTo(s.x + s.radius, s.y);
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
  }
  ctx.fill();

  // ── MEZAR KÜRESİ: boss mermisi okçu okundan AYRILMALI ──
  // ⚠️ Aynı renk + aynı şekil, sadece daha büyük olsaydı oyuncu onu "yakın
  // bir ok" sanardı — ve boss mermisi ok gibi ihmal edilecek bir şey değil.
  // Ayrım BOYUTTAN türüyor (ayrı bir tür alanı eklemeye gerek yok): okçu oku
  // 7 px, küre 17 px. Eşik ikisinin arasında.
  const KURE = 12;
  let kureVar = false;
  for (let i = 0; i < g.enemyShots.length; i++) {
    if (g.enemyShots[i].radius < KURE) continue;
    if (!kureVar) { kureVar = true; ctx.beginPath(); }
    const s = g.enemyShots[i];
    ctx.moveTo(s.x + s.radius * 0.45, s.y);
    ctx.arc(s.x, s.y, s.radius * 0.45, 0, Math.PI * 2);
  }
  if (kureVar) {
    // İç çekirdek — kürenin kendi ağırlığı olsun, düz bir daire gibi durmasın
    ctx.fillStyle = C.candle;
    ctx.fill();
    ctx.fillStyle = C.blood;
  }
  ctx.strokeStyle = C.bloodSoft;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < g.enemyShots.length; i++) {
    const s = g.enemyShots[i];
    ctx.moveTo(s.x + s.radius + 2, s.y);
    ctx.arc(s.x, s.y, s.radius + 2, 0, Math.PI * 2);
  }
  ctx.stroke();
}

/**
 * Bir dövüşçüyü çiz.
 *
 * ⚠️ `Game` DEĞİL `Hero` alıyor ve bu 1v1 için ŞART: render bugüne kadar
 * yalnızca `g.px/py`'yi (yani birinci dövüşçüyü) çiziyordu — arena maçında
 * RAKİP HİÇ GÖRÜNMÜYORDU. Aynı fonksiyon iki kez çağrılıyor.
 */
function drawPlayer(ctx: CanvasRenderingContext2D, g: Game, h: Hero) {
  // dokunulmazlık penceresinde yanıp söner
  const blink = h.iframe > 0 && Math.floor(h.iframe * 14) % 2 === 0;

  // toplama yarıçapı
  ctx.strokeStyle = 'rgba(239,167,46,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(h.px, h.py, PLAYER.pickupRadius * h.stats.magnet, 0, Math.PI * 2);
  ctx.stroke();

  // ⚠️ ANİMASYON ÖNCELİĞİ: ölüm > hasar > saldırı > koşu > durma.
  // Motor bugüne kadar sadece run/idle çiziyordu — karakter saldırırken
  // duruyordu, hasar alınca sadece yanıp sönüyordu. Diskteki 741 kare
  // (3 saldırı, ölüm, hasar) hiç kullanılmıyordu.
  //
  // `atkT`/`hurtT` motorun SUNUM sayaçları; mantığı beslemezler.
  // Animasyon zamanı 0'dan başlamalı (loop:false, son karede donar), o yüzden
  // geçen süre = tetiklenme süresi − kalan.
  const art = playerArt(h.heroId);
  let anim = h.moving ? 'run' : 'idle';
  let animT = h.animT;
  if (g.phase === 'dead' && art.anims.death) {
    anim = 'death';
    animT = h.animT;                    // ölümde donar, son kare kalır
  } else if (h.hurtT > 0 && art.anims.hurt) {
    anim = 'hurt';
    animT = 0.32 - h.hurtT;
  } else if (h.atkT > 0 && art.anims.atk) {
    anim = 'atk';
    animT = 0.30 - h.atkT;
  }

  // sprite varsa onu çiz; dokunulmazlık penceresinde yarı saydam yanıp söner
  if (!blink) {
    if (drawActor(ctx, art, anim, animT, h.px, h.py, h.facingRight)) return;
  } else {
    ctx.save();
    ctx.globalAlpha = 0.45;
    const drawn = drawActor(ctx, art, anim, animT, h.px, h.py, h.facingRight);
    ctx.restore();
    if (drawn) return;
  }

  // görsel yüklenmediyse daireye düş
  ctx.fillStyle = blink ? C.blood : C.bone;
  ctx.strokeStyle = C.void;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(h.px, h.py, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
