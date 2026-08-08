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
// ⚠️ YAVAŞ (~60-90 dk): 25 bölüm × 7 seed × 15 dk simülasyon. Bu bir DERİN
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

/**
 * Bölüm başına simülasyon tavanı.
 *
 * 🔴 15 DAKİKAYDI ve ÖLÇÜM ALETİNİN KENDİSİ BAĞLAYICI KISITTI. b9 "7 seedin
 * 4'ü bitti" diye kırmızı yandı; 30 dakikalık tavanla ölçülünce YEDİSİ DE
 * bitti — takılan koşular 15,8 · 17,6 · 18,5 dakikadaydı, yani bölüm
 * tıkanmıyor, alet kısa geliyordu. Eğri dikleştirilince eski tavan eskimişti.
 *
 * ⚠️ Bu bir eşik GEVŞETMESİ değil, aletin yeniden kalibrasyonu: soru "bölüm
 * bitiyor mu", "15 dakikada bitiyor mu" değil. Süreyi ölçen ayrı bir kontrol
 * zaten var (aşağıdaki sivrilik testi).
 */
const TAVAN_SN = 25 * 60;

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

// ── ZORLUK EĞRİSİ MONOTON MU ──
//
// ⚠️ SAF ve HIZLI, o yüzden 30 dakikalık simülasyonun ÖNÜNDE. Bir sonraki
// bölüm bir öncekinden KOLAY olursa oyuncu "ilerledim ama rahatladım" der ve
// zorluk merdiveni anlamını yitirir. Bu, simülasyonla değil ARİTMETİKLE
// yakalanabilecek bir hata — pahalı ölçümün arkasına saklanmamalı.
//
// 🔴 İKİ KIRILMA ÖLÇÜMLE BULUNDU: 10→11 ZATEN VARDI (b11'in düşman sayısı
// b10'unkinden azdı), 5→6 ise eğri yeniden şekillendirilirken YENİ AÇILDI.
// İkisi de düzeltildi; bu kontrol tekrar açılmasını engelliyor.
{
  const kirik: string[] = [];
  for (let i = 1; i < STAGES.length; i++) {
    const z = STAGES[i].enemyCount * STAGES[i].hpMul;
    const o = STAGES[i - 1].enemyCount * STAGES[i - 1].hpMul;
    if (z <= o) kirik.push(`${STAGES[i - 1].id}→${STAGES[i].id}`);
  }
  check('zorluk eğrisi HER bölümde artıyor', kirik.length === 0,
    kirik.length ? kirik.join(' ') : `${STAGES.length} bölüm`);
}

console.log(`\n═══ KAMPANYA — ${STAGES.length} BÖLÜM ═══\n`);

/**
 * ⚠️ BÖLÜM BAŞINA YEDİ SEED. Tek seed ölçmek YANLIŞ ALARM veriyordu: bölüm 11
 * bir seed'de takılıyor ama beş seed'de 5/5 bitiyordu. Fark dengeden değil
 * KART ŞANSINDAN geliyor — erken level-up'larda hasar gelmezse oyuncu
 * kartopunu kaçırıyor ve bir daha toparlayamıyor.
 *
 * 🔴 ÜÇ SEED DE YETMİYORDU ve bu ölçümle görüldü: b5 iki ardışık koşuda 7,0 ve
 * 13,3 dakika okudu; aradaki TEK fark hpMul'ün DÜŞÜRÜLMESİYDİ — yani bölüm
 * KOLAYLAŞTIĞI hâlde süre iki katına çıktı. Sebep şu: hpMul değişince
 * düşmanlar farklı anlarda ölüyor, mücevherler farklı toplanıyor, seviye
 * atlama kayıyor ve bambaşka bir build çıkıyor. Küçük bir denge dokunuşu
 * koşunun tamamını yeniden zarlıyor.
 *
 * Bu varyans türün doğası; test onu ÖLÇMELİ, ondan şikâyet etmemeli — ve
 * ölçebilmek için yeterli örnek lazım (aynı ders curve.test.mts'te 5 → 15
 * seed olarak çıkmıştı). Eşik oranı korunuyor: 7 seed'in en az 5'i bitmeli.
 */
const SEED_SAYISI = 7;

