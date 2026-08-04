// HAFTALIK ORTAK BOSS — saf taraf.
//
// Çalıştır:  npx tsx src/game/worldBoss.test.mts
//
// ⚠️ ASIL SORU: hasar tavanı DÜRÜST oyuncuyu kırpmadan yalancıyı kesiyor mu?
// Bu, `reward.ts`'teki süre tabanıyla aynı denge — ve orada iki kez yanlış
// ayarlanmıştı (bir kez çok geniş, bir kez çok dar). Burada gerçek koşuyla
// ölçüyoruz, tahminle değil.

import { Game } from './engine.js';
import { TICK, STAGES } from './config.js';
import { permanentBonus } from './forge.js';
import { seedFromString } from './rng.js';
import {
  BOSS_RUN_SEC, BOSS_ROOM_HP, WORLD_BOSSES,
  bossOfWeek, bossProgress, bossRoomStage, bossWeek, maxBossDamage, weekEndsAt,
} from './worldBoss.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ HAFTALIK ORTAK BOSS ═══');

console.log('\n[1] Hafta hesabı');
{
  // 2026-08-03 bir Pazartesi
  const pzt = new Date('2026-08-03T00:00:00Z');
  const paz = new Date('2026-08-09T23:59:00Z');
  const sonrakiPzt = new Date('2026-08-10T00:00:00Z');
  check('Pazartesi ile Pazar AYNI hafta', bossWeek(pzt) === bossWeek(paz),
    `${bossWeek(pzt)} = ${bossWeek(paz)}`);
  // ⚠️ Sınır kayması en sinsi hata: bir gün önce/sonra tüm oyuncular farklı
  // boss görür ve "ortak" olma sözü çöker
  check('sonraki Pazartesi YENİ hafta', bossWeek(sonrakiPzt) === bossWeek(pzt) + 1);
  check('hafta bitişi sonraki Pazartesi 00:00',
    weekEndsAt(bossWeek(pzt)) === sonrakiPzt.getTime(),
    new Date(weekEndsAt(bossWeek(pzt))).toISOString());

  // Herkes aynı hafta AYNI boss'u görmeli — döngü deterministik
  check('aynı hafta aynı boss', bossOfWeek(bossWeek(pzt)).id === bossOfWeek(bossWeek(paz)).id);
  check('negatif hafta çökmüyor', !!bossOfWeek(-3)?.id, bossOfWeek(-3).id);
  check('boss döngüsü dönüyor',
    bossOfWeek(0).id !== bossOfWeek(1).id
    && bossOfWeek(0).id === bossOfWeek(WORLD_BOSSES.length).id);
}

console.log('\n[2] Boss havuzu');
{
  const ids = WORLD_BOSSES.map((b) => b.id);
  check('id\'ler benzersiz', new Set(ids).size === ids.length);
  // ⚠️ ORTAK olmasının şartı: tek kişinin deviremeyeceği kadar can.
  // Tavan × 5 dakika × makul koşu sayısı bile havuzun küçük bir dilimi olmalı.
  // ⚠️ İKİ AYRI SORU, İKİ AYRI ÖLÇÜ. İlk sürümde tek eşik kullanıldı ve
  // yanlıştı: TAVAN bir hile sınırı (gerçeğin 18-48 katı), tasarım ölçüsü
  // değil. Tavanı "oyuncu ne kadar vurur" sanmak kategori hatası.
  const tekKosuTavani = maxBossDamage(BOSS_RUN_SEC, permanentBonus({ might: 20, amount: 3 }));
  const enKucukHavuz = Math.min(...WORLD_BOSSES.map((b) => b.hp));
  const tavandanKosu = Math.ceil(enKucukHavuz / tekKosuTavani);
  console.log(`     en küçük havuz ${enKucukHavuz.toLocaleString('tr-TR')}`);
  console.log(`     TAVANDAN iddia: ${tekKosuTavani.toLocaleString('tr-TR')}/koşu → ${tavandanKosu} koşu`);
  check('tek oyuncu tek koşuda deviremiyor', tekKosuTavani < enKucukHavuz);
  // ⚠️ Bu eşik ORTAK olduğu için sert: kırpılmış bir gold iddiasının maliyeti
  // kendisiyle sınırlı, burada TEK hile herkesin haftasını bitirebilir.
  // Her koşu sunucu saatiyle 5 dakika sürdüğü için 25 koşu ≈ 2 saat gerçek süre.
  check('TAVANDAN iddia eden bile en az 25 koşu harcar', tavandanKosu >= 25, `${tavandanKosu}`);
}

