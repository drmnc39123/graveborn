// KAMPANYA TESTİ — 25 bölümün hepsi gerçekten bitirilebiliyor mu?
//
// NİYE VAR: bölüm eklemek `config.ts`'e satır yazmakla bitmiyor. Bir bölüm
// bitirilemezse oyuncu orada TAKILIR ve arkasındaki her şey ölü içerik olur —
// ve bu hiçbir hata üretmez, sadece oyun bozuk hissettirir.
//
// ⚠️ Oyuncu ÖLÜMSÜZ ölçülüyor. Amaç "bu bölüm zor mu" değil (zorluk
// `hours.test.mts`in işi), "bu bölüm BİTİYOR mu ve NE KADAR sürüyor".
// Ölümü de ölçseydik sonuç YZ sürücüsünün beceriksizliğini ölçerdi.
//
// ⚠️ Forge bölüm numarasıyla birlikte doluyor kabul ediliyor — 25. bölüme
// boş Forge'la gelen oyuncu yok. Sabit bir Forge varsaymak, geç bölümleri
// olduğundan çok daha zor gösterirdi.
//
// ⚠️ YAVAŞ (~25-40 dk): 25 bölüm × 3 seed × 15 dk simülasyon. Bu bir DERİN
// kontrol — her commit'te değil, bölüm/denge değişince koşturulur.
//
// Çalıştır:  npx tsx src/game/campaign.test.mts

import { Game } from './engine.js';
import { STAGES, TICK } from './config.js';
import { FORGE, permanentBonus } from './forge.js';
import { seedFromString } from './rng.js';
import { emptyProgress } from './progress.js';
import { unlockedWeapons } from './unlocks.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

/** Bölüm başına tavan — ham minimum en uzun 7,7 dk, 15 rahat bir pay */
const TAVAN_SN = 15 * 60;

function flee(g: any): [number, number] {
  let ax = 0, ay = 0, t = 0;
  for (const e of g.enemies) {
    const dx = e.x - g.px, dy = e.y - g.py, d2 = dx * dx + dy * dy;
    if (d2 > 260 * 260) continue;
    const d = Math.sqrt(d2) || 1; ax += dx / d / d; ay += dy / d / d; if (d < 120) t++;
  }
  let vx = -ax, vy = -ay;
  if (t < 3 && g.gems.length) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < g.gems.length; i++) {
      const dx = g.gems[i].x - g.px, dy = g.gems[i].y - g.py, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    if (bi >= 0) {
      const dx = g.gems[bi].x - g.px, dy = g.gems[bi].y - g.py;
      const d = Math.hypot(dx, dy) || 1, w = t === 0 ? 1.4 : 0.6;
      vx += dx / d * w; vy += dy / d * w;
    }
  }
  const dist = Math.hypot(g.px, g.py);
  if (dist > 2100) { vx += -g.px / dist * 0.6; vy += -g.py / dist * 0.6; }
  return [vx, vy];
}

function pick(g: any): string {
  const p = (o: any) => {
    if (o.kind === 'weapon') return o.level ? 100 : 90;
    const s = o.stat;
    if (s === 'might') return 80;
    if (s === 'maxHp' || s === 'armor') return 70;
    if (s === 'cooldown') return 65;
    return 40;
  };
  return [...g.offers].sort((a: any, b: any) => p(b) - p(a))[0].id;
}

/** O bölüme ULAŞAN oyuncunun Forge'u — 20. bölümde tam dolu kabul */
function permFor(stageId: number) {
  const oran = Math.min(1, stageId / 20);
  const lv: Record<string, number> = {};
  for (const u of FORGE) lv[u.id] = Math.floor(u.maxLevel * oran);
  return permanentBonus(lv);
}

console.log(`\n═══ KAMPANYA — ${STAGES.length} BÖLÜM ═══\n`);

