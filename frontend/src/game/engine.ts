// GRAVEBORN simülasyon çekirdeği — saf mantık, DOM/canvas bilgisi YOK.
// Bu ayrım kasıtlı: aynı kod ileride sunucuda headless koşabilir (ödül doğrulaması).
// Render tamamen ayrı (render.ts). Rastgelelik sadece Rng'den (Math.random YASAK).
//
// Bellek deseni: sabit kapasiteli diziler + swap-remove. Her frame yeni nesne
// tahsis edilmez → GC spike'ı yok → frame düşmesi yok.

import { createRng, type Rng } from './rng';
import { SpatialHash } from './spatial';
import {
  CHEST_RADIUS, CONTACT_HIT_CD, COOLDOWN_FLOOR, ENEMIES, EVOLUTIONS, GEM,
  MAX_PASSIVES, MAX_WEAPONS, PASSIVES, PLAYER, RUN, SPAWN, STAGES, STAT_BASE, STAT_CAP, TICK,
  WEAPONS, descentStage, rareDropAmount, rareDropChance, weaponById, xpForLevel,
  type EnemyType, type PassiveDef, type StageDef, type StatKey, type WeaponDef,
} from './config';

export interface Enemy {
  x: number; y: number; hp: number; maxHp: number;
  speed: number; damage: number; radius: number; xp: number;
  color: string; hitFlash: number;
  /** sprites.ts ENEMY_ART anahtarı (yoksa daire çizilir) */
  art?: string;
  /** animasyon zamanı — spawn'da rastgele ofsetlenir, yoksa 400 düşman
   *  aynı frame'de yürür ve sürü robot gibi durur */
  animT: number;
  facingRight: boolean;
  /** alan hasarı (aura/orbit) bekleme sayacı — sürekli temas anında eritmesin */
  contactCd: number;
  /** boss ise: ölünce sandık düşürür, HP barı çizilir */
  boss?: { label: string; evolutionChest: boolean };
}

/** Boss'un düşürdüğü sandık — toplanınca evrim veya ödül */
export interface Chest { x: number; y: number; evolution: boolean }
export interface Projectile {
  x: number; y: number; vx: number; vy: number;
  damage: number; radius: number; life: number; pierce: number;
}
export interface Gem { x: number; y: number; xp: number; life: number }

/** Sweep saldırısının geçici hitbox'ı — render de bunu çizer */
export interface HitZone {
  x: number; y: number; w: number; h: number;
  life: number; maxLife: number; damage: number;
  facingRight: boolean;
  /** aynı kesikte aynı düşmana iki kez vurmasın */
  hit: Set<Enemy>;
}

/** Sahip olunan silah — seviyesi ve kendi bekleme sayacı */
export interface OwnedWeapon { def: WeaponDef; level: number; cd: number }

/** Level-up'ta sunulan seçenek: yeni silah, silah yükseltmesi veya istatistik */
export interface Offer {
  kind: 'weapon-new' | 'weapon-up' | 'passive-new' | 'passive-up';
  id: string;
  name: string;
  desc: string;
  /** silah seçeneklerinde mevcut seviye (yükseltmede gösterilir) */
  level?: number;
}

export type Phase = 'running' | 'levelup' | 'dead' | 'won';

/** campaign = bitirilebilir bölüm · descent = sonsuz derinlik merdiveni */
export type RunMode = 'campaign' | 'descent';

/** Bölüm ilerlemesi — HUD "kaç düşman kaldı" göstergesi için */
export interface StageState {
  def: StageDef;
  /** henüz salınmamış düşman */
  toSpawn: number;
  /** bu bölümde toplam kaç düşman öldürüldü */
  killed: number;
  /** boss çağrıldı mı */
  bossSpawned: boolean;
  mode: RunMode;
  /** descent'te şu an inilen derinlik (campaign'de 0) */
  depth: number;
  /** bu koşuda TEMİZLENEN en derin seviye — ödül bundan hesaplanır */
  deepestCleared: number;
}

/** VS istatistik sistemi (CLONE-SPEC §1). Yüzdeler 1.0 = %100. */
export type Stats = Record<StatKey, number>;

/** Sahip olunan pasif item */
export interface OwnedPassive { def: PassiveDef; level: number }

export class Game {
  readonly seed: number;
  private rng: Rng;

  // oyuncu
  // NOT: config'deki `as const` yüzünden açık `: number` şart —
  // yoksa TS `hp`'yi literal `100` olarak çıkarır ve atamalar patlar.
  px = 0; py = 0;
  hp: number = PLAYER.maxHp;
  iframe = 0;
  // sunum durumu — simülasyonu etkilemez, render okur
  animT = 0;
  moving = false;
  facingRight = true;
  level = 1;
  xp = 0;
  xpNext: number = xpForLevel(1);

