// Canvas çizim katmanı — simülasyona DOKUNMAZ, sadece okur.
// Kalın hatlı, gotik, düşük detay: 600 varlık çizilirken stil bütçesi düşük olmalı.
// Kural: aynı renkteki nesneler tek path'te toplanır (ctx durum değişimi pahalı).

import { C, FONT } from '@/lib/theme';
import {
  pixelCiz, pixelFontHazir, pixelFontYukle, pixelKapsiyor, pixelOlc,
} from '@/lib/pixelFont';
import { BOSS, BOSS_ARCH, PLAYER, RUN, WEAPON } from './config';
import type { Enemy, Game, Hero } from './engine';
import {
  BULLET, DEATH_FX, deathFxKey, drawActor, drawCell, ENEMY_ART, FALLEN_ART, fallenKey,
  FX, PET_ART, playerArt, type DeathFxKey,
} from './sprites';
import { drawAtmosphere, drawStageDecor, drawStageGround, resetStageGround } from './stageGround';
import { drawCorpses, drawFxScreen, drawFxWorld, pumpFx, resetFx } from './fx';
import { weaponArt } from './combatArt';
import { cosmeticById } from './cosmetics';

// ── Kozmetik efektler ──
// Render katmanında yaşar, simülasyona GİRMEZ (determinizm bozulmasın).
// Engine ölüm konumlarını kuyruğa atar, burada boşaltılır.
// ⚠️ `k` = ölüm efekti ailesi (bkz. sprites `deathFxKey`). Kuyruktaki
// `art` anahtarından TÜRETİLİYOR; motora yeni alan eklenmedi.
interface Fx { x: number; y: number; t: number; k: DeathFxKey }
const deathFx: Fx[] = [];
const MAX_FX = 90; // ekranda aynı anda en fazla; sürü ölümünde çizim patlamasın

/** Yeni run başlarken çağrılır — modül seviyesindeki efektler önceki run'dan taşmasın. */
export function resetEffects() {
  // ⚠️ Başlık sayfasını KOŞU BAŞINDA iste. Boss ilk kez dakikalar sonra
  // geliyor; o ana kadar yüklenmiş olur ve isim kartı TTF yedeğiyle bir
  // kare bile çakmaz.
  pixelFontYukle('title', 'white');
  deathFx.length = 0;
  petFx.length = 0;   // yeni koşuya önceki koşunun patlamaları taşmasın
  artTime = 0;
  resetFx();
  resetStageGround(); // yeni bölüm gelirse chunk önbelleği geçersiz
}

