// BAŞARIM ÖDÜLLERİ — UÇTAN UCA. Sunucu ayaktayken çalışır.
//
//   npx tsx src/achievement.test.mts
//
// 🔴 NİYE BİRİM TESTİ YETMİYOR: `achievements.test.mts` SAF fonksiyonu
// ölçüyor (`claimAchievement`), yani "hesap doğru mu" sorusunu. Oyuncunun
// sorduğu soru başka: **düğmeye bastığımda ödül gerçekten hesabıma
// geçiyor mu?** Aradaki her şey — HTTP, oturum, iyimser kilit, veritabanı
// yazması — birim testinin göremediği yer. Ödül veren bir yolun burada
// ölçülmesi gerekiyor.

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { prisma } from './db.js';
import { ACHIEVEMENTS, achievementById } from '@game/achievements';

const API = process.env.API ?? 'http://localhost:4100';
const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

async function api(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* metin */ }
  return { status: res.status, json };
}

async function girisYap() {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const n = await api('/auth/nonce', { method: 'POST', body: { wallet } });
  const imza = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.json.message), kp.secretKey));
  const v = await api('/auth/verify', { method: 'POST', body: { wallet, signature: imza } });
  if (v.status !== 200) throw new Error(`giriş başarısız: ${v.status}`);
  return { wallet, token: v.json.token as string };
}

const u = await girisYap();

console.log('\n[1] TAMAMLANMAMIŞ BAŞARIM ÖDENMİYOR');
{
  const r = await api('/achievement/claim', { method: 'POST', token: u.token, body: { id: 'a_first_road' } });
  check('sıfır ilerlemede reddediliyor', r.status === 400, `${r.status} ${r.json?.detay ?? ''}`);
  const yok = await api('/achievement/claim', { method: 'POST', token: u.token, body: { id: 'uydurma_id' } });
  check('uydurma id reddediliyor', yok.status === 400, String(yok.status));
  const jetonsuz = await api('/achievement/claim', { method: 'POST', body: { id: 'a_first_road' } });
  check('jetonsuz reddediliyor', jetonsuz.status === 401, String(jetonsuz.status));
}

console.log('\n[2] ⭐ TAMAMLANINCA ÖDÜL GERÇEKTEN YATIYOR');
{
  // Koşulu sağla: 1 bölüm temizle → `a_first_road`
  await prisma.player.update({ where: { wallet: u.wallet }, data: { cleared: { 1: true }, gold: 1000 } });
  const once = (await api('/progress', { token: u.token })).json.progress;
  const def = achievementById('a_first_road')!;

  const r = await api('/achievement/claim', { method: 'POST', token: u.token, body: { id: 'a_first_road' } });
  check('tamamlanan başarım alınıyor', r.status === 200, String(r.status));
  const sonra = r.json?.progress;
  check('TOZ tam olarak tanımdaki kadar arttı',
    (sonra?.dust ?? 0) === (once?.dust ?? 0) + def.dust,
    `${once?.dust} → ${sonra?.dust} (beklenen +${def.dust})`);
  check('başarım "alındı" olarak işaretlendi', (sonra?.achievements ?? []).includes('a_first_road'));
  // ⚠️ GOLD DEĞİŞMEMELİ — Faz 2'de dengelenen musluk/sink oranı.
  check('GOLD değişmedi', sonra?.gold === once?.gold, `${once?.gold} → ${sonra?.gold}`);

  const tekrar = await api('/achievement/claim', { method: 'POST', token: u.token, body: { id: 'a_first_road' } });
  check('İKİNCİ KEZ alınamıyor', tekrar.status === 400, `${tekrar.status} ${tekrar.json?.detay ?? ''}`);
  const sonra2 = (await api('/progress', { token: u.token })).json.progress;
  check('ikinci denemede toz ARTMADI', sonra2?.dust === sonra?.dust, `${sonra?.dust} → ${sonra2?.dust}`);
}

