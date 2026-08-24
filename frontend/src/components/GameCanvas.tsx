'use client';
// Motor ile React arasındaki köprü. Simülasyon ref'lerde yaşar — React state'i
// her frame güncellemek 60Hz'de re-render fırtınası yaratır, o yüzden HUD ~10Hz'de
// ayrıca örneklenir. Oyun döngüsü React render döngüsünden BAĞIMSIZ.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type RunMode } from '@/game/engine';
import type { RunResult } from '@/game/progress';
import { render, resetEffects } from '@/game/render';
import { MAX_CATCHUP, TICK, type StageDef, type StatKey, RUN_VIEW } from '@/game/config';
import { takeFreeze } from '@/game/fx';

// Günlük seed — aynı gün aynı bölüm herkeste aynı akışı verir (adil kıyas)
function dailySeed() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
import { seedFromString } from '@/game/rng';
import { descentBant } from '@/game/stageArt';

import { preloadAll } from '@/game/sprites';
import { installAudioUnlock, isSoundEnabled, play, setSoundEnabled, unlockAudio } from '@/game/sfx';
import type { RunPet } from '@/game/pets';
import { C, FONT, glass } from '@/lib/theme';
import { Banner, Bar, Orb, Slot, PixelButton, BTN, CooldownRing, Icon, preloadKit } from '@/components/ui/kit';
import { Reveal, motionOff } from '@/components/ui/motion';
import { LevelUpCard } from '@/components/LevelUpCard';
import { passiveIcon, weaponArt } from '@/game/combatArt';
import { loadSeenHints, markHintSeen, nextHint, type HintDef } from '@/game/tutorial';
import { joinBossRoom, type PresenceHandle } from '@/lib/presence';
import { isTestMode } from '@/lib/testMode';

/**
 * Bant eşiğinde gösterilen tek satır.
 *
 * ⚠️ SÜS DEĞİL: her satır o bantta EKRANDA GERÇEKTEN OLAN değişimi tarif
 * ediyor (bkz. `stageArt.descentArt` — ışık düşer, zemin katakomba döner,
 * enkaz kemiğe/tabuta kayar). Uydurma bir "kehanet" yazmak, oyuncuya
 * olmayan bir mekanik vaat etmek olurdu.
 */
const BANT_METNI = [
  '',                              // bant 0 — taban, eşik yok
  'The light thins',
  'Soil gives way to stone',
  'The dead are stacked here',
  'Nothing living has been this deep',
] as const;

