// LONCA TESTİ — yarışlar ve ekonomi kuralı.
//
// Buradaki asıl risk "yanlış üye sayısı" değil, EŞZAMANLI İSTEKLERİN
// kuralları delmesi: son boş yere iki kişi girer, gold iki kez düşer, hazine
// negatife iner. Bu oturumda tam bu sınıftan iki para basma açığı kapatıldı;
// lonca aynı hataları tekrar etmesin diye testler eşzamanlı çağırıyor.
//
// İkinci risk: loncanın GOLD VERMESİ. Perk XP olmalı — gold veren bir perk
// musluğu üye sayısıyla çarpardı.
//
// Çalıştır:  npx tsx src/guild.test.mts

import { GUILD_COST, GUILD_LEVELS, guildCap, guildGrowth, nextGuildLevel, validateName, validateTag } from '@game/guild';
import { prisma } from './db.js';
import { createGuild, donate, growthOf, joinGuild, leaveGuild, myGuild, upgradeGuild } from './guild.js';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

const P = `TEST_GUILD_${Date.now()}`;
const w = (n: number) => `${P}_${n}`;
// ⚠️ ETİKET HER KOŞUDA FARKLI. Sabit 'QD' yazılıydı ve aynı etiketle GERÇEK
// bir lonca kurulunca test kendi kodu bozulmadığı hâlde çöküyordu: `tag`
// tekil, veritabanı da testler arasında paylaşılıyor. Bir testin sonucu
// başkasının verisine bağlı olmamalı.
const TAG = `T${String(Date.now()).slice(-3)}`;
const get = (n: number) => prisma.player.findUniqueOrThrow({ where: { wallet: w(n) } });
const rev = async (n: number) => (await get(n)).rev;

const IDS = Array.from({ length: 10 }, (_, i) => i);
await prisma.player.createMany({
  data: IDS.map((n) => ({ wallet: w(n), gold: 2_000_000 })),
});

console.log('\n═══ LONCALAR ═══');

console.log('\n[1] Ad ve etiket doğrulaması');
{
  check('kısa ad reddediliyor', !validateName('ab').ok);
  check('normal ad geçiyor', validateName('The Quiet Dead').ok);
  check('etiket BÜYÜK harfe çevriliyor', validateTag('qd').ok
    && (validateTag('qd') as { value: string }).value === 'QD');
  // ⚠️ Etiket sohbette [ ] içinde basılıyor; içine parantez/kontrol karakteri
  // girmesi kimlik taklidine açar.
  check('etikette sembol reddediliyor', !validateTag('A[B').ok);
  check('görünmez karakter temizleniyor',
    (validateName('The​Dead') as { value: string }).value === 'TheDead');
}

console.log('\n[2] Kurma');
{
  const g = await createGuild(w(0), await rev(0), 'The Quiet Dead', TAG.toLowerCase());
  check('lonca kuruldu', g.tag === TAG && g.level === 1, `[${g.tag}] lv${g.level}`);
  check('kurucu üye oldu', g.members.some((m) => m.wallet === w(0)));
  check('gold düşüldü', (await get(0)).gold === 2_000_000 - GUILD_COST,
    `${(await get(0)).gold}`);

  // ⚠️ Etiket TEKİL olmalı — iki aynı etiket sohbette ayırt edilemez
  let ikiciGecti = true;
  try { await createGuild(w(1), await rev(1), 'Copycat', TAG); }
  catch { ikiciGecti = false; }
  check('aynı etiketten ikinci lonca AÇILAMIYOR', !ikiciGecti);
  check('reddedilen kurucunun gold\'u gitmedi', (await get(1)).gold === 2_000_000);

  let ikinciLonca = true;
  try { await createGuild(w(0), await rev(0), 'Second', `S${TAG.slice(1)}`); }
  catch { ikinciLonca = false; }
  check('bir oyuncu İKİNCİ lonca kuramıyor', !ikinciLonca);
}

console.log('\n[3] ⭐ Eşzamanlı katılım — üye tavanı deliniyor mu');
{
  const mine = await myGuild(w(0));
  const id = mine!.id;
  const cap = guildCap(1);
  console.log(`     1. seviye tavanı ${cap} (kurucu dahil)`);

  // Tavandan FAZLA kişi AYNI ANDA katılmayı denesin
  const adaylar = IDS.slice(1, 9);
  const sonuc = await Promise.all(adaylar.map((n) =>
    joinGuild(w(n), id).then(() => true).catch(() => false)));
  const giren = sonuc.filter(Boolean).length;

  const uye = await prisma.player.count({ where: { guildId: id } });
  console.log(`     ${adaylar.length} eşzamanlı istek → ${giren} kabul, toplam üye ${uye}`);
  check('üye tavanı AŞILMADI', uye <= cap, `${uye} ≤ ${cap}`);
  check('tavana kadar dolduruldu (istek boşa gitmedi)', uye === cap, `${uye}`);
}