console.log('\n[3] ⭐ KOZMETİK ÖDÜLÜ DE VERİLİYOR');
{
  /**
   * ⚠️ Kozmetikli başarımlar geç oyunda; koşulu doğrudan yazıyoruz.
   * `a_stone_20` anıtın 20. taşını istiyor ve ödülü `a_stone` halesi —
   * SATIN ALINAMAZ bir kozmetik. Ödül yolunun bu yarısı hiç ölçülmemişti:
   * toz yatıp kozmetik yatmasa kimse fark etmezdi (oyuncu onu zaten
   * görmediği bir listede arardı).
   */
  const def = achievementById('a_stone_20')!;
  await prisma.player.update({ where: { wallet: u.wallet }, data: { ossuary: 25 } });
  const once = (await api('/progress', { token: u.token })).json.progress;
  const r = await api('/achievement/claim', { method: 'POST', token: u.token, body: { id: 'a_stone_20' } });
  check('kozmetikli başarım alınıyor', r.status === 200, String(r.status));
  const sonra = r.json?.progress;
  check('toz yattı', (sonra?.dust ?? 0) === (once?.dust ?? 0) + def.dust,
    `+${(sonra?.dust ?? 0) - (once?.dust ?? 0)} / beklenen +${def.dust}`);
  check('KOZMETİK de yattı', (sonra?.cosmetics ?? []).includes(def.cosmetic!),
    `${def.cosmetic} · envanter: ${(sonra?.cosmetics ?? []).join(',') || 'boş'}`);
}

console.log('\n[4] YENİ EKLENEN BAŞARIMLAR DA ÇALIŞIYOR');
{
  /**
   * ⚠️ Bugün 18 başarım eklendi ve hepsi YENİ okuyuculara dayanıyor
   * (`kills`, `pets`, `streak`…). Eski başarımların çalışması yenilerinin
   * de çalıştığını GÖSTERMEZ: okuyucu farklı bir alana bakıyor ve o alan
   * `Progress`e doğru taşınmıyorsa koşul asla dolmaz.
   */
  await prisma.player.update({
    where: { wallet: u.wallet },
    data: { kills: { imp: 700, rogue: 400 } },      // toplam 1100 ≥ 1000
  });
  const def = achievementById('a_kills_1k')!;
  const once = (await api('/progress', { token: u.token })).json.progress;
  const r = await api('/achievement/claim', { method: 'POST', token: u.token, body: { id: 'a_kills_1k' } });
  check('kill sayacına dayanan başarım alınıyor', r.status === 200, `${r.status} ${r.json?.detay ?? ''}`);
  check('tozu yattı', (r.json?.progress?.dust ?? 0) === (once?.dust ?? 0) + def.dust,
    `+${(r.json?.progress?.dust ?? 0) - (once?.dust ?? 0)}`);

  // ⚠️ ÇİFT TARAFLI: eşiğin ALTINDA kalan aynı türden başarım ödenmemeli.
  const ust = await api('/achievement/claim', { method: 'POST', token: u.token, body: { id: 'a_kills_10k' } });
  check('bir üst kademe (10.000) HENÜZ ödenmiyor', ust.status === 400, String(ust.status));
}

console.log('\n[5] LİSTE BÜTÜNLÜĞÜ');
{
  // Sunucu ve istemci AYNI listeyi okuyor (`@game/achievements`) — ayrı
  // listeler olsaydı biri ödül verir diğeri vermezdi.
  check('başarım listesi dolu', ACHIEVEMENTS.length >= 29, `${ACHIEVEMENTS.length} başarım`);
  check('hepsinin tozu var', ACHIEVEMENTS.every((a) => a.dust > 0));
}

await prisma.run.deleteMany({ where: { wallet: u.wallet } });
await prisma.player.deleteMany({ where: { wallet: u.wallet } });

console.log(`\n${FAIL.length === 0 ? '✅ BAŞARIM ÖDÜLLERİ SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