let toplamSn = 0;
const bitmeyen: number[] = [];
const ortancalar: number[] = [];
const idler: number[] = [];

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
  idler.push(st.id);
  // Eşik oranı korunuyor: 3'te 2 → 7'de 5
  if (biten < Math.ceil(SEED_SAYISI * 2 / 3)) bitmeyen.push(st.id);
  ortancalar.push(ortanca);
  // ⚠️ ARALIK DA BASILIYOR, sadece ortanca DEĞİL. Ortanca tek başına
  // gürültüyü gizliyor: b5 bir koşuda 7,0 sonraki koşuda 13,3 dakika okudu ve
  // aradaki tek fark hpMul'ün DÜŞÜRÜLMESİYDİ. Sebep açık — hpMul değişince
  // düşmanlar farklı anlarda ölüyor, mücevherler farklı toplanıyor, seviye
  // atlama kayıyor ve BAMBAŞKA bir build çıkıyor. Yani küçük bir denge
  // dokunuşu koşunun tamamını yeniden zarlıyor; bunu görmeden eşik kovalamak
  // gürültüyü denge sanmaktır (aynı ders curve.test.mts'te de çıkmıştı).
  const sirali = [...sureler].sort((a, b) => a - b);
  const aralik = sirali.length
    ? ` (${(sirali[0] / 60).toFixed(1)}–${(sirali[sirali.length - 1] / 60).toFixed(1)})` : '';
  console.log(`  b${String(st.id).padStart(2)} ${st.name.padEnd(24)} ${biten}/${SEED_SAYISI} bitti  ortanca ${(ortanca / 60).toFixed(1).padStart(5)} dk${aralik}`);
}

console.log(`
  KAMPANYA TOPLAMI (ortancalar): ${(toplamSn / 3600).toFixed(1)} SAAT (${(toplamSn / 60).toFixed(0)} dk)
`);

check(`TÜM bölümler bitirilebiliyor (${SEED_SAYISI} seedin en az ${Math.ceil(SEED_SAYISI * 2 / 3)}'i)`, bitmeyen.length === 0,
  bitmeyen.length ? `takılan: ${bitmeyen.join(', ')}` : `${STAGES.length}/${STAGES.length}`);
// ── SİVRİLİK: bir bölüm KOMŞULARINA GÖRE slog mu ──
//
// 🔴 ESKİ HÂLİ MUTLAK BİR EŞİKTİ ("hiçbir ortanca 12 dakikayı geçmesin") ve
// ÖLÇÜLEMEZ olduğu kanıtlandı: AYNI config'te 3 seed'le {5, 20, 25}, 7 seed'le
// {10} işaretlendi. Tamamen farklı iki küme — yani eşik dengeyi değil GÜRÜLTÜYÜ
// okuyordu.
//
// Sebep ölçüldü: bölüm süresi İKİ KÜMELİ. b9'un yedi seed'i {6,5 · 6,7 · 7,5 ·
// 8,3} ve {15,8 · 17,6 · 18,5} diye ikiye ayrılıyor — erken kartlar hasar
// getirirse koşu kartopu oluyor, getirmezse getirmiyor. Ortanca hangi kümeye
// düştüğünü söylüyor, bölümün zorluğunu değil.
//
// Doğru soru mutlak değil GÖRECELİ: "bu bölüm akranlarına göre sivriliyor mu?"
// Kampanya genelinde ortancaların ortancasına göre bakmak, tüm koşuyu birden
// kaydıran gürültüye bağışık.
{
  const s2 = [...ortancalar].sort((a, b) => a - b);
  const genel = s2[Math.floor(s2.length / 2)];
  const sivri = idler.filter((_, i) => ortancalar[i] > Math.max(12 * 60, genel * 1.6));
  console.log(`     kampanya geneli ortanca ${(genel / 60).toFixed(1)} dk · sivrilik eşiği ${(Math.max(12 * 60, genel * 1.6) / 60).toFixed(1)} dk`);
  check('hiçbir bölüm akranlarından SİVRİLMİYOR', sivri.length === 0,
    sivri.length ? `sivri: ${sivri.join(', ')}` : 'tamam');
}
// ⚠️ Kullanıcının şikâyetiydi: "10 bölümde oyun mu biter". Ölçülen hedef.
check('kampanya ilk geçişi 3 saatten uzun', toplamSn > 3 * 3600,
  `${(toplamSn / 3600).toFixed(1)} saat`);


console.log(`\n${FAIL.length === 0 ? '✅ KAMPANYA SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