console.log('\n[3] ⭐ HASAR TAVANI — gerçek koşuyla ölçüm');
{
  // Gerçek bir boss odası koşusu oynat ve tavanla karşılaştır.
  // ⚠️ Oyuncu ÖLMEMELİ: ölünce step() no-op olur ve test hiçbir şey
  // ölçmeden "geçer" (bu tuzağa projede bir kez düşüldü).
  const oynat = (seed: string, upgrades: Record<string, number>) => {
    const def = bossOfWeek(0);
    const perm = permanentBonus(upgrades);
    const g = new Game(seedFromString(seed), bossRoomStage(def), perm);
    g.setViewport(1280, 720);
    const limit = Math.round(BOSS_RUN_SEC / TICK);
    let ticks = 0;
    for (let i = 0; i < limit; i++) {
      if (g.phase === 'levelup') {
        const o = g.offers.find((x) => x.kind === 'weapon-new') ?? g.offers[0];
        g.choose(o.id);
      }
      if (g.phase !== 'running') break;
      g.hp = g.stats.maxHp;                    // hayatta kalmayı değil hasarı ölçüyoruz
      const t = i * TICK;
      const c = t % 3;
      g.setInput(...(c < 1.5 ? [Math.cos(t * 0.7), Math.sin(t * 0.7)] as const : [0, 0] as const));
      g.step();
      ticks = i + 1;
    }
    return { damage: g.bossDamage, sec: ticks * TICK, perm };
  };

  let enDarOran = Infinity;
  for (const [seed, up] of [
    ['wb1', {}],
    ['wb2', { might: 10, amount: 1 }],
    ['wb3', { might: 20, amount: 3, cooldown: 12 }],
  ] as const) {
    const r = oynat(seed, up as Record<string, number>);
    const tavan = maxBossDamage(r.sec, permanentBonus(up as Record<string, number>));
    const oran = tavan / Math.max(1, r.damage);
    enDarOran = Math.min(enDarOran, oran);
    console.log(`     ${seed}: ${Math.round(r.damage).toLocaleString('tr-TR')} hasar / ` +
      `${Math.round(r.sec)} sn · tavan ${tavan.toLocaleString('tr-TR')} (${oran.toFixed(1)}x)`);
    check(`${seed}: DÜRÜST koşu kırpılmıyor`, r.damage <= tavan,
      `${Math.round(r.damage)} ≤ ${tavan}`);
    check(`${seed}: boss'a gerçekten hasar veriliyor`, r.damage > 0, `${Math.round(r.damage)}`);
  }
  // ⚠️ Tavan gerçeğin katbekat üstündeyse yalan söylemek hâlâ kârlı. Ama
  // burada oran, gold tavanındakinden GENİŞ olabilir: ödül gold değil, yani
  // şişirmenin maliyeti sadece bir sıralama satırı.
  console.log(`     en dar oran ${enDarOran.toFixed(1)}x`);
  check('tavan sonsuz değil (yapısal sınır var)', Number.isFinite(enDarOran) && enDarOran < 200,
    `${enDarOran.toFixed(1)}x`);
}

console.log('\n[4] Tavan girdilere doğru tepki veriyor');
{
  const bos = maxBossDamage(300, {});
  const guclu = maxBossDamage(300, permanentBonus({ might: 20, amount: 3 }));
  check('Forge\'lu oyuncunun tavanı DAHA YÜKSEK', guclu > bos, `${bos} → ${guclu}`);
  check('süre arttıkça tavan artıyor', maxBossDamage(300, {}) > maxBossDamage(60, {}));
  check('sıfır süre sıfır tavan', maxBossDamage(0, {}) === 0);
  // ⚠️ Süre İSTEMCİDEN gelmiyor ama yine de sınırlanmalı: sunucu saati
  // bozulsa bile tavan sonsuza gitmemeli
  check('süre tavanı kendisi de sınırlı',
    maxBossDamage(999_999, {}) === maxBossDamage(BOSS_RUN_SEC + 30, {}),
    'BOSS_RUN_SEC + 30 ile kırpılıyor');
}

console.log('\n[5] Oda sahnesi');
{
  const def = bossOfWeek(0);
  const st = bossRoomStage(def);
  check('odada boss var', !!st.boss, st.boss?.label);
  check('oda canı ORTAK can değil', st.boss!.hp === BOSS_ROOM_HP && st.boss!.hp < def.hp,
    `${st.boss!.hp} ≪ ${def.hp}`);
  check('oda gold ödemiyor', st.firstClearGold === 0);
  // Düşman havuzu gerçekten var mı — olmayan id sessizce daireye düşerdi
  const bilinen = new Set(STAGES.flatMap((s) => s.enemies));
  const eksik = st.enemies.filter((e) => !bilinen.has(e));
  check('oda düşmanları bilinen tipler', eksik.length === 0, eksik.join(', ') || 'hepsi tanımlı');
}

console.log('\n[6] İlerleme çubuğu');
{
  check('tam can → %0', bossProgress(100, 100) === 0);
  check('yarı can → %50', Math.abs(bossProgress(50, 100) - 0.5) < 1e-9);
  check('sıfır can → %100', bossProgress(0, 100) === 1);
  check('negatif can taşmıyor', bossProgress(-500, 100) === 1);
  check('maxHp 0 çökmüyor', bossProgress(0, 0) === 0);
}

console.log(`\n${FAIL.length === 0 ? '✅ ORTAK BOSS SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
