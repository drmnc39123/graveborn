// DEPLOY SONRASI DUMAN TESTİ — canlıyı gerçekten yokla.
//
//   npx tsx src/smoke.test.mts                      (üretim)
//   API=http://localhost:4100 FRONT=http://localhost:3200 npx tsx src/smoke.test.mts
//
// 🔴 NİYE VAR: bu depoda dağıtımın sessizce yarım kalmasının ÜÇ ölçülmüş
// yolu var ve üçü de "site açılıyor" testini geçer:
//   1. CORS yanlışsa köy açılır, karakter yürür — ama etkinlik, sıralama
//      ve boss SESSİZCE boş kalır (DEPLOY.md'de yazılı, ölçüldü).
//   2. `NEXT_PUBLIC_*` derleme anında gömülüyor; Railway "Redeploy"
//      MEVCUT imajı kullanıyor, yani yeni değişken YENİ COMMIT olmadan
//      girmiyor. Site açılır, giriş çalışmaz.
//   3. Değişken değişikliği YENİ BİR BUILD başlatıyor ve o bitene kadar
//      ESKİ değer servis ediliyor — bu oturumda tam bu yüzden "sır hâlâ
//      yanlış" diye yanlış teşhis kondu.
// Üçü de tek tek yoklanmadan "dağıtım tamam" denemez.
//
// ⚠️ KONTROL GRUBU ŞART. "401 döndü" tek başına ucun VAR olduğunu
// göstermez — olmayan bir yol da 404 yerine 401 dönebilirdi. O yüzden
// uydurma bir yol da yoklanıyor ve 404 beklendiği doğrulanıyor.

const API = process.env.API ?? 'https://graveborn-production.up.railway.app';
const FRONT = process.env.FRONT ?? 'https://playgraveborn.com';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

async function iste(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    const metin = await res.text();
    let json: any = null;
    try { json = metin ? JSON.parse(metin) : null; } catch { /* HTML olabilir */ }
    return { ok: true as const, status: res.status, json, metin, headers: res.headers };
  } catch (e) {
    return { ok: false as const, status: 0, json: null, metin: String(e), headers: new Headers() };
  }
}

console.log(`\n═══ DUMAN TESTİ ═══\n  API   ${API}\n  FRONT ${FRONT}\n`);

console.log('[1] SUNUCU AYAKTA');
{
  const h = await iste(`${API}/health`);
  check('/health 200 ve {ok:true}', h.status === 200 && h.json?.ok === true, `${h.status} ${h.metin.slice(0, 60)}`);
  const f = await iste(`${API}/flags`);
  check('/flags okunuyor', f.status === 200, String(f.status));
  if (f.json?.maintenance) console.log('  ⚠ BAKIM MODU AÇIK — oyuncular yeni koşu açamıyor');
  const s = await iste(`${API}/stats`);
  check('/stats sayı döndürüyor', s.status === 200 && typeof s.json?.players === 'number',
    `${s.status} ${JSON.stringify(s.json)}`);
}

console.log('\n[2] ⭐ CORS — "site açılıyor" testinin GÖREMEDİĞİ hata');
{
  /**
   * ⚠️ DEPLOY.md'de ölçülmüş: CORS yanlışken oyun ÇALIŞIYOR gibi görünür.
   * Köy açılır, paneller açılır, ama etkinlik/sıralama/boss sessizce boş
   * kalır — çünkü o uçlar hatayı bilerek yutuyor. Tek iz tarayıcı
   * konsolunda. Burada başlığın kendisi yoklanıyor.
   */
  const r = await iste(`${API}/stats`, { headers: { origin: FRONT } });
  const izin = r.headers.get('access-control-allow-origin');
  check('frontend origin\'ine CORS izni var', !!izin, `başlık: ${izin ?? 'YOK'}`);
  // ⚠️ ÇİFT TARAFLI: yabancı bir origin'e izin VERİLMEMELİ, yoksa
  // kontrol "her şeye evet diyen" bir sunucuyu da geçerdi.
  const y = await iste(`${API}/stats`, { headers: { origin: 'https://yabanci-site.example' } });
  const yizin = y.headers.get('access-control-allow-origin');
  check('yabancı origin\'e izin YOK', !yizin || yizin === FRONT, `başlık: ${yizin ?? 'yok'}`);
}