  // run durumu
  time = 0;
  phase: Phase = 'running';
  kills = 0;
  /**
   * Bu koşuda NADİR DÜŞÜŞTEN toplanan gold. Kill başına maaş DEĞİL —
   * ilerleme ödülü (derinlik/ilk geçiş) buraya girmez, onu progress.ts hesaplar.
   * İsim bilerek `gold` değil: eskiden `gold` "kazanılan her şey" sanılıyordu.
   */
  rareGold = 0;
  /** kaç kez dirilindi (Second Burial) — run özetinde raporlanır */
  revives = 0;

  /** VS istatistikleri — pasif item'lardan türetilir, doğrudan yazılmaz */
  stats: Stats = { ...STAT_BASE };

  /** Taşınan silahlar. Run başında Bone Shard ile başlanır. */
  weapons: OwnedWeapon[] = [];
  /** Taşınan pasif item'lar — istatistikleri besler, evrimin ön koşulu */
  passives: OwnedPassive[] = [];
  /** Yörünge silahlarının ortak açısı — tüm orb'lar birlikte döner */
  orbitAngle = 0;

  /** levelup fazında sunulan 3 seçenek (silah veya istatistik) */
  offers: Offer[] = [];

  // varlıklar
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  gems: Gem[] = [];
  hitZones: HitZone[] = [];
  chests: Chest[] = [];

  /** Oynanan bölüm — sabit düşman havuzu, "hepsi öldü" bitiş koşulu */
  stage: StageState;
  /** merdivenin ait olduğu kampanya bölümü (descent tanımı bundan üretilir) */
  readonly baseStageId: number;
  /** son evrim (HUD duyurusu için); render/HUD okur, simülasyonu etkilemez */
  lastEvolution: { name: string; at: number } | null = null;

  /**
   * KOZMETİK olay kuyruğu — render katmanı her frame boşaltır.
   * Simülasyon durumunu ETKİLEMEZ ve RNG tüketmez; determinizm bozulmaz.
   * Render çalışmasa bile (headless test) tavanla sınırlı, sızıntı yapmaz.
   */
  deaths: { x: number; y: number }[] = [];

  /**
   * Ses ipuçları. Set kullanılıyor çünkü aynı frame'de 200 ölüm olsa da
   * tek 'kill' sesi çalınacak — dizi olsaydı sınırsız büyürdü.
   * Ses katmanı her frame boşaltır; simülasyonu ETKİLEMEZ.
   */
  events = new Set<string>();

  // girdi (birim vektör)
  private inx = 0;
  private iny = 0;

  // dahili
  private spawnAcc = 0;
  private spawnCount = 0; // sadece kozmetik animasyon ofseti için (RNG değil)
  private grid = new SpatialHash<Enemy>(64);
  private scratch: Enemy[] = [];
  /** ekran yarı-boyutu — spawn ringi için (render katmanı bildirir) */
  private viewW = 800;
  private viewH = 600;

  /** The Forge'dan gelen kalıcı bonuslar — run boyunca sabit, tabana eklenir */
  private permanent: Partial<Record<StatKey, number>>;