interface Hud {
  time: number; hp: number; maxHp: number; level: number;
  xp: number; xpNext: number; kills: number; rareGold: number;
  enemies: number; phase: string; fps: number;
  mode: RunMode; depth: number; deepestCleared: number;
  offers: { id: string; name: string; desc: string; kind: string; level?: number }[];
  weapons: { id: string; name: string; level: number; cd: number; cdMax: number }[];
  passives: { id: string; name: string; level: number }[];
  revives: number;
  /** KALAN diriliş hakkı — `revives` harcanmışı sayar, bu kalanı */
  revivalLeft: number;
  evolution: { name: string; at: number } | null;
  stageName: string;
  stageTotal: number;
  remaining: number;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function GameCanvas({ stage, permanent, mode = 'campaign', hero, seed, startDepth = 1, ascension = 0, aura = null, timeLimitSec, livePresence = false, duelTarget, allowedWeapons, pets, onFinish }: {
  stage: StageDef;
  /** Forge'dan gelen kalıcı bonuslar — run BAŞLARKEN dondurulur */
  permanent?: Partial<Record<StatKey, number>>;
  /** campaign = bitirilebilir bölüm · descent = sonsuz derinlik merdiveni */
  mode?: RunMode;
  /** seçili karakter — başlangıç silahını ve istatistik eğilimini belirler */
  hero?: string;
  /**
   * Koşunun seed'i. Cüzdan modunda SUNUCUDAN gelir (`/run/start`).
   * Verilmezse demo davranışı: günlük seed istemcide türetilir.
   */
  seed?: number;
  /**
   * Descent'in başlayacağı derinlik (checkpoint). ⚠️ SUNUCUDAN gelir
   * (`/run/start` yanıtı) — burada hesaplanmaz, yoksa oynanan koşu ile
   * sunucunun doğruladığı koşu ayrışır.
   */
  startDepth?: number;
  /** ⚠️ SUNUCUNUN onayladığı kademe — istemcinin isteği değil */
  ascension?: number;
  /**
   * Oyuncunun AÇMIŞ olduğu taban silahlar (bkz. game/unlocks.ts).
   * ⚠️ Verilmezse kilit YOK — motorun varsayılanı "hepsi açık".
   */
  allowedWeapons?: readonly string[];
  /**
   * Koşuya giren bağlanmış yoldaşlar (bkz. pets.ts).
   * ⚠️ Verilmezse pet YOK — motorun eski davranışı bit bit korunur.
   */
  pets?: readonly RunPet[];
  /**
   * Takılı kozmetik hale (cosmetics.ts id). SADECE GÖRÜNÜR — motora hiç
   * girmez, `render`'a ayrı parametre olarak veriliyor. Denge etkisi yok.
   */
  aura?: string | null;
  /**
   * Koşuyu bu sürede kapat (saniye). Haftalık boss odası için: orada bölüm
   * "bitmiyor", oyuncu 5 dakika vurup çıkıyor.
   * ⚠️ Motora DOKUNMUYOR — `RUN.durationSec` motorun kendi takılma koruması,
   * bu ise moda özel bir oturum sınırı. İkisini karıştırmak, motorun
   * güvenlik tavanını moda göre değiştirmek olurdu.
   */
  timeLimitSec?: number;
  /**
   * Düello hedefi — GEÇİLMESİ gereken derinlik.
   *
   * ⚠️ HUD'DA GÖRÜNMESİ ŞART. İlk sürümde yoktu ve oyun oynanabilir hâldeyken
   * fark edildi: düellodayken ekranda hedefin izi bile yoktu, oyuncu "kaçı
   * geçmem lazım" sorusunu akılda tutmak zorundaydı. Bir düellonun TEK
   * anlamlı sayısı bu.
   */
  duelTarget?: number;
  /**
   * Canlı boss odası: diğer oyuncular görünsün mü.
   * ⚠️ SADECE ÇİZİM — hayaletler motora hiç girmiyor (bkz. lib/presence.ts).
   * Bağlantı kurulamazsa oyun normal devam eder.
   */
  livePresence?: boolean;
  onFinish: (result: RunResult) => void;
}) {
  // ⚠️ Seed'i istemcide türetmek "en kârlı günü bul, sistem saatini ona kur"
  // saldırısına açıktır — motor DOM'suz olduğu için offline aranabilir.
  // Bu yüzden cüzdan modunda seed sunucudan gelir; aşağıdaki türetme SADECE
  // kayıtsız demo içindir (orada kazanılan gold ekonomiye girmiyor).
  const seedText = `${mode}:${stage.id}:${dailySeed()}`;
  const runSeed = seed ?? seedFromString(seedText);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  // Bonusları ref'te tutuyoruz: dep dizisine koyarsak her render'da yeni nesne
  // kimliği gelir ve oyun kendini yeniden başlatır. Run başında okunması yeterli.
  const permRef = useRef(permanent);
  permRef.current = permanent;
  // Hale ref'te: bonuslardaki gerekçenin aynısı — dep dizisine koymak her
  // render'da oyunu yeniden başlatırdı. Kozmetik olduğu için koşu ortasında
  // değişmesi de zararsız.
  const auraRef = useRef(aura);
  auraRef.current = aura;
  const limitRef = useRef(timeLimitSec);
  limitRef.current = timeLimitSec;
  /** canlı oda tutamağı — koşu boyunca yaşar, koşu bitince kapanır */
  const roomRef = useRef<PresenceHandle | null>(null);
  /** görünen ipucu — ref'te, çünkü döngü her karede okuyor */
  const hintRef = useRef<{ def: HintDef; at: number } | null>(null);
  const seenRef = useRef<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef({ active: false, dx: 0, dy: 0 });
  const [hud, setHud] = useState<Hud | null>(null);
  const [runId, setRunId] = useState(0); // artırınca yeni run başlar
  const [muted, setMuted] = useState(false);
  /** çıkış onayı açık mı — açıkken simülasyon DURUR (bkz. döngüdeki pausedRef) */
  const [confirmExit, setConfirmExit] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = confirmExit;

  const choose = useCallback((id: string) => {
    gameRef.current?.choose(id);
  }, []);

  /** Koşuyu köye taşı. Ödülü İSTEMCİ hesaplamaz — progress.ts yapar. */
  const finish = useCallback(() => {
    const g = gameRef.current;
    onFinish({
      mode: g?.stage.mode ?? mode,
      stageId: g?.baseStageId ?? stage.id,
      cleared: g?.phase === 'won',
      deepestCleared: g?.stage.deepestCleared ?? 0,
      rareGold: Math.floor(g?.rareGold ?? 0),
      bossDamage: Math.floor(g?.bossDamage ?? 0),
    });
  }, [onFinish, mode, stage.id]);

  // Derinlik değişince banner'ı tetikle (oyun zamanı damgası — duraklamada kaymaz)
  const [depthFlash, setDepthFlash] = useState(0);
  /**
   * Bu geçişte BANT da değişti mi.
   *
   * ⚠️ Bantlar sanatın değiştiği yer (`stageArt.descentArt`): zemin, renk, sis
   * ve enkaz orada başkalaşıyor. Her derinlikte aynı kartı göstermek o anı
   * sıradanlaştırıyordu — 10 derinlikte bir gelen gerçek eşik ayrı okunmalı.
   */
  const [bantDegisti, setBantDegisti] = useState(false);
  const lastDepth = useRef(0);
  const lastBant = useRef(0);
  useEffect(() => {
    if (!hud || hud.mode !== 'descent') return;
    if (hud.depth !== lastDepth.current) {
      lastDepth.current = hud.depth;
      const b = descentBant(hud.depth);
      setBantDegisti(b !== lastBant.current);
      lastBant.current = b;
      if (hud.depth > 1) setDepthFlash(hud.time);
    }
  }, [hud]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    setConfirmExit(false);  // "Try Again" sonrası duraklama takılı kalmasın
    preloadAll(hero); // sprite'ları erken istemeye başla (yüklenene kadar daireye düşer)
    preloadKit();     // HUD'un çerçeveleri de aynı anda istensin
    const game = new Game(runSeed, stage, permRef.current ?? {}, mode, hero, startDepth, ascension, allowedWeapons ?? null, pets ?? []);

    /**
     * 🔴 GÖRÜŞ ALANI HER KOŞUDA MÜHÜRLENİYOR — pencere boyutu oyunu
     * değiştiremesin.
     *
     * `lockViewport`ın kendi başlığı şunu söylüyordu: "görüş alanı
     * SİMÜLASYONU etkiliyor — doğum halkasının yarıçapı buradan geliyor,
     * yani PENCERE BOYUTU dünyayı değiştiriyor. Solo'da zararsız (herkes
     * kendi koşusunu oynuyor) ama 1v1'de ölümcül." Arena bu yüzden
     * mühürlüyordu.
     *
     * ⚠️ "SOLO'DA ZARARSIZ" DOĞRU DEĞİLMİŞ ve ölçüldü. Aynı seed, 60 sn:
     *     1280×720  84 öldürme   ← TÜM denge ölçümlerinin tabanı
     *     1920×1080 77           −%8
     *     2560×1440 66           −%21
     * Kampanya "3,6 saat", ekonomi "102 saat", Forge eğrisi — hepsi
     * `setViewport(1280, 720)` ile ölçülmüş. Yani 1440p'de oynayan oyuncu
     * ÖLÇÜLMEMİŞ bir oyun oynuyordu: daha seyrek saha, daha yavaş XP, daha
     * yavaş gold, daha uzun kampanya. Solo'da "zararsız" değil, sadece
     * GÖRÜNMEZ.
     *
     * ⚠️ İki şeyi aynı anda düzeltiyor: adaleti (düello/sıralama aynı koşuyu
     * vaat ediyor) ve DOĞRULUĞU (oyun artık kendi ölçümleriyle uyumlu).
     * ⚠️ BEDELİ: geniş ekranda düşmanlar kenarın bir miktar içinde beliriyor.
     * Kullanıcı bu bedeli bilerek kabul etti.
     * ⚠️ `RUN_VIEW` değeri `config.ts`te ve denge sabiti sayılıyor —
     * değiştirmek tüm ölçümleri geçersiz kılar.
     */
    game.lockViewport(RUN_VIEW.w, RUN_VIEW.h);

    gameRef.current = game;
    // GELİŞTİRME KANCASI — üretimde YOK. Otomatik doğrulamada tarayıcı kare
    // üretimini kıstığı için oyunu gerçek zamanda oynayıp level-up/ölüm gibi
    // ekranlara ulaşmak pratik değil; bu kanca onları doğrudan tetikletir.
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __gbGame?: Game }).__gbGame = game;
    }
    resetEffects(); // önceki run'ın patlamaları yeni run'a taşmasın
    // ⚠️ Görülenler HER KOŞUDA yeniden okunur: oyuncu ayarlardan sıfırlarsa
    // bir sonraki koşuda ipuçları geri gelmeli.
    seenRef.current = loadSeenHints();
    hintRef.current = null;
    setHint(null);

    // ⚠️ SADECE boss odasında bağlanılıyor. Descent/kampanya koşusunda başka
    // oyuncuları göstermek anlamsız: herkes kendi bölümünde, aynı yerde
    // değiller — hayaletler yanıltıcı olurdu.
    roomRef.current = livePresence ? joinBossRoom() : null;

    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2); // 2'nin üstü mobilde bedava fps kaybı
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      game.setViewport(cssW, cssH);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── girdi ──
    // Tarayıcı otomatik oynatmayı engeller — ilk kullanıcı hareketinde aç.
    // Bu olmadan ses hiç çalmaz ve sebebi de görünmez (sessiz başarısızlık).
    // ⚠️ Ortak yardımcı — `{once:true}` ile elle kurulmuştu ve o kurulum
    // bağlam çalışmadan tetiklenirse sesi kalıcı olarak öldürüyordu
    // (bkz. sfx.installAudioUnlock başlığı). İki kopya da olmamalı.
    const sesKilidiniKaldir = installAudioUnlock();

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
      // level-up'ta 1/2/3 ile seçim
      if (game.phase === 'levelup' && ['1', '2', '3'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const o = game.offers[idx];
        if (o) game.choose(o.id);
      }
      // ESC = çıkış onayı (aç/kapa). Koşu sürerken oyuncunun kaçış yolu olmalı.
      if (e.key === 'Escape' && game.phase === 'running') {
        e.preventDefault();
        setConfirmExit((v) => !v);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // dokunmatik: ekrana basılan yer merkez, sürükleme yön verir (sanal joystick)
    let touchOrigin = { x: 0, y: 0 };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchOrigin = { x: t.clientX, y: t.clientY };
      stickRef.current = { active: true, dx: 0, dy: 0 };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!stickRef.current.active) return;
      const t = e.touches[0];
      const dx = t.clientX - touchOrigin.x;
      const dy = t.clientY - touchOrigin.y;
      const max = 46; // bu mesafede tam hız
      const m = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, m / max) / m;
      stickRef.current = { active: true, dx: dx * k, dy: dy * k };
      e.preventDefault();
    };
    const onTouchEnd = () => { stickRef.current = { active: false, dx: 0, dy: 0 }; };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    // ── döngü: sabit timestep + akümülatör ──
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let freeze = 0;   // hit-stop kalan süresi (sn)
    let hudAcc = 0;
    let frames = 0;
    let fpsTimer = 0;
    let fps = 0;

    /**
     * ⚠️ TEST MODUNDA ELLE KARE SÜRME — köydekiyle aynı gerekçe.
     *
     * Sekme/panel arka plandayken `requestAnimationFrame` DURUYOR ve koşu
     * ilk karesinde donuyor: ekran görüntüsünde savaş hiç görünmüyor.
     * Görsel iş bu yüzden köyde iki kez tıkandı; savaşta da tıkanmasın.
     *
     * ⚠️ `game.step()` GERÇEK TICK ile çağrılıyor (TICK sabiti), rastgele bir
     * dt ile değil — simülasyon deterministik ve mühürlü; farklı bir adımla
     * sürmek ekranda GERÇEKTE OLMAYAN bir koşu gösterirdi.
     * ⚠️ Üretimde derlenmiyor (`isTestMode` production'da sabit false).
     */
    if (isTestMode()) {
      // ⚠️ GİRDİ DE VERİLEBİLİYOR: oyuncu hareket etmezse XP küreleri yerde
      // kalıyor ve koşu hiç seviye atlamıyor — 1800 kare sürdüm, level-up
      // gelmedi. Bir savaşı incelemek için oyuncunun YÜRÜMESİ gerekiyor.
      (window as unknown as {
        __gbKosuKare?: (n?: number, ix?: number, iy?: number) => unknown;
      }).__gbKosuKare = (n = 1, ix = 0, iy = 0) => {
        // ⚠️ ADIMLA ÇOK, ÇİZ BİR KEZ. Her adımda çizmek 900 karede tarayıcıyı
        // kilitliyordu (ekran görüntüsü 30 sn'de zaman aşımına uğradı).
        // İncelemek için gereken şey son KARE; aradaki 899 çizim boşa gidiyor.
        for (let i = 0; i < n; i++) {
          if (game.phase !== 'running') break;
          game.setInput(ix, iy);
          game.step();
        }
        render(ctx, game, cssW, cssH, dpr, TICK, auraRef.current, roomRef.current?.ghosts ?? []);
        // ⚠️ CANVAS TEK BAŞINA YETMİYOR. Level-up kartı, ölüm ekranı ve HUD
        // React tarafında; döngü durduğu için bunlar hiç güncellenmiyordu ve
        // koşu içi arayüzün tamamı ölçüm dışı kalıyordu.
        senkronHud();
        return {
          phase: game.phase, time: Math.round(game.time), level: game.level,
          hp: Math.round(game.hp), maxHp: Math.round(game.stats.maxHp),
          kills: game.kills, enemies: game.enemies.length,
          depth: game.stage.depth, remaining: game.remaining,
          offers: game.offers.map((o) => o.id),
        };
      };
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const rawDt = (now - last) / 1000;
      last = now;
      // sekme arka plandan dönünce 10sn'lik açığı kapatmaya çalışmasın
      const dt = Math.min(rawDt, TICK * MAX_CATCHUP);

      // girdi topla
      const k = keysRef.current;
      let ix = 0, iy = 0;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (stickRef.current.active) { ix = stickRef.current.dx; iy = stickRef.current.dy; }

      // DURAKLAT: çıkış onayı açıkken simülasyon ilerlemez. Yoksa oyuncu
      // menüyü açtığı anda sürünün ortasında ölür — menü ölüm tuzağı olamaz.
      if (pausedRef.current) {
        game.setInput(0, 0);
        acc = 0;
        render(ctx, game, cssW, cssH, dpr, 0, auraRef.current, roomRef.current?.ghosts ?? []);
        return;
      }
      game.setInput(ix, iy);

      // HIT-STOP — kritik vuruş / boss ölümü / oyuncu hasarında oyun bir an
      // donar. ⚠️ Motorda tick ATLANMAZ (simülasyon değişir, sunucu
      // doğrulamasıyla ayrışır); burada sadece `step()` çağrılmaz.
      if (freeze > 0) {
        freeze = Math.max(0, freeze - dt);
        render(ctx, game, cssW, cssH, dpr, dt, auraRef.current, roomRef.current?.ghosts ?? []);
        acc = 0;   // ⚠️ birikeni at, yoksa donma bitince tick patlaması gelir
        return;
      }

      acc += dt;
      let ticks = 0;
      while (acc >= TICK && ticks < MAX_CATCHUP) {
        game.step();
        acc -= TICK;
        ticks++;
        // Moda özel oturum sınırı — süre dolunca koşu ölümle biter, oyuncu
        // özet ekranını görür ve hasarı sunucuya gider.
        if (limitRef.current && game.time >= limitRef.current && game.phase === 'running') {
          game.phase = 'dead';
        }
      }
      if (acc > TICK * MAX_CATCHUP) acc = 0; // birikmiş açığı at

      // Konumu bildir — kısma `push` içinde, burada her kare çağrılabilir
      roomRef.current?.push(game.px, game.py, game.facingRight, auraRef.current);

      render(ctx, game, cssW, cssH, dpr, dt, auraRef.current, roomRef.current?.ghosts ?? []);
      // render efekt kuyruklarını işledi; biriken donma isteğini şimdi al
      freeze = Math.max(freeze, takeFreeze());

      // ses ipuçlarını boşalt (sfx kendi içinde kısıyor)
      if (game.events.size) {
        for (const e of game.events) play(e as any);
        game.events.clear();
      }

      // fps ölçümü
      frames++;
      fpsTimer += rawDt;
      if (fpsTimer >= 0.5) { fps = Math.round(frames / fpsTimer); frames = 0; fpsTimer = 0; }

      // HUD'u ~12Hz örnekle (60Hz React re-render gereksiz)
      hudAcc += rawDt;
      if (hudAcc >= 1 / 12 || game.phase !== 'running') {
        hudAcc = 0;
        senkronHud();
      }
    };
    raf = requestAnimationFrame(loop);

    /**
     * MOTOR → REACT KÖPRÜSÜ.
     *
     * ⚠️ DÖNGÜDEN AYRILDI, ÇÜNKÜ DÖNGÜ DURABİLİYOR. Bu blok `loop`un içindeydi;
     * panel/sekme arka plandayken `requestAnimationFrame` durduğu için
     * `__gbKosuKare` oyunu ilerletiyor ama HUD, level-up kartı ve ölüm ekranı
     * hiç güncellenmiyordu — yani koşu içi ARAYÜZÜN HİÇBİRİ ölçülemiyordu.
     * Ölçüm aleti oyunun yarısını göremiyordu.
     */
    function senkronHud() {
      // ── TUTORIAL ──
      // ⚠️ HUD örneklemesine bağlı: ayrı bir zamanlayıcı kurmak 60Hz'de
      // ikinci bir React akışı açardı. Motor OKUNUYOR, hiçbir alan yazılmıyor.
      if (hintRef.current) {
        // görünen ipucunun süresi doldu mu (OYUN zamanı — duraklamada donar)
        if (game.time - hintRef.current.at >= hintRef.current.def.hold) {
          hintRef.current = null;
          setHint(null);
        }
      } else {
        const h = nextHint(game, seenRef.current);
        if (h) {
          hintRef.current = { def: h, at: game.time };
          seenRef.current = [...seenRef.current, h.id];
          markHintSeen(h.id);
          setHint(h.text);
        }
      }
      setHud({
        time: game.time, hp: game.hp, maxHp: game.stats.maxHp, level: game.level,
        xp: game.xp, xpNext: game.xpNext, kills: game.kills, rareGold: game.rareGold,
        enemies: game.enemies.length, phase: game.phase, fps,
        mode: game.stage.mode, depth: game.stage.depth, deepestCleared: game.stage.deepestCleared,
        offers: game.offers.map((o) => ({ id: o.id, name: o.name, desc: o.desc, kind: o.kind, level: o.level })),
        // ⚠️ `id` ŞART: ikon ve "Lv 3 → 4" önizlemesi bununla bulunuyor.
        // Eskiden sadece `name` taşınıyordu ve arayüz silahı tanıyamıyordu.
        weapons: game.weapons.map((w) => ({
          id: w.def.id, name: w.def.name, level: w.level,
          cd: w.cd, cdMax: game.cooldownMaxOf(w),
        })),
        passives: game.passives.map((p) => ({ id: p.def.id, name: p.def.name, level: p.level })),
        revives: game.revives,
        revivalLeft: Math.max(0, Math.floor(game.stats.revival)),
        evolution: game.lastEvolution,
        stageName: game.stage.def.name,
        stageTotal: game.stage.def.enemyCount,
        remaining: game.remaining,
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      sesKilidiniKaldir();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      // ⚠️ SOKET MUTLAKA KAPANIR. Kapanmazsa oyuncu köye dönse bile odada
      // hayaleti kalır ve herkes "orada duran ama hareket etmeyen" birini
      // görür — sunucu 20 sn sonra düşürür ama o 20 saniye yanlış bilgi.
      roomRef.current?.close();
      roomRef.current = null;
    };
    // `hero` dep listesinde: karakter değişince oyun yeniden kurulmalı,
    // yoksa yeni karakterin başlangıç silahı/istatistiği devreye girmez.
  }, [runSeed, runId, hero]);

  const xpPct = hud ? Math.min(100, (hud.xp / hud.xpNext) * 100) : 0;
  const hpPct = hud ? Math.max(0, (hud.hp / hud.maxHp) * 100) : 100;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: C.void }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* ── HUD ── */}
      {hud && (
        <>
          {/* üst şerit: XP + süre */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' }}>
            {/* ⚠️ ÖLÇEK 3 (eskiden 2) ve YÜZDE AÇIK — kullanıcı isteği.
                Ölçek TAM SAYI olmak zorunda (kit kuralı); 3 = 48 px yükseklik.
                `tone` VERİLMİYOR: çubuk çeyrekliğine göre kendi rengini
                seçiyor (buz → köz → altın → kızıl), yani oyuncu doluluğu
                renkten de okuyor. */}
            <div style={{ padding: '4px 8px 0' }}>
              <Bar pct={xpPct / 100} variant="01" scale={3} label />
            </div>
            {/* ⚠️ ORTA BLOK GERÇEKTEN ORTADA. Önce `space-between` vardı ve
                üç çocuk EŞİT DEĞİLDİ: sol "LV 1" ~55 px, sağ "0:09 · 8 kill ·
                🔊 · EXIT" ~220 px. `space-between` yalnız boşlukları eşitler,
                merkezi değil — orta blok farkın yarısı kadar SOLA kayıyordu
                ve kullanıcı bunu ekranda gördü.
                Çözüm: yanlara EŞİT PAY (`flex: 1`), ortaya sabit genişlik
                (`flex: 0 0 auto`). Artık sağ blok büyüse de (uzun süre,
                6 haneli kill) orta blok yerinden oynamıyor.
                ⚠️ `minWidth: 0` ŞART: onsuz yan bloklar içeriklerinden
                küçülemez ve dar ekranda satır taşar. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13, fontWeight: 800 }}>
              <span style={{ flex: 1, minWidth: 0, color: C.candle }}>LV {hud.level}</span>
              {/* Bölüm ilerlemesi — bitirilebilir oyunda oyuncunun en çok istediği bilgi.
                  Descent'te bunun yerini DERİNLİK alır: tek anlamlı skor odur. */}
              <span style={{ flex: '0 0 auto', textAlign: 'center', lineHeight: 1.15 }}>
                <span style={{ display: 'block', fontSize: 10, letterSpacing: 1.6,
                  color: hud.mode === 'descent' ? C.candle : C.boneFaint, fontWeight: 900 }}>
                  {hud.mode === 'descent' ? `DEPTH ${hud.depth}` : hud.stageName.toUpperCase()}
                </span>
                {/* ⚠️ DÜELLO HEDEFİ — geçildiği an renk değişiyor. Sadece sayı
                    yazmak yetmez: oyuncunun "geçtim mi?" diye hesap yapması
                    gerekirdi; renk o hesabı ortadan kaldırıyor. */}
                {duelTarget !== undefined && (
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: 1.1,
                    color: hud.depth > duelTarget ? C.ok : C.bloodSoft }}>
                    {hud.depth > duelTarget ? `AHEAD OF ${duelTarget}` : `BEAT ${duelTarget}`}
                  </span>
                )}
                <span style={{ display: 'block', fontSize: 19, color: C.bone, fontVariantNumeric: 'tabular-nums' }}>
                  {hud.remaining} <span style={{ fontSize: 11, color: C.boneDim }}>left</span>
                </span>
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'flex-end', gap: 8 }}>
                {/* ⚠️ Süre HUD'da HİÇ görünmüyordu — `fmtTime` tanımlıydı ama
                    sadece ölüm ekranında kullanılıyordu. Survivors türünde
                    "kaç dakikadayım" en temel bilgi. */}
                <span style={{ color: C.boneDim, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(hud.time)}</span>
                <span style={{ color: C.boneDim, fontVariantNumeric: 'tabular-nums' }}>{hud.kills} kill</span>
                <button
                  onClick={() => { const next = !isSoundEnabled(); setSoundEnabled(next); setMuted(!next); unlockAudio(); }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  style={{ pointerEvents: 'auto', width: 26, height: 22, borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.4)', color: muted ? C.boneFaint : C.candle,
                    fontSize: 12, lineHeight: 1, padding: 0 }}>
                  {muted ? '🔇' : '🔊'}
                </button>
                {/* Koşudan çıkış — oyuncu bir run'a kilitlenmemeli */}
                {hud.phase === 'running' && (
                  <PixelButton variant={BTN.strong} scale={2} onClick={() => setConfirmExit(true)}
                    style={{ pointerEvents: 'auto', minWidth: 76, fontSize: 10.5, fontWeight: 900, letterSpacing: 1 }}>
                    EXIT
                  </PixelButton>
                )}
              </span>
            </div>
          </div>

          {/* Evrim duyurusu — 4 saniye görünür. Oyuncu bunu kaçırmamalı,
              run'ın en büyük anı. */}
          {hud.evolution && hud.time - hud.evolution.at < 4 && (
            <div style={{ position: 'absolute', top: '30%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, color: C.candle, marginBottom: 4 }}>EVOLVED</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: C.bone, textShadow: `0 0 26px ${C.candle}, 0 2px 0 ${C.void}` }}>
                {hud.evolution.name}
              </div>
            </div>
          )}

          {/* alt sol: can küresi + taşınan build */}
          <div style={{ position: 'absolute', bottom: 18, left: 12, right: 12, pointerEvents: 'none',
            display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <Orb pct={hpPct / 100} kind="HP" scale={2} />
              {/* Sayı kürenin üstünde: "az kaldı mı" bilgisi bir bakışta okunmalı */}
              <div style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                fontFamily: FONT.ui, fontSize: 13, fontWeight: 900, color: C.bone,
                textShadow: '0 1px 0 #000, 0 0 6px #000', fontVariantNumeric: 'tabular-nums',
              }}>
                {Math.ceil(hud.hp)}
              </div>
            </div>

            <div style={{ maxWidth: 330 }}>
              {/* Silahlar ve pasifler slot çerçevesinde — envanter hissi */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {/* ⚠️ Slotlarda silah RESMİ yoktu, sadece seviye rakamı vardı —
                    oyuncu neyi taşıdığını simgeden tanıyamıyordu. */}
                {hud.weapons.map((w) => (
                  <div key={w.id} style={{ position: 'relative' }}>
                    {/* ⚠️ SOĞUMA HALKASI SONUNDA BAĞLANDI. `cd`/`cdMax` motordan
                        HUD durumuna kadar taşınıyordu ve son adımda ölüyordu:
                        veri oradaydı, kimse ÇİZMİYORDU. `CooldownRing` de tam
                        bu iş için yazılmış, hiçbir yerden çağrılmıyordu.
                        Ölçüm: 34 "dışarıdan kullanılmayan" ihracat içinde
                        oyuncuya bakan tek gerçek boşluk buydu. */}
                    <CooldownRing pct={w.cd / w.cdMax} size={32}>
                      <Slot type="Weapon" variant="02" scale={2} title={`${w.name} L${w.level}`}>
                        <img src={weaponArt(w.id).icon} alt="" width={22} height={22}
                          style={{ imageRendering: 'pixelated', display: 'block' }} />
                      </Slot>
                    </CooldownRing>
                    <span style={{
                      position: 'absolute', right: -2, bottom: -2, fontSize: 9, fontWeight: 900,
                      color: C.candle, textShadow: '0 1px 0 #000, 0 0 4px #000',
                    }}>{w.level}</span>
                  </div>
                ))}
                {/* ⚠️ DİRİLİŞ HAKKI SONUNDA GÖRÜNÜR OLDU.
                    `revival` DÖRT yerden satın alınabiliyor (Forge "Second
                    Burial" 2.640 gold, aynı adlı pasif, "Grave Offering"
                    tılsımı, sigil ekipmanı) ve oyuncu kaç hakkı olduğunu
                    hiçbir yerde göremiyordu — ölene kadar. 2.640 gold
                    harcayıp ne aldığını göremeyen oyuncu, bir daha almaz.
                    ⚠️ KALAN gösteriliyor, HARCANMIŞ değil: oyuncunun
                    kararını değiştiren sayı "kaç canım kaldı". */}
                {hud.revivalLeft > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 7px', borderRadius: 6,
                    border: `1px solid ${C.ok}55`,
                    background: 'rgba(0,0,0,0.35)',
                    fontFamily: FONT.ui, fontSize: 11, fontWeight: 900, color: C.ok,
                  }} title={`${hud.revivalLeft} revival left — you get back up at half health`}>
                    <Icon name="sigil" scale={1} />
                    ×{hud.revivalLeft}
                  </div>
                )}
                {hud.passives.map((p) => (
                  <div key={p.id} style={{ position: 'relative' }}>
                    <Slot type="Ring" variant="02" scale={2} title={`${p.name} L${p.level}`}>
                      <img src={passiveIcon(p.id)} alt="" width={20} height={20}
                        style={{ imageRendering: 'pixelated', display: 'block' }} />
                    </Slot>
                    <span style={{
                      position: 'absolute', right: -2, bottom: -2, fontSize: 9, fontWeight: 900,
                      color: C.ice, textShadow: '0 1px 0 #000, 0 0 4px #000',
                    }}>{p.level}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint, fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(hud.rareGold)} gold found · {hud.enemies} enemies · {hud.fps} fps
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── LEVEL UP ──
          ⚠️ SEÇİM ANI BİR PENCERE, KARARTILMIŞ BİR EKRAN DEĞİL.
          Eskiden düz `rgba(10,8,6,0.86)` bir örtüydü: savaş yok oluyordu ama
          yerine bir SAHNE gelmiyordu. Artık merkezden dışa açılan radyal bir
          karartma var — ortada kartlar, kenarlarda koşu hâlâ seziliyor.
          Oyuncu oyundan çıkmıyor, oyunun içinde duruyor.
          ⚠️ Bu yorum `&& (` SONRASINA konulamaz: JSX yorumu orada ifade
          sayılır ve derleme kırılır (bu oturumda ikinci kez). */}
      {hud?.phase === 'levelup' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(10,8,6,0.80) 0%, rgba(6,5,4,0.94) 62%, rgba(4,3,3,0.97) 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <Banner variant="01C" scale={2} style={{ minWidth: 210 }}>
            <span style={{ fontSize: 13, color: C.candle }}>LEVEL {hud.level}</span>
          </Banner>
          {/* ⚠️ ALT BAŞLIK: "ne yapıyorum" sorusunun cevabı. Banner yalnız
              seviyeyi söylüyordu; kararın KENDİSİ isimsizdi. */}
          <div style={{
            marginTop: 7, marginBottom: 16, fontFamily: FONT.ui,
            fontSize: 10.5, letterSpacing: 2.4, color: C.boneFaint,
          }}>CHOOSE WHAT YOU BECOME</div>
          {/**
            * ⚠️ YAN YANA — ama telefonu KIRMADAN.
            *
            * Eskiden dikey yığındı ve yorumu "telefonda 3'lü yatay kart
            * sıkışır" diyordu; kaygı doğruydu, çözümü yanlıştı. `auto-fit` +
            * `minmax` ikisini birden veriyor: geniş ekranda üç sütun,
            * sütun 236 px'in altına düşecekse ızgara KENDİLİĞİNDEN alt alta
            * iniyor. Medya sorgusu yok, satır içi stil kuralı korunuyor.
            *
            * ⚠️ `alignItems:'stretch'` ŞART — kartların `height:'100%'`i
            * ancak böyle bir şeye dayanıyor; onsuz üçü farklı boyda biter.
            */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(236px, 1fr))',
            gap: 12, width: '100%', maxWidth: 980, alignItems: 'stretch',
          }}>
            {/* ⚠️ KADEMELİ BELİRİŞ — üç kart aynı anda patlamıyor, 70 ms arayla
                soldan sağa geliyor. Göz sırayı böyle yakalıyor ve "üç seçenek
                var" bilgisi bedavaya geliyor. `Reveal` hareket kapalıyken
                (prefers-reduced-motion / lowGraphics) kendini devre dışı
                bırakıyor — bilgi kaybolmuyor, yalnız hareket kalkıyor. */}
            {hud.offers.map((o, i) => (
              <Reveal key={o.id} delay={i * 70} style={{ height: '100%' }}>
                <LevelUpCard offer={o} index={i} onPick={choose}
                  weapons={hud.weapons} passives={hud.passives} />
              </Reveal>
            ))}
          </div>
          {/* ⚠️ Tuşlar METİN DEĞİL, TUŞ gibi çiziliyor — kartlardaki rozetle
              aynı dil. "Press 1 · 2 · 3" bir cümleydi ve göz onu atlıyordu. */}
          <div style={{
            marginTop: 16, display: 'flex', alignItems: 'center', gap: 7,
            fontFamily: FONT.ui, fontSize: 10.5, color: C.boneFaint,
          }}>
            {[1, 2, 3].map((n) => (
              <span key={n} style={{
                minWidth: 18, height: 18, padding: '0 4px', borderRadius: 4,
                display: 'grid', placeItems: 'center',
                fontSize: 10, fontWeight: 900, color: C.boneDim,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.13)',
                boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.3)',
              }}>{n}</span>
            ))}
            <span style={{ letterSpacing: 1.4 }}>or click a card</span>
          </div>
        </div>
      )}

      {/* ── DERİNLİK GEÇİŞİ ──
          Eskiden 2,2 sn boyunca ortada duran bir YAZIDAN ibaretti; canvas'ta
          hiçbir karşılığı yoktu. Merdivenden inmek bir AN olmalı.
          ⚠️ Süpürme CSS'te, canvas'ta DEĞİL: her karede tam ekran bir dolgu
          çizmek 400 düşmanlık bir sahnede boşuna maliyet, üstelik geçiş
          simülasyonu hiç ilgilendirmiyor.
          ⚠️ Hareket kapalıyken (prefers-reduced-motion / lowGraphics) süpürme
          düşer ama YAZI KALIR — bilgi kaybolmaz, yalnız hareket kalkar. */}
      {hud?.mode === 'descent' && depthFlash > 0 && hud.time - depthFlash < 2.2 && (
        <>
          {!motionOff() && (
            <>
              <style>{`
@keyframes gb-inis { 0% { opacity: 0; } 18% { opacity: 1; } 100% { opacity: 0; } }
@keyframes gb-inis-yazi { 0% { opacity: 0; transform: translateY(-10px); } 22% { opacity: 1; transform: translateY(0); } 100% { opacity: 1; } }
`}</style>
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                // Yukarıdan aşağı inen koyu bir perde — "aşağı geçtim" hissi
                background: `linear-gradient(180deg, ${C.void} 0%, rgba(10,8,6,0.55) 42%, transparent 78%)`,
                animation: `gb-inis ${bantDegisti ? 900 : 520}ms ease-out both`,
              }} />
            </>
          )}
          <div style={{
            position: 'absolute', top: '26%', left: 0, right: 0, textAlign: 'center',
            pointerEvents: 'none',
            animation: motionOff() ? undefined : 'gb-inis-yazi 520ms ease-out both',
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, color: C.boneFaint, marginBottom: 2 }}>
              DESCENDING
            </div>
            <div style={{ fontSize: 40, fontWeight: 900, color: C.bone, textShadow: `0 0 26px ${C.blood}, 0 2px 0 ${C.void}` }}>
              DEPTH {hud.depth}
            </div>
            {/* ⚠️ Bant eşiği: 10 derinlikte bir, sanatın gerçekten değiştiği
                yer. Metinler SÜS DEĞİL — oyuncunun birazdan göreceği şeyi
                tarif ediyorlar (ışık çekilir, zemin taşa döner, kemik başlar). */}
            {bantDegisti && (
              <div style={{
                marginTop: 6, fontSize: 12.5, fontWeight: 900, letterSpacing: 1.6,
                color: C.candle, fontFamily: FONT.ui,
              }}>
                {BANT_METNI[Math.min(descentBant(hud.depth), BANT_METNI.length - 1)]}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TUTORIAL İPUCU ──
          ⚠️ ALTTA duruyor: level-up kartları ekranın ortasında, derinlik
          bandı %26'da. Üstte olsaydı ilk kart seçiminde tam üstüne binerdi.
          ⚠️ `pointerEvents: none` — ipucu ASLA tıklamayı yemez; oyuncu
          altındaki bir şeye basmaya çalışırken engellenmemeli. */}
      {hint && hud?.phase === 'running' && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 96,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 16px',
        }}>
          <div style={{
            ...glass(10), padding: '10px 15px', maxWidth: 460,
            fontFamily: FONT.ui, fontSize: 12.5, lineHeight: 1.5,
            color: C.bone, textAlign: 'center',
            borderColor: `${C.candle}44`,
          }}>
            <span style={{ color: C.candle, fontWeight: 900, letterSpacing: 1.2, fontSize: 9.5 }}>
              A VOICE FROM THE DARK
            </span>
            <div style={{ marginTop: 4 }}>{hint}</div>
          </div>
        </div>
      )}

      {/* ── ÇIKIŞ ONAYI ── */}
      {/* Oyun DURUR (pausedRef). Kazanılanın ne olacağı açıkça yazılıyor:
          "çıkarsam her şeyi kaybeder miyim?" sorusu ekranda cevaplanmalı. */}
      {confirmExit && hud && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3, color: C.boneFaint, marginBottom: 4 }}>PAUSED</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.bone, marginBottom: 10, textAlign: 'center' }}>
            Leave the run?
          </div>
          <div style={{ ...glass(12), padding: '12px 16px', maxWidth: 380, marginBottom: 18, fontSize: 12.5, color: C.boneDim, lineHeight: 1.6, textAlign: 'center' }}>
            {hud.mode === 'descent'
              ? <>You keep every depth you cleared — <b style={{ color: C.candle }}>{hud.deepestCleared}</b> so far.
                  Depth {hud.depth} is unfinished and pays nothing.</>
              : <>The stage is unfinished, so its first-clear reward is <b style={{ color: C.bone }}>not</b> paid.</>}
            <br />
            <span style={{ color: C.candle }}>{Math.floor(hud.rareGold)} gold</span> found this run is yours either way.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <PixelButton variant={BTN.action} scale={2} onClick={() => setConfirmExit(false)}
              style={{ minWidth: 190, fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>
              KEEP FIGHTING
            </PixelButton>
            <PixelButton variant={BTN.strong} scale={2} onClick={finish}
              style={{ minWidth: 190, fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>
              LEAVE
            </PixelButton>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: C.boneFaint }}>Esc to resume</div>
        </div>
      )}

      {/* ── ÖLÜM / KAZANMA ── */}
      {(hud?.phase === 'dead' || hud?.phase === 'won') && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: hud.phase === 'won' ? C.candle : C.blood, marginBottom: 6 }}>
            {hud.mode === 'descent' ? 'THE DESCENT ENDS' : hud.phase === 'won' ? 'STAGE CLEARED' : 'YOU DIED'}
          </div>
          {/*
            ⚠️ "ULAŞILAN" ve "TEMİZLENEN" AYNI SAYI DEĞİL — burada karıştırılıyordu.
            Ekranda `deepestCleared` "Reached depth" diye yazılıyordu; derinlik 1'de
            ölen oyuncu **"Reached depth 0"** görüyordu. Derinlik 0 diye bir şey yok
            ve koşu içi HUD bir saniye önce "DEPTH 1" yazıyordu — oyuncu aynı ekranda
            kendisiyle çelişen iki sayı görüyordu.
            `depth` = üstünde savaştığı derinlik (oyuncunun sorduğu: ne kadar indim)
            `deepestCleared` = tamamen bitirdiği en derin kat (ÖDEME bunu baz alır)
            İkisi farklıysa ikisi de gösteriliyor; ödeme satırı hemen altta zaten
            "New depths pay once" diyor ve o söz ancak bu sayı görünürse anlamlı.
          */}
          {hud.mode === 'descent' && (
            <div style={{ fontSize: 15, fontWeight: 900, color: C.candle, marginBottom: 6 }}>
              Reached depth {hud.depth}
              {hud.deepestCleared < hud.depth && (
                <span style={{ color: C.boneDim, fontWeight: 700, fontSize: 13 }}>
                  {' '}· cleared {hud.deepestCleared}
                </span>
              )}
            </div>
          )}
          <div style={{ fontSize: 13, color: C.boneDim, marginBottom: 20, textAlign: 'center' }}>
            {hud.stageName} · {fmtTime(hud.time)} · LV {hud.level} · {hud.kills} kill · {Math.floor(hud.rareGold)} gold found
            <br />
            <span style={{ color: C.boneFaint, fontSize: 12 }}>
              {hud.mode === 'descent'
                ? 'New depths pay once — the village will settle up'
                : hud.phase === 'won'
                ? `All ${hud.stageTotal} enemies destroyed`
                : `${hud.remaining} enemies left — the gold you found is yours to keep`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <PixelButton variant={BTN.strong} scale={2} onClick={() => setRunId((n) => n + 1)}
              style={{ minWidth: 190, fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>
              TRY AGAIN
            </PixelButton>
            <PixelButton variant={BTN.action} scale={2} onClick={finish}
              style={{ minWidth: 190, fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>
              RETURN TO VILLAGE
            </PixelButton>
          </div>
        </div>
      )}
    </div>
  );
}
