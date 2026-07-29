// GRAVEBORN simülasyon çekirdeği — saf mantık, DOM/canvas bilgisi YOK.
// Bu ayrım kasıtlı: aynı kod ileride sunucuda headless koşabilir (ödül doğrulaması).
// Render tamamen ayrı (render.ts). Rastgelelik sadece Rng'den (Math.random YASAK).
//
// Bellek deseni: sabit kapasiteli diziler + swap-remove. Her frame yeni nesne
// tahsis edilmez → GC spike'ı yok → frame düşmesi yok.

import { createRng, type Rng } from './rng';
import { SpatialHash } from './spatial';
import { ENEMIES, GEM, PLAYER, RUN, SPAWN, TICK, UPGRADES, WEAPON, xpForLevel, type EnemyType } from './config';

export interface Enemy {
  x: number; y: number; hp: number; maxHp: number;
  speed: number; damage: number; radius: number; xp: number;
  color: string; hitFlash: number;
}
export interface Projectile {
  x: number; y: number; vx: number; vy: number;
  damage: number; radius: number; life: number; pierce: number;
}
export interface Gem { x: number; y: number; xp: number; life: number }

export type Phase = 'running' | 'levelup' | 'dead' | 'won';

export interface Stats {
  damageMul: number;
  cooldownMul: number;
  projCount: number;
  pierce: number;
  speedMul: number;
  magnetMul: number;
  maxHp: number;
  regen: number;
}

export class Game {
  readonly seed: number;
  private rng: Rng;

  // oyuncu
  // NOT: config'deki `as const` yüzünden açık `: number` şart —
  // yoksa TS `hp`'yi literal `100` olarak çıkarır ve atamalar patlar.
  px = 0; py = 0;
  hp: number = PLAYER.maxHp;
  iframe = 0;
  level = 1;
  xp = 0;
  xpNext: number = xpForLevel(1);

  // run durumu
  time = 0;
  phase: Phase = 'running';
  kills = 0;
  gold = 0;

  // yükseltmeler
  stats: Stats = {
    damageMul: 1, cooldownMul: 1, projCount: WEAPON.count, pierce: WEAPON.pierce,
    speedMul: 1, magnetMul: 1, maxHp: PLAYER.maxHp, regen: PLAYER.regenPerSec,
  };
  private taken = new Map<string, number>();
  /** levelup fazında sunulan 3 seçenek */
  offers: typeof UPGRADES[number][] = [];

  // varlıklar
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  gems: Gem[] = [];

  // girdi (birim vektör)
  private inx = 0;
  private iny = 0;

  // dahili
  private fireCd = 0;
  private spawnAcc = 0;
  private grid = new SpatialHash<Enemy>(64);
  private scratch: Enemy[] = [];
  /** ekran yarı-boyutu — spawn ringi için (render katmanı bildirir) */
  private viewW = 800;
  private viewH = 600;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = createRng(seed);
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
    if (this.time >= RUN.durationSec) { this.phase = 'won'; return; }

    this.movePlayer(dt);
    this.rebuildGrid();
    this.spawn(dt);
    this.moveEnemies(dt);
    this.fire(dt);
    this.moveProjectiles(dt);
    this.collideProjectiles();
    this.collidePlayer(dt);
    this.updateGems(dt);