console.log('\n[4] Bağış ve seviye');
{
  const mine = await myGuild(w(0));
  const id = mine!.id;
  const next = nextGuildLevel(1)!;

  const goldOnce = (await get(0)).gold;
  await donate(w(0), await rev(0), next.cost);
  check('bağış hazineye girdi', (await myGuild(w(0)))!.treasury === next.cost);
  check('bağışçının gold\'u düştü', (await get(0)).gold === goldOnce - next.cost);

  // ⚠️ Yalnızca kurucu yükseltebilir
  const uyeCuzdan = (await prisma.player.findFirstOrThrow({
    where: { guildId: id, wallet: { not: w(0) } }, select: { wallet: true },
  })).wallet;
  let uyeYukseltti = true;
  try { await upgradeGuild(uyeCuzdan); } catch { uyeYukseltti = false; }
  check('üye seviye YÜKSELTEMİYOR (sadece kurucu)', !uyeYukseltti);

  const g2 = await upgradeGuild(w(0));
  check('kurucu yükseltti', g2.level === 2, `lv${g2.level}`);
  check('hazine harcandı', g2.treasury === 0, `${g2.treasury}`);
  check('üye tavanı büyüdü', g2.cap === guildCap(2), `${g2.cap}`);
  check('XP bonusu büyüdü', g2.growth === guildGrowth(2), `+%${(g2.growth * 100).toFixed(0)}`);

  // ⭐ Hazine yetmezken yükseltme
  let bosYukseltme = true;
  try { await upgradeGuild(w(0)); } catch { bosYukseltme = false; }
  check('boş hazineyle yükseltme REDDEDİLİYOR', !bosYukseltme);
}

console.log('\n[5] ⭐ Eşzamanlı yükseltme — hazine negatife iniyor mu');
{
  const next3 = nextGuildLevel(2)!;
  await donate(w(0), await rev(0), next3.cost);
  // Aynı anda beş yükseltme isteği
  const r = await Promise.all([1, 2, 3, 4, 5].map(() =>
    upgradeGuild(w(0)).then(() => true).catch(() => false)));
  const gecen = r.filter(Boolean).length;
  const g = await myGuild(w(0));
  console.log(`     5 eşzamanlı yükseltme → ${gecen} geçti, seviye ${g!.level}, hazine ${g!.treasury}`);
  check('yalnızca BİR yükseltme geçti', gecen === 1, `${gecen}`);
  check('hazine negatife inmedi', g!.treasury >= 0, `${g!.treasury}`);
  check('seviye tam bir arttı', g!.level === 3, `lv${g!.level}`);
}

console.log('\n[6] ⭐ Perkin koşuya taşınması');
{
  // ⚠️ `/run/start` BU FONKSİYONU çağırır. İstemci "loncam 5. seviye"
  // diyebilseydi perk beyan edilen bir şey olurdu; kaynağı veritabanı olmalı.
  const kurucu = await growthOf(w(0));
  check('loncalı oyuncu perk alıyor', kurucu === guildGrowth(3), `+%${(kurucu * 100).toFixed(0)}`);

  // 9 numara hiç katılmadı — adaylar 1..8'di
  check('loncasız oyuncunun perki SIFIR', (await growthOf(w(9))) === 0);
  // Var olmayan cüzdan da patlamamalı — `/run/start` her istekte çağırıyor
  check('bilinmeyen cüzdan 0 dönüyor', (await growthOf(`${P}_yok`)) === 0);
}

console.log('\n[7] Ayrılma');
{
  const uye = (await prisma.player.findFirstOrThrow({
    where: { guildId: { not: null }, wallet: { startsWith: P, not: w(0) } },
    select: { wallet: true },
  })).wallet;
  const r = await leaveGuild(uye);
  check('üye ayrıldı, lonca dağılmadı', !r.dagildi);
  check('ayrılanın loncası boşaldı',
    (await prisma.player.findUniqueOrThrow({ where: { wallet: uye } })).guildId === null);

  // ⚠️ KURUCU AYRILIRSA LONCA DAĞILIR — devir bilerek yok
  const r2 = await leaveGuild(w(0));
  check('kurucu ayrılınca lonca DAĞILIYOR', r2.dagildi);
  const kalan = await prisma.player.count({ where: { guildId: { not: null }, wallet: { startsWith: P } } });
  check('tüm üyelerin loncası boşaldı', kalan === 0, `${kalan} üye kaldı`);
}

console.log('\n[8] Ekonomi kuralı');
{
  // ⚠️ EN ÖNEMLİ KONTROL: lonca perki GOLD veremez.
  const alanlar = Object.keys(GUILD_LEVELS[0]);
  check('seviye tablosunda GOLD alanı YOK', !alanlar.includes('gold'), alanlar.join(', '));
  check('perk XP (growth) veriyor', GUILD_LEVELS.every((l) => typeof l.growth === 'number'));
  // Perk küçük kalmalı — loncasız oyuncu dışlanmasın
  check('en yüksek perk %15\'i geçmiyor',
    GUILD_LEVELS[GUILD_LEVELS.length - 1].growth <= 0.15,
    `+%${(GUILD_LEVELS[GUILD_LEVELS.length - 1].growth * 100).toFixed(0)}`);
}

await prisma.guild.deleteMany({ where: { owner: { startsWith: P } } });
await prisma.ledger.deleteMany({ where: { wallet: { startsWith: P } } });
await prisma.player.deleteMany({ where: { wallet: { startsWith: P } } });

console.log(`\n${FAIL.length === 0 ? '✅ LONCALAR SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