  constructor(
    seed: number,
    stageDef: StageDef = STAGES[0],
    permanent: Partial<Record<StatKey, number>> = {},
    mode: RunMode = 'campaign',
  ) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.permanent = permanent;
    // descent'te 1. derinlikten başlanır; verilen stageDef sadece "hangi bölümün
    // merdiveni" bilgisini taşır, asıl tanım descentStage()'ten gelir
    const startDef = mode === 'descent' ? descentStage(stageDef.id, 1) : stageDef;
    this.baseStageId = stageDef.id;
    this.stage = {
      def: startDef,
      toSpawn: startDef.enemyCount,
      killed: 0,
      bossSpawned: false,
      mode,
      depth: mode === 'descent' ? 1 : 0,
      deepestCleared: 0,
    };
    this.recomputeStats();          // kalıcı bonuslar daha ilk kareden geçerli
    this.hp = this.stats.maxHp;     // +max can alındıysa dolu başla
    // Başlangıç silahı: Bone Shard (VS'te her karakter bir silahla başlar)
    this.giveWeapon('shard');
  }

  /** Bölümde kalan düşman (salınmamış + sahnedeki). 0 = bölüm bitti. */
  get remaining() {
    return this.stage.toSpawn + this.enemies.length;
  }

  private giveWeapon(id: string) {
    const def = WEAPONS.find((w) => w.id === id);
    if (!def || this.weapons.length >= MAX_WEAPONS) return;
    if (this.weapons.some((w) => w.def.id === id)) return;
    this.weapons.push({ def, level: 1, cd: 0 });
  }

  private givePassive(id: string) {
    const def = PASSIVES.find((p) => p.id === id);
    if (!def || this.passives.length >= MAX_PASSIVES) return;
    if (this.passives.some((p) => p.def.id === id)) return;
    this.passives.push({ def, level: 1 });
    this.recomputeStats();
  }

  /**
   * İstatistikleri pasiflerden YENİDEN HESAPLA.
   * Artımlı yazmak yerine türetmek kasıtlı: seviye/pasif değişince tek doğru
   * kaynak var, kayan yuvarlama hatası birikmiyor ve tavanlar tek yerde uygulanıyor.
   */
  private recomputeStats() {
    const s: Stats = { ...STAT_BASE };

    // KALICI yükseltmeler (The Forge) tabana eklenir — run boyunca sabit.
    // maxHp yüzde olarak geldiği için ayrı ele alınır; diğerleri toplamsal.
    let permHpPct = 0;
    for (const k of Object.keys(this.permanent) as StatKey[]) {
      const v = this.permanent[k] ?? 0;
      if (!v) continue;
      if (k === 'maxHp') permHpPct += v;
      else s[k] += v;
    }
    if (permHpPct) s.maxHp = PLAYER.maxHp * (1 + permHpPct);

    // Run içi pasifler bunun ÜSTÜNE biner
    let runHpPct = 0;
    for (const p of this.passives) {
      const add = p.def.perLevel * p.level;
      if (p.def.stat === 'cooldown') s.cooldown -= add;      // bekleme AZALIR
      else if (p.def.stat === 'maxHp') runHpPct += add;
      else s[p.def.stat] += add;
    }
    if (runHpPct) s.maxHp = PLAYER.maxHp * (1 + permHpPct + runHpPct);
    // VS tavanları
    for (const k of Object.keys(STAT_CAP) as StatKey[]) {
      const cap = STAT_CAP[k]!;
      if (s[k] > cap) s[k] = cap;
    }
    if (s.cooldown < COOLDOWN_FLOOR) s.cooldown = COOLDOWN_FLOOR;
    this.stats = s;
    if (this.hp > s.maxHp) this.hp = s.maxHp;
  }

  /** Silahın o seviyedeki hasarı — Might çarpanı uygulanır */
  private wDamage(w: OwnedWeapon) {
    return w.def.damage * Math.pow(w.def.dmgPerLevel, w.level - 1) * this.stats.might;
  }
  /** Silahın o seviyedeki bekleme süresi — Cooldown istatistiği uygulanır */
  private wCooldown(w: OwnedWeapon) {
    return w.def.cooldownSec * Math.pow(w.def.cdPerLevel, w.level - 1) * this.stats.cooldown;
  }
  /** Alan çarpanı (sweep/orbit/aura) — Area istatistiği uygulanır */
  private wArea(w: OwnedWeapon) {
    return Math.pow(w.def.areaPerLevel ?? 1, w.level - 1) * this.stats.area;
  }
  /** Adet (mermi/orb) — countLevels eşikleri + Amount istatistiği */
  private wCount(w: OwnedWeapon) {
    const base = 1 + (w.def.countLevels?.filter((l) => w.level >= l).length ?? 0);
    return base + this.stats.amount;
  }

  setInput(x: number, y: number) {
    const m = Math.hypot(x, y);
    if (m > 1e-4) { this.inx = x / m; this.iny = y / m; } else { this.inx = 0; this.iny = 0; }
  }

  setViewport(w: number, h: number) { this.viewW = w; this.viewH = h; }

  get minute() { return this.time / 60; }

  /** Bir sabit tick ilerlet. dt HER ZAMAN TICK'tir — değişken dt kabul edilmez. */
  step() {
    if (this.phase !== 'running') return;
    const dt = TICK;
    this.time += dt;
    // Güvenlik tavanı — bölüm bir şekilde bitmezse run sonsuza kadar sürmesin
    if (this.time >= RUN.durationSec) { this.phase = 'dead'; return; }

    this.movePlayer(dt);
    this.rebuildGrid();
    this.spawnBoss();
    this.spawn(dt);
    this.moveEnemies(dt);
    this.fire(dt);            // 4 desen: aimed / sweep / orbit / aura
    this.updateHitZones(dt);  // sweep hitbox'ları
    this.moveProjectiles(dt);
    this.collideProjectiles();
    this.reapDead();          // TÜM hasar kaynaklarından sonra tek temizlik
    this.collidePlayer(dt);
    this.updateGems(dt);
    this.updateChests();

    if (this.stats.recovery > 0 && this.hp > 0) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.recovery * dt);
    }
    if (this.iframe > 0) this.iframe -= dt;

    // BÖLÜM TAMAMLANDI: havuz boş, sahne temiz, boss (varsa) devrilmiş.
    // Sandık bekleyen varsa bitirme — oyuncu evrim sandığını kaçırmasın.
    if (this.remaining === 0 && this.chests.length === 0) {
      const needsBoss = !!this.stage.def.boss && !this.stage.bossSpawned;
      if (!needsBoss) {
        if (this.stage.mode === 'descent') this.advanceDepth();
        else this.phase = 'won';
      }
    }
  }

  /**
   * Bir derinlik temizlendi → bir alta in. Koşu BİTMEZ.
   *
   * ⚠️ CAN DOLDURULMAZ. Descent'i bitiren şey zamanlayıcı değil canın:
   * ne kadar hasarsız oynadıysan o kadar derine inersin. Burada HP'yi
   * doldurmak modu sonsuz ve anlamsız hale getirir.
   * Silah/pasif/level de korunur — merdiven boyunca build büyür.
   */
  private advanceDepth() {
    this.stage.deepestCleared = this.stage.depth;
    const next = this.stage.depth + 1;
    const def = descentStage(this.baseStageId, next);
    this.stage.def = def;
    this.stage.depth = next;
    this.stage.toSpawn = def.enemyCount;
    this.stage.killed = 0;
    this.stage.bossSpawned = false;
    this.spawnAcc = 0;
    this.events.add('depth');
  }

  private movePlayer(dt: number) {
    const sp = PLAYER.speed * this.stats.moveSpeed;
    this.px += this.inx * sp * dt;
    this.py += this.iny * sp * dt;
    this.animT += dt;
    this.moving = this.inx !== 0 || this.iny !== 0;
    if (this.inx > 0.01) this.facingRight = true;
    else if (this.inx < -0.01) this.facingRight = false;
    // arena sınırı
    const d = Math.hypot(this.px, this.py);
    if (d > RUN.arenaRadius) {
      this.px = (this.px / d) * RUN.arenaRadius;
      this.py = (this.py / d) * RUN.arenaRadius;
    }
  }

  private rebuildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      this.grid.insert(e.x, e.y, e);
    }
  }

  /** Bölümün düşman havuzu (config'den) — en az 1 tip garanti */
  private availableTypes(): readonly EnemyType[] {
    const ids = this.stage.def.enemies;
    const list = ENEMIES.filter((t) => ids.includes(t.id));
    return list.length ? list : [ENEMIES[0]];
  }

  private spawn(dt: number) {
    const st = this.stage;
    if (st.toSpawn <= 0) return; // havuz bitti — bölümdeki her düşman salındı

    // Curse (Cursed Skull): düşman hızı/canı/sıklığı artar — VS ile aynı.
    // Bölüm sisteminde ADET artmaz (havuz sabit), sadece güç ve hız artar;
    // yoksa gold tavanı ile düşman sayısı arasındaki bağ kopardı.
    const curse = this.stats.curse;
    const rate = st.def.spawnRate * curse;
    this.spawnAcc += rate * dt;
    const types = this.availableTypes();
    const hpScale = st.def.hpMul * curse;
    const spScale = st.def.speedMul * curse;

    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (st.toSpawn <= 0) { this.spawnAcc = 0; break; }
      if (this.enemies.length >= st.def.maxAlive) { this.spawnAcc = 0; break; }
      st.toSpawn -= 1;
      const t = this.rng.pick(types);
      // ekran dikdörtgeninin dışındaki bir elipste doğ
      const ang = this.rng.range(0, Math.PI * 2);
      const rx = this.viewW / 2 + SPAWN.ringMargin;
      const ry = this.viewH / 2 + SPAWN.ringMargin;
      this.enemies.push({
        x: this.px + Math.cos(ang) * rx,
        y: this.py + Math.sin(ang) * ry,
        hp: t.hp * hpScale, maxHp: t.hp * hpScale,
        speed: t.speed * spScale, damage: t.damage, radius: t.radius,
        xp: t.xp, color: t.color, hitFlash: 0,
        // animT KOZMETİK → rng'den ALINMAZ. Aksi hâlde bir görsel değişiklik
        // RNG akışını kaydırır ve aynı günlük seed başka bir run üretir.
        // Spawn sayacından türetiliyor: deterministik, çeşitli, RNG'ye dokunmuyor.
        art: t.art, animT: (this.spawnCount++ * 0.37) % 2, facingRight: true,
        contactCd: 0,
      });
    }
  }

  /**
   * Bölüm boss'u — havuzdaki tüm normal düşmanlar salınıp ölünce gelir.
   * Yani boss bölümün FİNALİ, zaman bazlı değil ilerleme bazlı.
   */
  private spawnBoss() {
    const st = this.stage;
    const b = st.def.boss;
    if (!b || st.bossSpawned) return;
    if (st.toSpawn > 0 || this.enemies.length > 0) return; // önce sürü temizlensin
    st.bossSpawned = true;

    // Curse boss'u da güçlendirir — pasifin riski her yerde tutarlı olmalı
    const hp = b.hp * this.stats.curse;
    const ang = this.rng.range(0, Math.PI * 2);
    const rx = this.viewW / 2 + SPAWN.ringMargin;
    const ry = this.viewH / 2 + SPAWN.ringMargin;
    this.enemies.push({
      x: this.px + Math.cos(ang) * rx,
      y: this.py + Math.sin(ang) * ry,
      hp, maxHp: hp,
      speed: b.speed, damage: b.damage, radius: b.radius,
      xp: 400, color: '#a01226', hitFlash: 0,
      art: b.art, animT: 0, facingRight: true, contactCd: 0,
      boss: { label: b.label, evolutionChest: true },
    });
    this.events.add('boss');
  }

  /** Sandık toplama — evrim sandığıysa evrim dene, olmazsa ödüle çevir */
  private updateChests() {
    // Sürü temizlenince sandıklar oyuncuya AKAR.
    // Yoksa oyuncu sandığı fark etmezse bölüm asla bitmiyor (bitiş koşulu
    // sandık bekliyor) ve gold'unu alamadan kilitleniyor. Testte tam bu oldu.
    const cleared = this.stage.toSpawn === 0 && this.enemies.length === 0;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      if (cleared) {
        const ddx = this.px - c.x, ddy = this.py - c.y;
        const d = Math.hypot(ddx, ddy) || 1;
        const pull = 420 * TICK;
        c.x += (ddx / d) * pull;
        c.y += (ddy / d) * pull;
      }
      const dx = c.x - this.px, dy = c.y - this.py;
      const rr = PLAYER.radius + CHEST_RADIUS;
      if (dx * dx + dy * dy > rr * rr) continue;

      this.swapRemove(this.chests, i);
      this.events.add('chest');
      const evolved = c.evolution ? this.tryEvolve() : false;
      if (!evolved) {
        // Evrim yoksa sandık boşa gitmesin (VS: sandık altın/XP verir)
        this.rareGold += 200 * this.stats.greed;
        this.addXp(60);
      }
    }
  }

  /**
   * VS evrim kuralı: taban silah MAX + gereken pasif MAX + evrim sandığı.
   * Uygun ilk eşleşme evrimleşir (VS'te de sandık başına bir evrim).
   */
  private tryEvolve(): boolean {
    for (const ev of EVOLUTIONS) {
      const w = this.weapons.find((x) => x.def.id === ev.weapon);
      if (!w || w.level < w.def.maxLevel) continue;
      const p = this.passives.find((x) => x.def.id === ev.passive);
      if (!p || p.level < p.def.maxLevel) continue;

      const to = weaponById(ev.to);
      if (!to) continue;
      // Taban silah gider, yerine evrimleşmiş gelir. Pasif KALIR (VS ile aynı).
      w.def = to;
      w.level = 1;
      w.cd = 0;
      this.lastEvolution = { name: to.name, at: this.time };
      this.events.add('evolve');
      return true;
    }
    return false;
  }

  private moveEnemies(dt: number) {
    // AV MODU: bölümün son düşmanları hızlanır ve sonunda oyuncudan HIZLI olur.
    //
    // Bölüm tabanlı oyunda kaçan son birkaç düşman oyuncuyu bölümde kilitler.
    // Testte Ossuary Halls 14 düşmanla 25 dakika sürdü ve hiç bitmedi: o bölümün
    // düşmanları oyuncudan yavaş, kaçanı ASLA yakalayamıyorlar.
    // Bu yüzden hız garantisi düşmanın kendi hızına değil OYUNCU hızına bağlandı —
    // son düşmanlardan kaçılamaz, dönüp savaşmak zorundasın. Bölüm her zaman yakınsar.
    // OYUN TESTİ DÜZELTMESİ: ilk sürüm eşiği 20'ydi ve tabanı oyuncu hızının
    // 1.15 katına çıkarıyordu → oyuncu "düşmanlar koşuyor, full canla öldüm" dedi.
    // 100 düşmanlık bölümde son %20'nin kaçılamaz olması kuşatma demek.
    // Artık SADECE son 8 düşman ve taban oyuncu hızının ALTINDA kalıyor:
    // kaçabilirsin ama mesafe açamazsın → menzilde kalırlar, silah onları biçer.
    // Yakınsama garantisi korunuyor, haksız hız yok.
    const left = this.remaining;
    const playerSpeed = PLAYER.speed * this.stats.moveSpeed;
    let huntFloor = 0;
    if (left > 0 && left <= 8) {
      const t = (8 - left) / 8;                    // 0 → 1 (azaldıkça artar)
      huntFloor = playerSpeed * (0.6 + 0.35 * t);  // son düşmanda ~0.95x oyuncu hızı
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = this.px - e.x;
      const dy = this.py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = e.boss ? e.speed : Math.max(e.speed, huntFloor);
      e.x += (dx / d) * sp * dt;
      e.y += (dy / d) * sp * dt;
      e.animT += dt;
      if (dx > 0.5) e.facingRight = true;
      else if (dx < -0.5) e.facingRight = false;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.contactCd > 0) e.contactCd -= dt;
    }
  }

  private nearestEnemy(range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.x - this.px, dy = e.y - this.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  /** Tüm silahları ilerlet. Motor tek, desen veri — yeni silah = config kaydı. */
  private fire(dt: number) {
    // Yörünge açısı sürekli döner (silah olmasa da; kayıt tutmak ucuz)
    this.orbitAngle = (this.orbitAngle + 2.3 * dt) % (Math.PI * 2);

    for (let i = 0; i < this.weapons.length; i++) {
      const w = this.weapons[i];
      const def = w.def;

      // Yörünge sürekli aktif — bekleme sayacı sadece hasar tiki için
      if (def.pattern === 'orbit') {
        w.cd -= dt;
        if (w.cd <= 0) { w.cd = this.wCooldown(w); this.orbitHit(w); }
        continue;
      }

      w.cd -= dt;
      if (w.cd > 0) continue;

      if (def.pattern === 'aimed') {
        const target = this.nearestEnemy(def.range ?? 600);
        if (!target) continue; // menzilde hedef yoksa bekle, cooldown harcanmaz
        w.cd = this.wCooldown(w);
        this.fireAimed(w, target);
      } else if (def.pattern === 'sweep') {
        w.cd = this.wCooldown(w);
        this.fireSweep(w);
      } else if (def.pattern === 'aura') {
        w.cd = this.wCooldown(w);
        this.fireAura(w);
      }
    }
  }

  /** #1 aimed — en yakın düşmana mermi(ler) */
  private fireAimed(w: OwnedWeapon, target: Enemy) {
    const def = w.def;
    const baseAng = Math.atan2(target.y - this.py, target.x - this.px);
    const n = this.wCount(w);
    const spd = (def.projectileSpeed ?? 450) * this.stats.projSpeed; // Sinew Wrap
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * (def.spreadRad ?? 0.16);
      const a = baseAng + off;
      this.projectiles.push({
        x: this.px, y: this.py,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        damage: this.wDamage(w), radius: 5,
        life: (def.lifeSec ?? 1.5) * this.stats.duration, // Binding Sigil
        pierce: def.pierce ?? 0,
      });
    }
  }

  /** #2 sweep — oyuncunun baktığı yöne yatay kesik; düşmandan geçer */
  private fireSweep(w: OwnedWeapon) {
    const def = w.def;
    const area = this.wArea(w);
    const wdt = (def.sweepW ?? 130) * area;
    const hgt = (def.sweepH ?? 45) * area;
    const n = this.wCount(w); // 2+ olunca her iki yana birden vurur
    const dirs = n >= 2 ? [true, false] : [this.facingRight];
    for (const right of dirs) {
      this.hitZones.push({
        x: this.px + (right ? wdt / 2 : -wdt / 2),
        y: this.py,
        w: wdt, h: hgt,
        life: (def.sweepLifeSec ?? 0.18) * this.stats.duration,
        maxLife: (def.sweepLifeSec ?? 0.18) * this.stats.duration,
        damage: this.wDamage(w),
        facingRight: right,
        hit: new Set<Enemy>(),
      });
    }
  }

  /** #8 aura — yakındaki her düşmana tek seferde hasar */
  private fireAura(w: OwnedWeapon) {
    const r = (w.def.auraRadius ?? 70) * this.wArea(w);
    const dmg = this.wDamage(w);
    const cand = this.grid.query(this.px, this.py, r + 30, this.scratch);
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i];
      if (e.hp <= 0) continue;
      const dx = e.x - this.px, dy = e.y - this.py;
      const rr = r + e.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      this.damageEnemy(e, dmg);
    }
  }

  /** #6 orbit — dönen orb'lar temas ettiğine vurur (düşman başına bekleme ile) */
  private orbitHit(w: OwnedWeapon) {
    const def = w.def;
    const rad = (def.orbitRadius ?? 78) * this.wArea(w);
    const orbR = (def.orbRadius ?? 13) * this.wArea(w);
    const n = this.wCount(w);
    const dmg = this.wDamage(w);
    for (let k = 0; k < n; k++) {
      const a = this.orbitAngle + (k * Math.PI * 2) / n;
      const ox = this.px + Math.cos(a) * rad;
      const oy = this.py + Math.sin(a) * rad;
      const cand = this.grid.query(ox, oy, orbR + 30, this.scratch);
      for (let i = 0; i < cand.length; i++) {
        const e = cand[i];
        if (e.hp <= 0 || e.contactCd > 0) continue;
        const dx = e.x - ox, dy = e.y - oy;
        const rr = orbR + e.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        e.contactCd = CONTACT_HIT_CD;
        this.damageEnemy(e, dmg);
      }
    }
  }

  /** Tek noktadan hasar — ölüm/gem/efekt mantığı burada toplanır */
  private damageEnemy(e: Enemy, dmg: number) {
    e.hp -= dmg;
    e.hitFlash = 0.09;
    this.events.add('hit');
    if (e.hp <= 0) this.killEnemy(e);
  }

  /** Sweep hitbox'larını ilerlet ve temas edenlere vur */
  private updateHitZones(dt: number) {
    for (let i = this.hitZones.length - 1; i >= 0; i--) {
      const z = this.hitZones[i];
      // kesik oyuncuyla birlikte hareket etsin (yerinde asılı kalmasın)
      z.x = this.px + (z.facingRight ? z.w / 2 : -z.w / 2);
      z.y = this.py;

      const cand = this.grid.query(z.x, z.y, Math.max(z.w, z.h) / 2 + 30, this.scratch);
      const hw = z.w / 2, hh = z.h / 2;
      for (let j = 0; j < cand.length; j++) {
        const e = cand[j];
        if (e.hp <= 0 || z.hit.has(e)) continue;
        if (Math.abs(e.x - z.x) > hw + e.radius) continue;
        if (Math.abs(e.y - z.y) > hh + e.radius) continue;
        z.hit.add(e);
        this.damageEnemy(e, z.damage);
      }

      z.life -= dt;
      if (z.life <= 0) this.swapRemove(this.hitZones, i);
    }
  }

  private moveProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.swapRemove(this.projectiles, i);
    }
  }

  private collideProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const cand = this.grid.query(p.x, p.y, p.radius + 30, this.scratch);
      let consumed = false;
      for (let j = 0; j < cand.length; j++) {
        const e = cand[j];
        if (e.hp <= 0) continue;
        const rr = p.radius + e.radius;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy > rr * rr) continue;

        this.damageEnemy(e, p.damage);

        if (p.pierce > 0) { p.pierce -= 1; continue; }
        consumed = true;
        break;
      }
      if (consumed) this.swapRemove(this.projectiles, i);
    }
  }

  /** Ölenleri diziden çıkar. TÜM hasar kaynakları (mermi/sweep/orbit/aura)
   *  işledikten SONRA bir kez çağrılır — yoksa aynı düşman iki kez ödül verir. */
  private reapDead() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) this.swapRemove(this.enemies, i);
    }
  }

  private killEnemy(e: Enemy) {
    this.kills += 1;
    this.stage.killed += 1;
    this.rollRareGold();
    this.gems.push({ x: e.x, y: e.y, xp: e.xp, life: GEM.lifeSec });
    this.events.add('kill');
    if (e.boss) this.chests.push({ x: e.x, y: e.y, evolution: e.boss.evolutionChest });
    // headless koşuda render boşaltmaz → tavan koy, sonsuz büyümesin
    if (this.deaths.length < 256) this.deaths.push({ x: e.x, y: e.y });
  }

  /**
   * NADİR GOLD DÜŞÜŞÜ — musluğun ikinci parçası (Kintara modeli).
   *
   * Kill başına maaş yok; her kill düşük ihtimalle gold düşürür. İhtimal
   * derinlikle iyileşir, böylece derin oyuncu üretici / sığ oyuncu cüzi kalır.
   *
   * ⚠️ Zar HER kill'de atılır (düşse de düşmese de) — yoksa RNG akışı
   * ihtimale bağlı olarak kayar ve aynı seed farklı koşu üretir.
   * ⚠️ greed BURAYA girmez: "gold al → düşüş oranı artır" sarmalı kurulmasın.
   */
  private rollRareGold() {
    const depth = this.stage.depth;
    const hit = this.rng.next() < rareDropChance(depth);
    const roll = this.rng.next();
    if (hit) {
      this.rareGold += rareDropAmount(depth, roll);
      this.events.add('coin');
    }
  }

  private collidePlayer(dt: number) {
    if (this.iframe > 0) return;
    const cand = this.grid.query(this.px, this.py, PLAYER.radius + 30, this.scratch);
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i];
      const rr = PLAYER.radius + e.radius;
      const dx = e.x - this.px, dy = e.y - this.py;
      if (dx * dx + dy * dy > rr * rr) continue;
      // Armor düz azaltma (VS) — ama en az 1 hasar geçer, yoksa yüksek armor
      // oyuncuyu tamamen dokunulmaz yapar ve run hiç bitmez.
      const taken = Math.max(1, e.damage - this.stats.armor);
      this.hp -= taken;
      this.iframe = PLAYER.iframeSec;
      this.events.add('hurt');
      if (this.hp <= 0) {
        if (this.stats.revival > 0) {
          // Second Burial — VS'teki gibi %50 canla dirilir, hak tükenir
          this.stats.revival -= 1;
          this.hp = this.stats.maxHp * 0.5;
          this.iframe = 2.5; // dirilişten sonra nefes payı
          this.revives += 1;
        } else {
          this.hp = 0;
          this.phase = 'dead';
        }
      }
      return; // tek tick'te tek vuruş
    }
  }

  private updateGems(dt: number) {
    const magnet = PLAYER.pickupRadius * this.stats.magnet;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.life -= dt;
      if (g.life <= 0) { this.swapRemove(this.gems, i); continue; }

      const dx = this.px - g.x, dy = this.py - g.y;
      const d = Math.hypot(dx, dy);
      if (d < magnet) {
        // çekim: yaklaştıkça hızlanır (VS'deki mücevher akışı hissi)
        const pull = GEM.magnetSpeed * dt;
        g.x += (dx / (d || 1)) * pull;
        g.y += (dy / (d || 1)) * pull;
      }
      if (d < PLAYER.radius + GEM.radius) {
        this.addXp(g.xp);
        this.events.add('gem');
        this.swapRemove(this.gems, i);
      }
    }
  }

  private addXp(amount: number) {
    this.xp += amount * this.stats.growth; // Grave Crown
    if (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level += 1;
      this.xpNext = xpForLevel(this.level);
      this.rollOffers();
      this.events.add('levelup');
      this.phase = 'levelup';
    }
  }

  /**
   * 3 seçenek üret: silah yükseltmesi + yeni silah + istatistik karışımı.
   * VS deseni: silahlar istatistiklerden ÖNCELİKLİ, yoksa oyuncu tek silahta kalır.
   */
  private rollOffers() {
    const pool: Offer[] = [];

    // sahip olunan ve max'a ulaşmamış silahlar
    for (const w of this.weapons) {
      if (w.level >= w.def.maxLevel) continue;
      pool.push({
        kind: 'weapon-up', id: `w:${w.def.id}`, name: w.def.name,
        desc: `Level ${w.level} → ${w.level + 1}`, level: w.level,
      });
    }
    // slot varsa henüz alınmamış silahlar
    if (this.weapons.length < MAX_WEAPONS) {
      for (const def of WEAPONS) {
        if (this.weapons.some((w) => w.def.id === def.id)) continue;
        pool.push({ kind: 'weapon-new', id: `w:${def.id}`, name: def.name, desc: def.desc });
      }
    }
    // sahip olunan ve max'a ulaşmamış pasifler
    for (const p of this.passives) {
      if (p.level >= p.def.maxLevel) continue;
      pool.push({
        kind: 'passive-up', id: `p:${p.def.id}`, name: p.def.name,
        desc: `${p.def.desc}  (Lv ${p.level} → ${p.level + 1})`, level: p.level,
      });
    }
    // slot varsa henüz alınmamış pasifler
    if (this.passives.length < MAX_PASSIVES) {
      for (const def of PASSIVES) {
        if (this.passives.some((p) => p.def.id === def.id)) continue;
        pool.push({ kind: 'passive-new', id: `p:${def.id}`, name: def.name, desc: def.desc });
      }
    }

    const shuffled = this.rng.shuffle(pool);
    // En az bir SİLAH seçeneği garanti — yoksa oyuncu pasif yağmuruna tutulup
    // tek silahla kalıyor ve build derinliği oluşmuyor.
    const weaponOffers = shuffled.filter((o) => o.kind === 'weapon-up' || o.kind === 'weapon-new');
    const picked: Offer[] = [];
    if (weaponOffers.length) picked.push(weaponOffers[0]);
    for (const o of shuffled) {
      if (picked.length >= 3) break;
      if (picked.includes(o)) continue;
      picked.push(o);
    }
    // KONUM YANLILIĞINI KIR: garantili silah hep 0. sırada kalırsa "hep ilkine
    // basan" oyuncu ömür boyu pasif görmez. Garanti listede OLMAK, sırada değil.
    this.offers = this.rng.shuffle(picked);
  }

  /** levelup fazında seçim uygula */
  choose(id: string) {
    if (this.phase !== 'levelup') return;
    const o = this.offers.find((x) => x.id === id);
    if (!o) return;
    const key = id.slice(2); // "w:" / "p:" önekini at

    switch (o.kind) {
      case 'weapon-new':
        this.giveWeapon(key);
        break;
      case 'weapon-up': {
        const w = this.weapons.find((x) => x.def.id === key);
        if (w && w.level < w.def.maxLevel) w.level += 1;
        break;
      }
      case 'passive-new':
        this.givePassive(key);
        break;
      case 'passive-up': {
        const p = this.passives.find((x) => x.def.id === key);
        if (p && p.level < p.def.maxLevel) {
          p.level += 1;
          // Max HP artışı anında iyileştirir (VS: Hollow Heart aldığında canın artar)
          const before = this.stats.maxHp;
          this.recomputeStats();
          if (this.stats.maxHp > before) this.hp += this.stats.maxHp - before;
        }
        break;
      }
    }
    this.offers = [];
    this.phase = 'running';
  }

  private swapRemove<T>(arr: T[], i: number) {
    const last = arr.length - 1;
    if (i !== last) arr[i] = arr[last];
    arr.pop();
  }

  /**
   * Run özeti — Faz D'de sunucuya bu gönderilecek, ödülü SUNUCU hesaplar.
   *
   * Sunucu `rareGold`'a körlemesine güvenmeyecek: motor deterministik olduğu
   * için aynı seed + aynı mod ile koşuyu yeniden türetip sayıyı doğrulayabilir.
   * `deepestCleared` ise tek tam sayı karşılaştırmasıyla ödüle çevrilir.
   */
  summary() {
    return {
      seed: this.seed,
      mode: this.stage.mode,
      stageId: this.baseStageId,
      depth: this.stage.depth,
      deepestCleared: this.stage.deepestCleared,
      durationSec: Math.round(this.time),
      level: this.level,
      kills: this.kills,
      rareGold: Math.floor(this.rareGold),
      outcome: this.phase,
    };
  }
}
