// BAŞARIMLAR + GÜNLÜK SERİ.
//
// Çalıştır:  npx tsx src/game/achievements.test.mts
//
// ⚠️ ASIL SORULAR:
//   1. Koşullar SADECE Progress'ten mi okunuyor (sunucu doğrulayabilir mi)
//   2. Ödüller ekonomiye gold EKLİYOR MU (eklememeli)
//   3. Seri, sistem saati ileri alınarak sömürülebiliyor mu

import { ACHIEVEMENTS, achievementStates } from './achievements.js';
import { earnedCosmetics, rollableCosmetics, cosmeticById } from './cosmetics.js';
import { STAGES } from './config.js';
import {
  STREAK, claimAchievement, claimStreak, emptyProgress, streakReward, utcDay,
  type Progress,
} from './progress.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

console.log('\n═══ BAŞARIMLAR + SERİ ═══');

console.log('\n[1] Tanım bütünlüğü');
{
  const ids = ACHIEVEMENTS.map((a) => a.id);
  check('id\'ler benzersiz', new Set(ids).size === ids.length, `${ids.length} başarım`);
  check('her başarımın hedefi pozitif', ACHIEVEMENTS.every((a) => a.goal > 0));
  check('her başarım toz veriyor', ACHIEVEMENTS.every((a) => a.dust > 0));

  // ⚠️ Ödül kozmetiği GERÇEKTEN var mı — olmayan bir id, ödülü sessizce
  // yutardı ve oyuncu "başarımı aldım ama bir şey gelmedi" derdi
  const eksik = ACHIEVEMENTS
    .filter((a) => a.cosmetic && !cosmeticById(a.cosmetic))
    .map((a) => `${a.id} → ${a.cosmetic}`);
  check('ödül kozmetikleri tanımlı', eksik.length === 0, eksik.join(', ') || 'hepsi var');

  // ⚠️ Ödül kozmetikleri SATIN ALINAMAZ olmalı — çekilişten de çıkarsa
  // başarımın tek değeri yok olur
  const cekilebilir = ACHIEVEMENTS
    .filter((a) => a.cosmetic && rollableCosmetics().some((c) => c.id === a.cosmetic))
    .map((a) => a.cosmetic);
  check('ödül kozmetikleri çekilişte YOK', cekilebilir.length === 0,
    cekilebilir.join(', ') || `${earnedCosmetics().length} kazanılan`);
}

console.log('\n[2] ⭐ ÖDÜLLER EKONOMİYE GOLD EKLEMİYOR');
{
  // Faz 2'de dengelenen musluk/sink oranını korumanın tek yolu: başarımlar
  // gold VERMEMELİ. Toz ve kozmetik ekonomiden gold çıkarmıyor da eklemiyor da.
  const p: Progress = { ...emptyProgress(), gold: 1000, cleared: { 1: true } };
  const out = claimAchievement(p, 'a_first_road');
  check('gold DEĞİŞMEDİ', out.progress.gold === 1000, `${out.progress.gold}`);
  check('toz verildi', out.progress.dust > 0, `${out.progress.dust}`);
  check('başarım işaretlendi', out.progress.achievements.includes('a_first_road'));
  check('saf: girdi değişmedi', p.dust === 0 && p.achievements.length === 0);
}

console.log('\n[3] Alma kapısı');
{
  const bos = emptyProgress();
  check('tamamlanmamış başarım alınamıyor',
    claimAchievement(bos, 'a_depth_40').error === 'not finished');
  check('bilinmeyen id reddediliyor',
    claimAchievement(bos, 'yok-boyle') !== null && claimAchievement(bos, 'yok-boyle').error !== null);

  const p: Progress = { ...emptyProgress(), cleared: { 1: true } };
  const bir = claimAchievement(p, 'a_first_road');
  check('ikinci kez alınamıyor',
    claimAchievement(bir.progress, 'a_first_road').error === 'already claimed');
}

console.log('\n[4] Kazanılan kozmetik gerçekten veriliyor');
{
  const cleared: Record<number, boolean> = {};
  for (const s of STAGES) cleared[s.id] = true;
  const p: Progress = { ...emptyProgress(), cleared };
  const out = claimAchievement(p, 'a_campaign');
  check('kampanya başarımı alınabiliyor', out.error === null);
  check('kazanılan kozmetik envantere girdi',
    out.progress.cosmetics.includes('t_hollow'), out.progress.cosmetics.join(','));
  // ⚠️ Bu kozmetik çekilişte YOK — yani tek edinme yolu buydu
  check('o kozmetik çekilişte yok',
    !rollableCosmetics().some((c) => c.id === 't_hollow'));
}