    if (this.stats.regen > 0 && this.hp > 0) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    }
    if (this.iframe > 0) this.iframe -= dt;
  }

  private movePlayer(dt: number) {
    const sp = PLAYER.speed * this.stats.speedMul;
    this.px += this.inx * sp * dt;
    this.py += this.iny * sp * dt;
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

  private availableTypes(): readonly EnemyType[] {
    const m = this.minute;
    // fromMinute geçmiş tipler; en az 1 tip garanti
    const list = ENEMIES.filter((t) => t.fromMinute <= m);
    return list.length ? list : [ENEMIES[0]];
  }

  private spawn(dt: number) {
    const rate = SPAWN.base + this.minute * SPAWN.perMinute;
    this.spawnAcc += rate * dt;
    const types = this.availableTypes();
    const hpScale = 1 + this.minute * SPAWN.hpScalePerMinute;
    const spScale = 1 + this.minute * SPAWN.speedScalePerMinute;

    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.enemies.length >= SPAWN.maxAlive) { this.spawnAcc = 0; break; }
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
      });
    }
  }

  private moveEnemies(dt: number) {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = this.px - e.x;
      const dy = this.py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
    }
  }

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = WEAPON.range * WEAPON.range;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const dx = e.x - this.px, dy = e.y - this.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  private fire(dt: number) {
    this.fireCd -= dt;
    if (this.fireCd > 0) return;
    const target = this.nearestEnemy();
    if (!target) return; // menzilde hedef yoksa cooldown beklemede kalır

    this.fireCd = WEAPON.cooldownSec * this.stats.cooldownMul;
    const baseAng = Math.atan2(target.y - this.py, target.x - this.px);
    const n = this.stats.projCount;
    for (let i = 0; i < n; i++) {
      // tek mermi tam hedefe; çoklu mermi hedefin etrafına simetrik yayılır
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * WEAPON.spreadRad;
      const a = baseAng + off;
      this.projectiles.push({
        x: this.px, y: this.py,
        vx: Math.cos(a) * WEAPON.projectileSpeed,
        vy: Math.sin(a) * WEAPON.projectileSpeed,
        damage: WEAPON.damage * this.stats.damageMul,
        radius: WEAPON.projectileRadius,
        life: WEAPON.projectileLifeSec,
        pierce: this.stats.pierce,
      });
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

        e.hp -= p.damage;
        e.hitFlash = 0.09;
        if (e.hp <= 0) this.killEnemy(e);

        if (p.pierce > 0) { p.pierce -= 1; continue; }
        consumed = true;
        break;
      }
      if (consumed) this.swapRemove(this.projectiles, i);
    }
    // ölenleri temizle
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) this.swapRemove(this.enemies, i);
    }
  }

  private killEnemy(e: Enemy) {
    this.kills += 1;
    this.gold += 1;
    this.gems.push({ x: e.x, y: e.y, xp: e.xp, life: GEM.lifeSec });
  }

  private collidePlayer(dt: number) {
    if (this.iframe > 0) return;
    const cand = this.grid.query(this.px, this.py, PLAYER.radius + 30, this.scratch);
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i];
      const rr = PLAYER.radius + e.radius;
      const dx = e.x - this.px, dy = e.y - this.py;
      if (dx * dx + dy * dy > rr * rr) continue;
      this.hp -= e.damage;
      this.iframe = PLAYER.iframeSec;
      if (this.hp <= 0) { this.hp = 0; this.phase = 'dead'; }
      return; // tek tick'te tek vuruş
    }
  }

  private updateGems(dt: number) {
    const magnet = PLAYER.pickupRadius * this.stats.magnetMul;
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
        this.swapRemove(this.gems, i);
      }
    }
  }

  private addXp(amount: number) {
    this.xp += amount;
    if (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level += 1;
      this.xpNext = xpForLevel(this.level);
      this.rollOffers();
      this.phase = 'levelup';
    }
  }

  /** Alınabilir 3 yükseltme seç (maxStack dolmuşları hariç) */
  private rollOffers() {
    const pool = UPGRADES.filter((u) => (this.taken.get(u.id) ?? 0) < u.maxStack);
    this.offers = this.rng.shuffle([...pool]).slice(0, 3);
  }

  /** levelup fazında seçim uygula */
  choose(id: string) {
    if (this.phase !== 'levelup') return;
    const u = this.offers.find((o) => o.id === id);
    if (!u) return;
    this.taken.set(id, (this.taken.get(id) ?? 0) + 1);
    const s = this.stats;
    switch (id) {
      case 'dmg': s.damageMul *= 1.2; break;
      case 'rate': s.cooldownMul *= 0.88; break;
      case 'count': s.projCount += 1; break;
      case 'pierce': s.pierce += 1; break;
      case 'speed': s.speedMul *= 1.1; break;
      case 'magnet': s.magnetMul *= 1.35; break;
      case 'hp': s.maxHp += 20; this.hp = s.maxHp; break;
      case 'regen': s.regen += 0.4; break;
    }
    this.offers = [];
    this.phase = 'running';
  }

  private swapRemove<T>(arr: T[], i: number) {
    const last = arr.length - 1;
    if (i !== last) arr[i] = arr[last];
    arr.pop();
  }

  /** Run özeti — ileride sunucuya bu gönderilecek (ödülü SUNUCU hesaplar) */
  summary() {
    return {
      seed: this.seed,
      durationSec: Math.round(this.time),
      level: this.level,
      kills: this.kills,
      gold: this.gold,
      outcome: this.phase,
    };
  }
}