function pumpEffects(g: Game, dt: number) {
  for (let i = 0; i < g.deaths.length; i++) {
    if (deathFx.length >= MAX_FX) break;
    const d = g.deaths[i];
    // ⚠️ `art` isteğe bağlı (motor tipinde `string | undefined`) — boş
    // gelirse `flesh` tabanına düşer, efekt KAYBOLMAZ.
    deathFx.push({ x: d.x, y: d.y, t: 0, k: deathFxKey(d.art ?? '', d.boss) });
  }
  g.deaths.length = 0; // kuyruğu boşalt

  for (let i = deathFx.length - 1; i >= 0; i--) {
    deathFx[i].t += dt;
    // ⚠️ ÖMÜR ARTIK EFEKT BAŞINA. Tek bir `FX.death` ömrü kullanılsaydı
    // boss patlaması (18 fps, 12 kare = 0,67 sn) erken silinir, sıçan
    // sıçraması (26 fps) gereksiz uzun yaşardı.
    const a = DEATH_FX[deathFx[i].k];
    if (deathFx[i].t >= a.frames / a.fps) {
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
    const a = DEATH_FX[f.k];
    drawCell(ctx, a, Math.floor(f.t * a.fps), f.x, f.y);
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
    // ⚠️ OYUNUN FONTU. Buradaki üç canvas metni (hayalet adı, boss
    // etiketi, köy etiketleri) sistem fontunda çiziliyordu — piksel
    // sanatın üstünde Segoe UI/Consolas. Ölçüldü: oyun fontu 10 px'te
    // sistem fontundan daha okunaklı (katı %16 vs %5) ve daha dar.
    ctx.font = `600 10px ${FONT.ui}`;
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

  // ⚠️ pumpFx kamera dönüşümünden ÖNCE kalıyor. Eski gerekçesi sarsıntıydı
  // ("büyüklük bu karede hesaplanmalı"); sarsıntı KALDIRILDI ama sıra
  // kalmalı: kozmetik kuyrukların boşaltılma ANI budur ve `settings.test`
  // aynı seed → aynı koşu mührüyle onu koruyor.
  pumpFx(g, dt);

  // kamera oyuncuyu ortalar
  ctx.save();
  ctx.translate(cx - focus.px, cy - focus.py);
  // ⚠️ Kırpma penceresi kamerayla AYNI ANDA kuruluyor — ikisi ayrışırsa
  // ekranın kenarında görünmeyen düşmanlar olur, ve bu sessiz bir hatadır.
  kirpmaKur(focus.px, focus.py, w, h);

  pumpEffects(g, dt);
  pumpPetFx(g, dt);

  // ⚠️ DERİNLİK GEÇİLİYOR. `descentStage` yeni tanımı üretirken `id: base.id`
  // yazdığı için sanat SADECE bölüme bağlıydı ve Descent'te derinlik 1 ile 60
  // birebir aynı görünüyordu. Sanat seçimi artık derinliği de biliyor
  // (`stageGround.sanat` → `descentArt`); kampanyada `depth` 1 kalıyor ve
  // hiçbir şey değişmiyor.
  drawStageGround(ctx, g.stage.def.id, focus.px, focus.py, w, h, g.stage.depth);
  drawStageDecor(ctx, g.stage.def.id, focus.px, focus.py, w, h, g.stage.depth);
  // ⚠️ IŞIK ZEMİNDEN SONRA, DÜŞMANLARDAN ÖNCE — bkz. drawTorch başlığı
  drawTorch(ctx, g, focus);
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
  // ⚠️ Pet OYUNCUDAN ÖNCE — kendi karakterin her zaman en üstte kalmalı.
  drawPetFx(ctx);
  drawPets(ctx, g.hero);
  if (g.rival) drawPets(ctx, g.rival);
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
  drawAtmosphere(ctx, g.stage.def.id, w, h, artTime, g.stage.depth);
  // ⚠️ BOSS GİRİŞİ ATMOSFERİN ÜSTÜNDE: bölümün kendi karartması isim
  // kartını yutmamalı. Ama hasar vinyetinin ALTINDA — giriş sırasında bile
  // "vuruldum" sinyali en üstte kalmalı, oyuncu o 2 saniyede hâlâ ölebilir.
  drawBossIntro(ctx, g, w, h);
  // Hasar vinyeti atmosferin ÜSTÜNDE — yoksa bölümün kendi karartması
  // kırmızıyı yutar ve "vuruldum" sinyali kaybolur.
  drawFxScreen(ctx, w, h);
}

/**
 * BOSS GİRİŞİ — ekran uzayında, `boss.intro` süresince.
 *
 * 🔴 NİYE VAR: boss'un GELİŞİ diye bir an yoktu. Motorda `intro` durumu
 * (2 sn, dokunulmaz) ZATEN VARDI ve çizim tarafı onu tek bir kırmızı
 * halkayla karşılıyordu. Sürüde 400 düşman varken 140 px'lik bir sprite'ın
 * belirmesi, oyuncunun fark etmediği bir olaydı — üstelik boss'lar sürüyle
 * AYNI sheet'leri kullanıyor (`sprites.ts`: boss_mega = monster('09')),
 * yani silüet farkı bile yok, sadece boyut.
 *
 * ⚠️ MOTORA HİÇBİR ŞEY YAZILMIYOR. Bu fonksiyon `b.intro`yu OKUYOR;
 * süreyi, dokunulmazlığı ve bitişi motor yönetiyor. `fx.ts`in kuralı
 * burada da geçerli: render → engine tek yönlü (`sim.test` [1C]).
 *
 * ⚠️ EKRAN UZAYINDA, kamera geri alındıktan SONRA. İsim kartı dünyayla
 * birlikte kaysaydı boss hareket ederken yazı da kayardı.
 *
 * ⚠️ KARARTMA SAHNEYİ YUTMUYOR. Tavan 0,42 ve giriş boyunca AZALIYOR:
 * oyuncu bu 2 saniyede hâlâ kaçıyor, sürü hâlâ üstüne geliyor. Tam
 * karartma "sinematik" olurdu ama oyuncuyu göremediği bir şeye çarptırırdı.
 */
const ARKETIP_METNI: Record<string, string> = {
  warden: 'it guards the way down',
  keeper: 'it keeps what you want',
  choir: 'it does not sing alone',
  harrower: 'it comes to you',
};

function drawBossIntro(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  let b: NonNullable<Enemy['boss']> | null = null;
  for (const e of g.enemies) {
    if (e.boss && e.boss.intro > 0) { b = e.boss; break; }
  }
  if (!b) return;

  // k: 1 → giriş başı, 0 → giriş sonu
  const k = Math.max(0, Math.min(1, b.intro / BOSS.introSec));
  // Yazı ilk %15'te girer, son %25'te çıkar — ortada sabit durur
  const yaziAlfa = Math.min(1, Math.min((1 - k) / 0.15, k / 0.25));

  ctx.save();

  // ── SAHNE KARARMASI ── boss'a bakılsın diye; giriş bitince tamamen kalkar
  ctx.fillStyle = `rgba(8,6,5,${(0.42 * k).toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);

  // ── ÜST/ALT BANTLAR ── sinema perdesi gibi AÇILIR (kapanmaz):
  // giriş başında dar, sonunda yok. Kapanan bantlar oyuncunun görüş
  // alanını tam da kaçması gereken anda daraltırdı.
  const bant = Math.round(h * 0.085 * k);
  if (bant > 0) {
    ctx.fillStyle = 'rgba(6,5,4,0.72)';
    ctx.fillRect(0, 0, w, bant);
    ctx.fillRect(0, h - bant, w, bant);
  }

  if (yaziAlfa > 0.01) {
    ctx.globalAlpha = yaziAlfa;
    ctx.textAlign = 'center';

    const cy = h * 0.36;
    // ── AD — oyunun GERÇEK başlık yüzü ──
    // ⚠️ Piksel bitmap font (bkz. `lib/pixelFont`). TTF `GBTitle` gövde
    // metniyle aynı dosyaydı; boss adı oyunun en büyük yazısı ve orada
    // hiyerarşi olmaması en çok burada göze batıyordu.
    // ⚠️ YEDEK ZORUNLU: sayfa henüz yüklenmemişse ya da ad kapsanmıyorsa
    // (küçük harf, özel karakter) TTF'e düşülür — boss adı ASLA kaybolmaz.
    const ad = b.label.toUpperCase();
    const sayfa = pixelFontHazir('title', 'white');
    const olcek = Math.max(2, Math.min(4, Math.round(w / 320)));
    if (sayfa && pixelKapsiyor(sayfa, ad)) {
      const o = pixelOlc(sayfa, ad, olcek);
      pixelCiz(ctx, sayfa, ad, w / 2 - o.w / 2, cy - o.h, olcek);
    } else {
      pixelFontYukle('title', 'white');
      ctx.fillStyle = C.bone;
      ctx.font = `700 ${Math.round(Math.min(42, w / 16))}px ${FONT.title}`;
      ctx.fillText(ad, w / 2, cy);
    }

    // Altına ince kan çizgisi
    const cizgiW = Math.min(260, w * 0.34) * (1 - k * 0.4);
    ctx.fillStyle = C.blood;
    ctx.fillRect(w / 2 - cizgiW / 2, cy + 12, cizgiW, 2);

    // Arketip satırı — boss'un NE YAPTIĞINI söyler. Dört arketibin dövüş
    // kalıbı bambaşka; adı tek başına oyuncuya hiçbir şey öğretmiyor.
    const alt = ARKETIP_METNI[b.arch];
    if (alt) {
      ctx.fillStyle = C.boneDim;
      ctx.font = `400 ${Math.round(Math.min(14, w / 52))}px ${FONT.ui}`;
      ctx.fillText(alt, w / 2, cy + 34);
    }
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'left';
  ctx.restore();
}

function drawArenaEdge(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.strokeStyle = 'rgba(160,18,38,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, RUN.arenaRadius, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * GÖRÜŞ ALANI KIRPMASI — ekranda olmayan şeyi çizme.
 *
 * ⚠️ NİYE VAR: hiç yoktu. `drawEnemies` `g.enemies` dizisinin TAMAMINI
 * geziyordu ve derin inişte o dizi 420'ye kadar çıkıyor (`DESCENT.aliveMax`).
 * 1280×720'de aynı anda ~90 düşman sığıyor — yani en kötü durumda çizimlerin
 * dörtte üçü ekran DIŞINA gidiyordu. Her biri ayrıca `sprites.ts` içinde
 * `Map.get` + `img.complete` + `naturalWidth` DOM okuması yapıyor.
 *
 * ⚠️ SİMÜLASYONA DOKUNMUYOR. Yalnız çizim atlanıyor; düşman yaşamaya,
 * vurmaya, ölmeye devam ediyor. `SIM_SEAL` bu yüzden bozulmuyor.
 *
 * ⚠️ PAY GENİŞ (`KIRP_PAY`): sprite'lar merkez noktalarından büyük çiziliyor
 * (boss 120+ px) ve gölgeleri aşağı taşıyor. Dar bir pay, kenardaki büyük
 * düşmanın yarısını kırpar — kırpmanın görünür olması, olmamasından beterdir.
 */
const KIRP_PAY = 160;
let kirpX0 = -Infinity, kirpY0 = -Infinity, kirpX1 = Infinity, kirpY1 = Infinity;

function kirpmaKur(focusX: number, focusY: number, w: number, h: number) {
  kirpX0 = focusX - w / 2 - KIRP_PAY;
  kirpX1 = focusX + w / 2 + KIRP_PAY;
  kirpY0 = focusY - h / 2 - KIRP_PAY;
  kirpY1 = focusY + h / 2 + KIRP_PAY;
}

/** Dünya noktası ekrana (paylı) düşüyor mu */
function gorunur(x: number, y: number): boolean {
  return x >= kirpX0 && x <= kirpX1 && y >= kirpY0 && y <= kirpY1;
}

/**
 * OYUNCUNUN MEŞALESİ — koşu ekranının TEK ışık yapısı.
 *
 * 🔴 NİYE EKLENDİ (canlı koşuda ölçüldü, bölüm 1 "The Hollow Wood"):
 *     renk kovası      41 / 4096
 *     luminans sapması σ = 6,1
 *     merkez / köşe    58,0 / 46,6 → oran **1,24**
 *     piksellerin %99,9'u iki komşu banda sıkışmış (0-40)
 * Yani savaş sahnesi TEK DÜZ RENKTİ. Karşılaştırma için köy gece 1,99
 * oranında ve σ 21,5 — oyuncunun en çok baktığı ekran, en düz ekrandı.
 *
 * ⚠️ `stageGround.drawAtmosphere` "hem vinyet hem meşale taşıyor hissi"
 * verdiğini söylüyor ama ölçüm bunu ÇÜRÜTTÜ: o geçişin merkez durağı
 * `a * 0.05`, yani merkezi neredeyse hiç boyamıyor — sadece KENARLARI
 * karartıyor. Karartma tek başına ışık üretmez; parlak bir çekirdek yoksa
 * tonal aralık da yoktur. Bu fonksiyon o çekirdeği ekliyor.
 *
 * ⚠️ ZEMİNİ VE DEKORU AYDINLATIR, DÜŞMANLARI DEĞİL. Çağrı sırası bilerek
 * `drawStageDecor`dan hemen sonra: düşmanlar ışığın ÜSTÜNE çiziliyor ve
 * kendi parlaklıklarını koruyor. Köydeki kararın aynısı (aktörler
 * derecelendirilmez): "nerede duruyorum" değişsin, "neyi göreceğim"
 * değişmesin. Işık düşmanları da yıkasaydı silüetler zeminle karışırdı.
 *
 * ⚠️ GRADYAN HER KARE ÜRETİLMEZ — `perf.test.mts` kare başına 12 gradient
 * tavanı koyuyor ve ölçüm şu an 10'da. Bu yüzden `glowSprite` deseninin
 * aynısı: yarıçap başına BİR KEZ pişirilip `drawImage` ile basılıyor.
 * Ekleme maliyeti bir blit; gradient sayacı değişmiyor.
 */
const mesaleCache = new Map<number, HTMLCanvasElement>();

function mesaleSprite(r: number): CanvasImageSource | null {
  if (typeof document === 'undefined') return null;
  const rr = Math.max(8, Math.round(r));
  const hit = mesaleCache.get(rr);
  if (hit) return hit;

  const size = rr * 2;
  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const o = off.getContext('2d');
  if (!o) return null;
  const gd = o.createRadialGradient(rr, rr, 0, rr, rr, rr);
  // ⚠️ DÜŞÜŞ İKİ KEZ AYARLANDI, ekranda bakılarak. İlk eğri (0,34 → %35'te
  // 0,17) alfayı yarıçapın üçte birinde YARIYA indiriyordu ve sonuç ekranda
  // görünür bir disk kenarıydı: meşale değil spot ışığı. Işığın şekli
  // görünüyorsa o artık atmosfer değil, nesne.
  // ⚠️ Düz zeminde her ışık kendi şeklini ele verir — bu sahnenin zemini
  // tek karo tipi olduğu için eğri, normalde gerekenden daha yumuşak.
  gd.addColorStop(0, 'rgba(255,206,138,0.30)');
  gd.addColorStop(0.25, 'rgba(246,180,96,0.20)');
  gd.addColorStop(0.50, 'rgba(232,158,68,0.11)');
  gd.addColorStop(0.75, 'rgba(214,132,52,0.04)');
  gd.addColorStop(1, 'rgba(200,120,40,0)');
  o.fillStyle = gd;
  o.beginPath();
  o.arc(rr, rr, rr, 0, Math.PI * 2);
  o.fill();

  // Tavan — yarıçap nefesle değişiyor, sınırsız önbellek sızıntı olurdu
  if (mesaleCache.size >= 48) {
    const ilk = mesaleCache.keys().next().value;
    if (ilk !== undefined) mesaleCache.delete(ilk);
  }
  mesaleCache.set(rr, off);
  return off;
}

/**
 * Meşale taban yarıçapı (dünya px).
 * ⚠️ 330'DAN BÜYÜTÜLDÜ: dar yarıçap ışığı sahneye karıştırmıyor, sahnenin
 * ortasına bir daire koyuyordu. Geniş ve zayıf, dar ve güçlüden daha çok
 * atmosfer üretiyor.
 */
const MESALE_R = 430;

function drawTorch(ctx: CanvasRenderingContext2D, g: Game, h: Hero) {
  // ⚠️ Yarıçap KADEMELİ değişiyor (8 px adım): her karede birkaç piksel
  // oynasaydı önbellek her karede yeni bir sprite pişirir ve tavanı
  // döndürüp dururdu — önbellek değil, öğütücü olurdu.
  const nefes = 1 + Math.sin(g.time * 1.9) * 0.03 + Math.sin(g.time * 0.8) * 0.018;
  const r = Math.round((MESALE_R * nefes) / 8) * 8;
  const sp = mesaleSprite(r);
  if (!sp) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(sp, h.px - r, h.py - r, r * 2, r * 2);
  ctx.restore();
}

/**
 * PİŞİRİLMİŞ PARILTI — yörünge küresi gibi radyal parıltılar için.
 *
 * ⚠️ NİYE VAR: `drawOrbits` her karede küre BAŞINA bir `createRadialGradient`
 * + üç `addColorStop` + üç şablon dizesi üretiyordu. `stats.amount` +5 olan
 * bir build'de tek yörünge silahı için kare başına **7 gradient + 21 dize**.
 * Motorun titizlikle kaçındığı GC baskısını çizim tarafı geri getiriyordu.
 *
 * ⚠️ NİYE ÖNBELLEKLENEBİLİR: küre HER KARE başka yerde ama GÖRÜNÜMÜ aynı —
 * radyal gradyan öteleme altında değişmez. Bir kez küçük bir tuvale pişirip
 * konuma `drawImage` ile basmak birebir aynı pikselleri verir.
 *
 * ⚠️ Anahtar tona VE yarıçapa bağlı: evrimleşmiş silah farklı ton kullanıyor
 * (Litany altın, Black Vespers buz mavisi) ve alan pasifleri yarıçapı
 * büyütüyor. Tek anahtar kullanmak evrimi görsel olarak yok sayardı.
 */
const glowCache = new Map<string, HTMLCanvasElement>();

function glowSprite(tr: number, tg: number, tb: number, r: number): CanvasImageSource | null {
  if (typeof document === 'undefined') return null;
  const rr = Math.max(2, Math.round(r));
  const key = `${tr},${tg},${tb}|${rr}`;
  const hit = glowCache.get(key);
  if (hit) return hit;

  const size = rr * 2;
  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const o = off.getContext('2d');
  if (!o) return null;
  const gd = o.createRadialGradient(rr, rr, 0, rr, rr, rr);
  gd.addColorStop(0, `rgba(${Math.min(255, tr + 30)},${Math.min(255, tg + 30)},${Math.min(255, tb + 30)},0.95)`);
  gd.addColorStop(0.6, `rgba(${tr},${tg},${tb},0.5)`);
  gd.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
  o.fillStyle = gd;
  o.beginPath();
  o.arc(rr, rr, rr, 0, Math.PI * 2);
  o.fill();

  // ⚠️ Tavan — ton × yarıçap kombinasyonu teoride sınırsız (alan pasifi her
  // seviyede yarıçapı değiştiriyor). Sınırsız önbellek uzun oturumda sessiz
  // bir bellek sızıntısıdır; `stageGround` ile aynı duruş.
  if (glowCache.size >= 64) {
    const ilk = glowCache.keys().next().value;
    if (ilk) glowCache.delete(ilk);
  }
  glowCache.set(key, off);
  return off;
}

function drawGems(ctx: CanvasRenderingContext2D, g: Game) {
  if (!g.gems.length) return;
  ctx.fillStyle = C.candle;
  ctx.beginPath();
  for (let i = 0; i < g.gems.length; i++) {
    const m = g.gems[i];
    if (!gorunur(m.x, m.y)) continue;   // ekran dışı mücevher path'e girmesin
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
    ctx.font = `700 11px ${FONT.ui}`;
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
    if (!gorunur(e.x, e.y)) continue;   // ekran dışı — çizme (bkz. gorunur)
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
      // ⚠️ Kare başına gradient YOK — parıltı ton+yarıçap başına bir kez
      // pişiyor (bkz. `glowSprite`). Piksel çıktısı birebir aynı.
      const gl = glowSprite(tr, tg, tb, orbR);
      if (gl) {
        ctx.drawImage(gl, ox - orbR, oy - orbR, orbR * 2, orbR * 2);
      } else {
        // Node/SSR: `document` yok — testler ve sunucu tarafı için yedek yol
        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, orbR);
        grad.addColorStop(0, `rgba(${Math.min(255, tr + 30)},${Math.min(255, tg + 30)},${Math.min(255, tb + 30)},0.95)`);
        grad.addColorStop(0.6, `rgba(${tr},${tg},${tb},0.5)`);
        grad.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
        ctx.fill();
      }
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
    if (!gorunur(p.x, p.y)) continue;   // ekran dışı mermi çizilmesin
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
/**
 * BAĞLANMIŞ YOLDAŞLAR (bkz. pets.ts).
 *
 * ⚠️ OYUNCUNUN ALTINDA ÇİZİLİR. Kendi karakterin her zaman en üstte kalmalı;
 * yanındaki yaratık seni örterse kalabalıkta kendini kaybedersin — hayalet
 * çiziminde alınan dersin aynısı.
 *
 * ⚠️ Pet sprite'ı düşman sprite'ıyla AYNI paketten geliyor (kurgu gereği:
 * bağladığın düşman). Karışmasın diye üç ayrı sinyal var: daha küçük
 * çiziliyor, oyuncuya yapışık duruyor ve ayağında bir bağ halkası var.
 */
/**
 * Kozmetik saat — SADECE çizim. Motora hiç girmiyor, `rng`ye dokunmuyor;
 * yoldaş işaretinin nefes alması için tek ihtiyaç bu.
 */
let petT = 0;

function drawPets(ctx: CanvasRenderingContext2D, h: Hero) {
  if (!h.pets.length) return;
  for (let i = 0; i < h.pets.length; i++) {
    const p = h.pets[i];

    // ── "BU BENİM" İŞARETİ ──
    //
    // ⚠️ NİYE BU KADAR GÜÇLÜ: pet, düşmanlarla AYNI topdown sayfalarından
    // çiziliyor — bu kurucu bir karar ("pet = bağladığın düşman"). Bedeli
    // şu: sürünün ortasında yoldaş bir düşmandan AYIRT EDİLEMİYOR. Eski
    // işaret alpha 0,35'lik ince bir buz elipsiydi ve zeminde kayboluyordu;
    // oyuncunun gördüğü "yanımda yürüyen bir şey"di.
    //
    // Üç katman, üçü de sprite'tan BAĞIMSIZ okunuyor:
    const nefes = 0.5 + 0.5 * Math.sin(petT * 2.6 + i * 1.7);

    // 1) altında sıcak bir kuyu — kırmızı tonlu düşmanlardan ayırır
    const g = ctx.createRadialGradient(p.x, p.y + 4, 0, p.x, p.y + 4, 18);
    g.addColorStop(0, `rgba(239,167,46,${0.20 + nefes * 0.10})`);
    g.addColorStop(1, 'rgba(239,167,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2) bağ halkası — eskisinin aynısı ama görülebilir
    ctx.globalAlpha = 0.55 + nefes * 0.2;
    ctx.strokeStyle = C.candle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3, 12, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const art = PET_ART[p.def.art];
    const cizildi = art
      ? drawActor(ctx, art, p.anim, p.animT, p.x, p.y, p.facingRight)
      : false;
    if (!cizildi) {
      // görsel gelmediyse daire — oyun asla boş kare vermez
      ctx.fillStyle = C.ice;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3) başının üstünde küçük bir elmas — türün en okunur "dost" sinyali.
    //    ⚠️ SPRITE'IN ÜSTÜNE çiziliyor, altına değil; yoksa yoldaş kalabalığın
    //    arkasına geçtiğinde işaret de kayboluyor ve tam ihtiyaç anında
    //    işe yaramıyor.
    const uy = p.y - 20 - nefes * 2;
    ctx.fillStyle = C.candle;
    ctx.beginPath();
    ctx.moveTo(p.x, uy - 4);
    ctx.lineTo(p.x + 3, uy);
    ctx.lineTo(p.x, uy + 4);
    ctx.lineTo(p.x - 3, uy);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Pet alan patlamaları. Motor "nerede patladı"yı kuyruğa atıyor, hasar zaten
 * uygulandı — burası sadece görünürlük. Kuyruk BURADA boşaltılıyor (tek
 * boşaltma noktası kuralı).
 */
const petFx: { x: number; y: number; r: number; t: number }[] = [];
const PET_FX_SURE = 0.34;

// Striker vuruş çizgisi ve warden koruma darbesi — aynı kural, ayrı havuz.
const petStrikeFx: { x0: number; y0: number; x1: number; y1: number; t: number }[] = [];
const petWardFx: { x: number; y: number; t: number }[] = [];
// ⚠️ ÖLÇÜLDÜ: silah çarpma efektleri 12 kare / 26 fps = 0,46 sn sürüyor.
// İlk denemede 0,18 yazmıştım — pet zaten 4 kat daha SEYREK vuruyor
// (60 sn'de 17'ye karşı 75), üstüne efekti 2,5 kat kısa olunca görünmezlik
// katlanıyordu. 0,3 hâlâ bir kamçı gibi çakıyor ama fark ediliyor.
const STRIKE_SURE = 0.3;
const WARD_SURE = 0.5;      // uzun: iyileşme fark edilmeli

function pumpPetFx(g: Game, dt: number) {
  petT += dt;
  for (let i = 0; i < g.petBlasts.length; i++) {
    if (petFx.length >= 24) break;
    const b = g.petBlasts[i];
    petFx.push({ x: b.x, y: b.y, r: b.r, t: 0 });
  }
  g.petBlasts.length = 0;
  for (let i = petFx.length - 1; i >= 0; i--) {
    petFx[i].t += dt;
    if (petFx[i].t >= PET_FX_SURE) { petFx[i] = petFx[petFx.length - 1]; petFx.pop(); }
  }

  for (let i = 0; i < g.petStrikes.length; i++) {
    if (petStrikeFx.length >= 24) break;
    const b = g.petStrikes[i];
    petStrikeFx.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, t: 0 });
  }
  g.petStrikes.length = 0;
  for (let i = petStrikeFx.length - 1; i >= 0; i--) {
    petStrikeFx[i].t += dt;
    if (petStrikeFx[i].t >= STRIKE_SURE) { petStrikeFx[i] = petStrikeFx[petStrikeFx.length - 1]; petStrikeFx.pop(); }
  }

  for (let i = 0; i < g.petWards.length; i++) {
    if (petWardFx.length >= 12) break;
    const b = g.petWards[i];
    petWardFx.push({ x: b.x, y: b.y, t: 0 });
  }
  g.petWards.length = 0;
  for (let i = petWardFx.length - 1; i >= 0; i--) {
    petWardFx[i].t += dt;
    if (petWardFx[i].t >= WARD_SURE) { petWardFx[i] = petWardFx[petWardFx.length - 1]; petWardFx.pop(); }
  }
}

function drawPetFx(ctx: CanvasRenderingContext2D) {
  if (!petFx.length && !petStrikeFx.length && !petWardFx.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 2;
  for (let i = 0; i < petFx.length; i++) {
    const f = petFx[i];
    const k = f.t / PET_FX_SURE;
    // dışa açılan tek halka — sürü ortasında okunaklı, ekranı doldurmuyor
    ctx.globalAlpha = (1 - k) * 0.55;
    ctx.strokeStyle = C.ice;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * (0.35 + k * 0.65), 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── STRIKER VURUŞ ÇİZGİSİ ──
  // ⚠️ Silah mermilerinden AYRIŞMALI: mermiler sprite, bu bir çizgi.
  // Yoldaşın vuruşu "bir şey uçtu" değil "bir şey uzandı" gibi okunmalı.
  for (let i = 0; i < petStrikeFx.length; i++) {
    const f = petStrikeFx[i];
    const k = f.t / STRIKE_SURE;
    // çizgi hedeften geriye doğru siliniyor — yön duygusu veriyor
    const gx = f.x0 + (f.x1 - f.x0) * k * 0.85;
    const gy = f.y0 + (f.y1 - f.y0) * k * 0.85;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = C.candle;
    ctx.lineWidth = 2.5 * (1 - k * 0.5);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(f.x1, f.y1);
    ctx.stroke();
    // uçta küçük bir çakma
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.arc(f.x1, f.y1, 3 * (1 - k), 0, Math.PI * 2);
    ctx.fill();
  }

  // ── WARDEN KORUMA DARBESİ ──
  // Oyuncunun üstünde YUKARI çıkan halka: hasar değil, koruma olduğu
  // yönden anlaşılsın (patlamalar dışa açılıyor, bu yukarı süzülüyor).
  for (let i = 0; i < petWardFx.length; i++) {
    const f = petWardFx[i];
    const k = f.t / WARD_SURE;
    ctx.globalAlpha = (1 - k) * 0.5;
    ctx.strokeStyle = C.ok;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y - k * 22, 16 + k * 10, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * SALDIRI KADEMESİ — karakterin sallayışı build güçlendikçe büyür.
 *
 * 🔴 NİYE VAR: dört kahramanın dördünde de `2_atk` ve `3_atk` şeritleri
 * diskte duruyordu ve hiçbiri bildirilmiyordu (toplam 148 kare). Oyuncunun
 * build'i bir koşuda 20 kat güçlenirken karakterin sallayışı ilk saniyedeki
 * ile aynı kalıyordu — güçlenmenin karakterde HİÇ karşılığı yoktu.
 *
 * ⚠️ ÖLÇÜT SİLAH SEVİYESİ, OYUNCU SEVİYESİ DEĞİL. Oyuncu seviyesi pasif de
 * alarak yükseliyor; "sallayışım büyüdü" sinyali SİLAHIN büyümesine
 * bağlanmalı, yoksa hareket yalan söyler.
 *
 * ⚠️ EVRİM DOĞRUDAN EN ÜST KADEME. Evrim bu oyunda nadir (ölçüldü:
 * makul oyuncuda ~0,1 koşu başına) ve en büyük yükseliş anı; olduğunda
 * karakter bunu göstermeli.
 *
 * ⚠️ TAMAMEN OKUMA. Motorun `weapons` dizisine bakıyor, hiçbir şey yazmıyor;
 * eşikler dengeye DEĞMİYOR, yalnız hangi klibin oynayacağını seçiyor.
 * `sim.test` [1C] tek yönlü bağı mühürlüyor.
 */
function saldiriKademesi(h: Hero): 'atk' | 'atk2' | 'atk3' {
  let enYuksek = 0;
  for (const w of h.weapons) {
    if (w.def.evolved) return 'atk3';
    if (w.level > enYuksek) enYuksek = w.level;
  }
  if (enYuksek >= 5) return 'atk3';
  if (enYuksek >= 3) return 'atk2';
  return 'atk';
}

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
  } else if (h.atkT > 0) {
    // ⚠️ SEÇİLEN KLİP YOKSA TABANA DÜŞ. `atk2`/`atk3` yeni bildirildi; bir
    // kahramanda eksik kalırsa karakter saldırırken DURMAMALI.
    const kademe = saldiriKademesi(h);
    const secilen = art.anims[kademe] ? kademe : 'atk';
    if (art.anims[secilen]) {
      anim = secilen;
      animT = 0.30 - h.atkT;
    }
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