console.log('\n[5] Döngüsel hedef YOK');
{
  // ⚠️ "Tüm kozmetikleri topla" başarımının ödülü de bir kozmetik. Hedef
  // TÜM kozmetikleri sayarsa oyuncu asla tamamlayamaz — kendi ödülünü
  // beklerdi. Bu, fark edilmesi en zor tasarım hatalarından biri.
  const hepsi = ACHIEVEMENTS.find((a) => a.id === 'a_all_relics')!;
  check('hedef sadece ÇEKİLEBİLİR kozmetikleri sayıyor',
    hepsi.goal === rollableCosmetics().length,
    `${hepsi.goal} = ${rollableCosmetics().length}`);

  const p: Progress = {
    ...emptyProgress(), cosmetics: rollableCosmetics().map((c) => c.id),
  };
  const out = claimAchievement(p, 'a_all_relics');
  check('çekilebilirlerin hepsi toplanınca ALINABİLİYOR', out.error === null,
    out.error ?? 'tamam');
}

console.log('\n[6] İlerleme okuması');
{
  const p: Progress = { ...emptyProgress(), depthPaid: { 1: 12, 2: 25 }, ossuary: 3 };
  const st = achievementStates(p);
  const d20 = st.find((s) => s.def.id === 'a_depth_20')!;
  check('en derin iniş bölümler arasından seçiliyor', d20.done, `ilerleme ${d20.progress}/20`);
  const d40 = st.find((s) => s.def.id === 'a_depth_40')!;
  check('ulaşılmayan hedef tamam DEĞİL', !d40.done && d40.progress === 25, `${d40.progress}`);
  check('ilerleme hedefi aşmıyor (çubuk taşmasın)',
    st.every((s) => s.progress <= s.def.goal));
  check('alınabilir doğru işaretleniyor',
    st.filter((s) => s.claimable).every((s) => s.done && !s.claimed));
}

console.log('\n[7] ⭐ GÜNLÜK SERİ — saat sömürüsü');
{
  const p0: Progress = { ...emptyProgress() };
  const g1 = claimStreak(p0, '2026-08-04');
  check('ilk gün seri 1', g1.days === 1 && g1.error === null, `${g1.reward} toz`);

  // ⭐ ASIL SALDIRI: aynı gün tekrar toplamak
  const tekrar = claimStreak(g1.progress, '2026-08-04');
  check('AYNI GÜN ikinci kez toplanamıyor',
    tekrar.error === 'already claimed today' && tekrar.progress.dust === g1.progress.dust);

  const g2 = claimStreak(g1.progress, '2026-08-05');
  check('ertesi gün seri uzuyor', g2.days === 2, `${g2.days}`);
  check('ödül seriyle büyüyor', g2.reward > g1.reward, `${g1.reward} → ${g2.reward}`);

  // Gün atlanınca sıfırlanmalı — ama 0'a değil 1'e (bugün de bir gündür)
  const kesinti = claimStreak(g2.progress, '2026-08-09');
  check('gün atlanınca seri 1\'e döner', kesinti.days === 1, `${kesinti.days}`);

  // ⚠️ TAVAN ŞART: tavansız seri 200. günde absürt toz basar
  check('ödül tavanı var', streakReward(999) === STREAK.maxDust, `${streakReward(999)}`);
  check('tavan makul', STREAK.maxDust <= 200, `${STREAK.maxDust}`);

  // Ay/yıl sınırı — naif "gün−1" hesapları burada kırılır
  const aySonu = claimStreak({ ...emptyProgress(), streak: { days: 3, last: '2026-07-31' } }, '2026-08-01');
  check('ay sınırında seri kopmuyor', aySonu.days === 4, `${aySonu.days}`);
  const yilSonu = claimStreak({ ...emptyProgress(), streak: { days: 9, last: '2026-12-31' } }, '2027-01-01');
  check('yıl sınırında seri kopmuyor', yilSonu.days === 10, `${yilSonu.days}`);

  check('utcDay biçimi doğru', utcDay(new Date('2026-03-05T23:59:00Z')) === '2026-03-05',
    utcDay(new Date('2026-03-05T23:59:00Z')));
}

console.log(`\n${FAIL.length === 0 ? '✅ BAŞARIMLAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