/**
 * ⚠️ BÖLÜM BAŞINA ÜÇ SEED. Tek seed ölçmek YANLIŞ ALARM veriyordu: bölüm 11
 * bir seed'de takılıyor ama beş seed'de 5/5 bitiyordu. Fark dengeden değil
 * KART ŞANSINDAN geliyor — erken level-up'larda hasar gelmezse oyuncu
 * kartopunu kaçırıyor ve bir daha toparlayamıyor.
 *
 * Bu varyans türün doğası; test onu ÖLÇMELİ, ondan şikâyet etmemeli.
 * Eşik: 3 seed'in en az 2'si bitmeli.
 */
const SEED_SAYISI = 3;

let toplamSn = 0;
const bitmeyen: number[] = [];
const uzun: number[] = [];

for (const st of STAGES) {
  const sureler: number[] = [];
  let biten = 0;
  for (let k = 0; k < SEED_SAYISI; k++) {
    // ⚠️ SİLAH KİLİDİ MODELLENİYOR — testin ADI "kampanya İLK GEÇİŞİ".
    // Önce tüm silahlar açık varsayılıyordu ve bu ölçümü olduğundan HIZLI
    // gösteriyordu: gerçek ilk geçişte oyuncunun elinde 25. bölümde bile
    // kampanyayla açılabilen silahlar var, hepsi değil. Ölçüm neyi iddia
    // ediyorsa onu ölçmeli.
    // ⚠️ `depthPaid` BOŞ: saf kampanya oyuncusu Descent'e hiç inmemiş sayılır,
    // yani derinliğe bağlı silahlar (toll, soul) kapalı. Bu bilinçli olarak
    // EN KÖTÜ hâl — gerçek oyuncu daha hızlı bitirir.
    const oGunkuIlerleme = {
      ...emptyProgress(),
      cleared: Object.fromEntries(STAGES.filter((x) => x.id < st.id).map((x) => [x.id, true])),
    };
    const g: any = new Game(seedFromString(`camp-${st.id}-${k}`), st, permFor(st.id) as any,
      'campaign', undefined, 1, 0, unlockedWeapons(oGunkuIlerleme));
    g.setViewport(1280, 720);
    const max = Math.round(TAVAN_SN / TICK);
    for (let i = 0; i < max; i++) {
      if (g.phase === 'levelup') { g.choose(pick(g)); continue; }
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;   // ölçüm: süre ve bitirilebilirlik (bkz. başlık)
      g.setInput(...flee(g));
      g.step();
    }
    if (g.phase === 'won') { biten += 1; sureler.push(g.time); }
  }
  // Ortanca SADECE bitenlerden — takılan koşu ortalamayı bozmasın
  const ortanca = sureler.length
    ? [...sureler].sort((a, b) => a - b)[Math.floor(sureler.length / 2)] : TAVAN_SN;
  toplamSn += ortanca;
  if (biten < 2) bitmeyen.push(st.id);
  if (ortanca > 12 * 60) uzun.push(st.id);
  console.log(`  b${String(st.id).padStart(2)} ${st.name.padEnd(24)} ${biten}/${SEED_SAYISI} bitti  ortanca ${(ortanca / 60).toFixed(1).padStart(5)} dk`);
}

console.log(`
  KAMPANYA TOPLAMI (ortancalar): ${(toplamSn / 3600).toFixed(1)} SAAT (${(toplamSn / 60).toFixed(0)} dk)
`);

check("TÜM bölümler bitirilebiliyor (3 seed'in en az 2'si)", bitmeyen.length === 0,
  bitmeyen.length ? `takılan: ${bitmeyen.join(', ')}` : `${STAGES.length}/${STAGES.length}`);
check('hiçbir bölümün ORTANCASI 12 dakikayı geçmiyor', uzun.length === 0,
  uzun.length ? `uzun: ${uzun.join(', ')}` : 'tamam');
// ⚠️ Kullanıcının şikâyetiydi: "10 bölümde oyun mu biter". Ölçülen hedef.
check('kampanya ilk geçişi 3 saatten uzun', toplamSn > 3 * 3600,
  `${(toplamSn / 3600).toFixed(1)} saat`);


console.log(`\n${FAIL.length === 0 ? '✅ KAMPANYA SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
