// TUTORIAL — ilk koşuya GÖMÜLÜ, ayrı bir mod değil.
//
// ⚠️ AYRI BİR "TUTORIAL BÖLÜMÜ" YAPILMADI ve bu bilinçli: survivors-like'ta
// öğrenilecek şeylerin çoğu (mücevher topla, kart seç, dokunma) ilk 60
// saniyede zaten oluyor. Ayrı bir bölüm, oyuncuyu asıl oyundan önce bir
// kopyasını oynamaya zorlar ve huniyi ikiye böler.
//
// ⚠️ MOTORA HİÇ DOKUNMAZ. Buradaki her şey `Game`'i OKUR; tek bir alan
// yazılmaz, tek bir `rng.next()` tüketilmez. İpuçları sunum katmanında
// yaşıyor, tıpkı `fx.ts` gibi.
//
// ⚠️ HER İPUCU BİR KEZ. Aynı cümleyi ikinci kez göstermek bilgi değil
// gürültüdür; oyuncu üçüncüsünde okumayı bırakır ve GERÇEKTEN önemli olanı
// da kaçırır.

import type { Game } from './engine';

export interface HintDef {
  id: string;
  /** ekranda görünen metin — İNGİLİZCE, tek nefeste okunacak kadar kısa */
  text: string;
  /** kaç saniye ekranda kalsın */
  hold: number;
  /** ⚠️ SAF ve YAN ETKİSİZ — sadece okur */
  when: (g: Game) => boolean;
}

/**
 * İpuçları ÖNCELİK SIRASINDA. Aynı anda birden fazlası uyarsa ilki kazanır;
 * "canın bitiyor" uyarısı "mücevher topla"nın önünde olmalı.
 */
export const HINTS: readonly HintDef[] = [
  {
    id: 'move',
    text: 'WASD or arrows to move. You never swing — your weapons do that on their own.',
    hold: 6,
    when: (g) => g.time > 0.6 && g.time < 30,
  },
  {
    id: 'gems',
    // ⚠️ En sık kaçırılan mekanik. Yeni oyuncu düşmandan kaçar, kendi
    // düşürdüğü mücevherden de kaçar ve seviye atlamadan ölür.
    text: 'Walk over the shards. Picking them up is the only way you get stronger in a run.',
    hold: 7,
    when: (g) => g.level === 1 && g.gems.length >= 3 && g.time > 9,
  },
  {
    id: 'levelup',
    text: 'Weapons hit. Passives make everything you own hit harder. You cannot have both of everything.',
    hold: 8,
    when: (g) => g.phase === 'levelup' && g.level === 2,
  },
  {
    id: 'hurt',
    text: 'They hurt by touching you. There is no block here — only not being there.',
    hold: 6,
    when: (g) => g.hurtT > 0 && g.hp < g.stats.maxHp,
  },
  {
    id: 'chest',
    text: 'A chest. Clear what is left and it opens — evolutions only come out of these.',
    hold: 7,
    when: (g) => g.chests.length > 0,
  },
  {
    id: 'boss',
    text: 'It cannot be hurt while it is arriving. Watch what it does before it does it.',
    hold: 7,
    when: (g) => g.enemies.some((e) => !!e.boss && e.boss.intro > 0),
  },
  {
    id: 'lowhp',
    text: 'Almost out. Nothing heals you down here unless you bought it at the Forge.',
    hold: 6,
    when: (g) => g.hp > 0 && g.hp < g.stats.maxHp * 0.25,
  },
  {
    id: 'depth',
    // ⚠️ Descent'in TEK kuralı bu ve söylenmezse oyuncu "neden öldüm"
    // sorusunu hiç cevaplayamaz.
    text: 'Health does not refill between depths. That, not the clock, is what ends a descent.',
    hold: 8,
    when: (g) => g.stage.mode === 'descent' && g.stage.depth > g.startDepth,
  },
] as const;

/** Sırada gösterilecek ipucu — hiçbiri uymuyorsa null. SAF. */
export function nextHint(g: Game, seen: readonly string[]): HintDef | null {
  for (const h of HINTS) {
    if (seen.includes(h.id)) continue;
    if (h.when(g)) return h;
  }
  return null;
}

// ── DEPO ──────────────────────────────────────────────────────────────
// ⚠️ Cihaza özel, hesaba değil: tutorial bir KİŞİYE öğretiyor. Aynı oyuncu
// telefonunda ilk kez oynuyorsa ipuçlarını yeniden görmesi doğru.

const KEY = 'graveborn:tutorial:v1';

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function store(): KeyValueStore | null {
  const g = globalThis as unknown as { localStorage?: KeyValueStore };
  return g.localStorage ?? null;
}

export function loadSeenHints(): string[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    // Bilinmeyen id'ler elenir: ipucu silinip yeniden eklenirse eski kayıt
    // onu sonsuza kadar gizlemesin
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && HINTS.some((h) => h.id === x))
      : [];
  } catch {
    return [];
  }
}

export function markHintSeen(id: string) {
  const s = store();
  if (!s) return;
  try {
    const next = [...new Set([...loadSeenHints(), id])];
    s.setItem(KEY, JSON.stringify(next));
  } catch { /* kota dolu — sessiz geç */ }
}

/** Ayarlardan "ipuçlarını sıfırla" için */
export function resetHints() {
  const s = store();
  if (!s) return;
  try { s.setItem(KEY, '[]'); } catch { /* sessiz */ }
}