console.log('\n[3] KAPILAR KAPALI MI');
{
  const p = await iste(`${API}/progress`);
  check('/progress jetonsuz 401', p.status === 401, String(p.status));
  const a = await iste(`${API}/admin/overview`);
  check('/admin/overview sırsız 401 ya da 403', a.status === 401 || a.status === 403, String(a.status));
  // ⚠️ KONTROL GRUBU: olmayan yol 404 dönmeli. Dönmüyorsa yukarıdaki
  // "401" sonuçları ucun VARLIĞINI kanıtlamaz.
  const yok = await iste(`${API}/kesinlikle-olmayan-bir-yol`);
  check('olmayan yol 404 (kontrol grubu)', yok.status === 404, String(yok.status));
}

console.log('\n[4] BUGÜN EKLENEN UÇLAR CANLIDA MI');
{
  const g = await iste(`${API}/daily`);
  check('/daily bugünün bölümünü veriyor', g.status === 200 && !!g.json?.stageId,
    `${g.status} ${g.json?.day ?? ''} · ${g.json?.stageName ?? ''}`);
  const bugun = new Date().toISOString().slice(0, 10);
  check('/daily günü DOĞRU (sunucu saati kaymamış)', g.json?.day === bugun, `${g.json?.day} vs ${bugun}`);
  // ⚠️ Tohum SIZMAMALI — sızarsa oyuncu haritayı offline çözebilir.
  check('/daily tohum sızdırmıyor', !('seed' in (g.json ?? {})));
  const m = await iste(`${API}/heroes/mastery`);
  check('/heroes/mastery var ve korunuyor (401)', m.status === 401, String(m.status));
}

console.log('\n[5] HATA BİLDİRİM YOLU ÇALIŞIYOR MU');
{
  /**
   * ⚠️ Bu uç kırıksa, canlıdaki hataları öğrenme yolumuz da kırık olur —
   * ve bunu fark etmenin başka yolu yok. Kayıt açıkça işaretli.
   */
  const r = await iste(`${API}/client-error`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: '[duman-testi] bildirim yolu yoklandı', path: '/smoke' }),
  });
  check('/client-error kabul ediyor (204)', r.status === 204, String(r.status));
}

console.log('\n[6] SİTE VE VARLIKLAR');
{
  const s = await iste(`${FRONT}/`);
  check('ana sayfa 200', s.status === 200, String(s.status));
  check('ana sayfa GRAVEBORN içeriyor', s.metin.includes('GRAVEBORN'), `${s.metin.length} bayt`);
  const p = await iste(`${FRONT}/play`);
  check('/play 200', p.status === 200, String(p.status));

  /**
   * ⚠️ 9-SLICE ÇERÇEVELER: `border-image` 404 alırsa tarayıcı şeffaf
   * kenar rengine düşer ve arayüzün TÜM pembe çerçeveleri sessizce yok
   * olur. Bu oturumda tam olarak yaşandı (sunucu kapalıyken).
   */
  const cerceve = await iste(`${FRONT}/art/ui/kit/Background-boxes/BGbox_07A.png`);
  check('9-slice çerçeve varlığı 200', cerceve.status === 200, String(cerceve.status));

  /**
   * ⚠️ `NEXT_PUBLIC_TURNSTILE_SITE_KEY` DERLEME ANINDA gömülüyor. Yeni
   * bir değişken YENİ COMMIT olmadan imaja girmiyor (Railway "Redeploy"
   * mevcut imajı kullanıyor). Anahtar pakette yoksa cüzdan girişi çalışmaz.
   */
  const parcalar = [...s.metin.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
  let anahtar = false;
  for (const c of parcalar.slice(0, 12)) {
    const js = await iste(`${FRONT}${c}`);
    if (/0x4[0-9A-Za-z_-]{15,}/.test(js.metin)) { anahtar = true; break; }
  }
  check('Turnstile site anahtarı pakette', anahtar, `${parcalar.length} parça tarandı`);

  /**
   * ⚠️ API adresi de pakete gömülü. `localhost` gömülü kaldıysa canlı site
   * oyuncunun KENDİ bilgisayarına istek atar ve her panel sessizce boş
   * kalır (DEPLOY.md'de yazılı).
   */
  let localhostVar = false;
  for (const c of parcalar.slice(0, 12)) {
    const js = await iste(`${FRONT}${c}`);
    if (js.metin.includes('localhost:4100')) { localhostVar = true; break; }
  }
  check('pakette localhost API adresi YOK', !localhostVar);
}

console.log(`\n${FAIL.length === 0 ? '✅ DAĞITIM SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
