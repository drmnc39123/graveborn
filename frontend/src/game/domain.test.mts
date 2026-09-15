// ALAN ADI MÜHRÜ — `www` tek kurallı kökene gidiyor, döngü yok.
//
// 🔴 NİYE VAR (ölçüldü, 2026-09-15): `https://www.playgraveborn.com` hiç
// açılmıyordu (curl 000). Çözüm `www`'yi Railway'e bağlayıp uygulamanın onu
// çıplak alan adına YÖNLENDİRMESİ — ayrıca sunmak değil, çünkü
// `localStorage` kökene özel ve demo kaydı ile cüzdan oturumu ikiye
// bölünürdü (bkz. `next.config.mjs` başlığı).
//
// ⚠️ EN PAHALI HATA DÖNGÜ. Çıplak alan adını da yakalayan bir kural
// (`has` koşulu unutulursa ya da yanlış yazılırsa) siteyi SONSUZ
// YÖNLENDİRMEYE sokar: tarayıcı "çok fazla yönlendirme" der ve site
// herkes için kapanır. Bu, "www çalışmıyor" sorununu "hiçbir şey
// çalışmıyor"a çevirir. [2] bunun için var.
//
// ⚠️ KURAL DAVRANIŞI ÖLÇÜLÜYOR, METNİ DEĞİL: yapılandırma gerçekten içe
// aktarılıp `redirects()` çağrılıyor ve Next'in eşleştirme mantığı taklit
// ediliyor. Canlıda aynı kural `curl -H "Host: …"` ile de doğrulandı.
//
//   cd frontend && npx tsx src/game/domain.test.mts

import { readFileSync } from 'node:fs';

const FAIL: string[] = [];
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${n}${d ? ` — ${d}` : ''}`);
  if (!ok) FAIL.push(n);
};

type Kural = {
  source: string; destination: string; permanent?: boolean;
  has?: { type: string; value?: string }[];
};

const cfg = (await import('../../next.config.mjs')).default as {
  redirects?: () => Promise<Kural[]>;
};
const kurallar = cfg.redirects ? await cfg.redirects() : [];

/**
 * Bir istek hangi kurala takılır — Next'in `has: host` eşleştirmesinin
 * sadeleştirilmiş hâli. ⚠️ `has` YOKSA kural HER HOST'a uyar; döngünün
 * doğduğu yer tam olarak bu.
 */
function eslesen(host: string): Kural | undefined {
  return kurallar.find((k) => {
    if (k.source !== '/:path*') return false;
    const h = k.has?.find((x) => x.type === 'host');
    return !h || h.value === host;
  });
}

/** Hedefin host kısmı — `https://x.com/:path*` → `x.com` */
const hedefHost = (k: Kural) => new URL(k.destination.replace('/:path*', '/')).host;

console.log('\n── [1] www çıplak alan adına gidiyor ──');
{
  const k = eslesen('www.playgraveborn.com');
  check('www için bir kural var', !!k);
  if (k) {
    check('hedef çıplak alan adı', hedefHost(k) === 'playgraveborn.com', k.destination);
    check('https ile', k.destination.startsWith('https://'));
    check('yol korunuyor (/:path*)', k.destination.endsWith('/:path*'));
    check('kalıcı (308)', k.permanent === true);
  }
}

console.log('\n── [2] DÖNGÜ YOK — çıplak alan adı hiçbir kurala takılmıyor ──');
{
  const k = eslesen('playgraveborn.com');
  check('playgraveborn.com yönlendirilMİYOR', !k, k ? `DÖNGÜ: → ${k.destination}` : '');
  // ⚠️ Genel kural: hiçbir kural KENDİ hedefine yönlendirmemeli.
  for (const r of kurallar) {
    const h = r.has?.find((x) => x.type === 'host')?.value;
    check(`kural kendi hedefini yakalamıyor (${h ?? 'HER HOST'})`,
      !!h && h !== hedefHost(r), `hedef ${hedefHost(r)}`);
  }
}

console.log('\n── [3] kurallı köken tek yerden — metadataBase ile aynı ──');
{
  // ⚠️ İki ayrı "kurallı adres" bir gün ayrışırdı: paylaşım kartları bir
  // adresi, yönlendirme başka adresi gösterirdi.
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const m = layout.match(/metadataBase:\s*new URL\('([^']+)'\)/);
  const k = eslesen('www.playgraveborn.com');
  check('metadataBase bulundu', !!m, m?.[1]);
  if (m && k) {
    check('yönlendirme hedefi = metadataBase', new URL(m[1]).host === hedefHost(k),
      `${new URL(m[1]).host} / ${hedefHost(k)}`);
  }
}

console.log(`\n${FAIL.length === 0 ? '✅ ALAN ADI SAĞLAM' : `❌ ${FAIL.length} BAŞARISIZ: ${FAIL.join(', ')}`}\n`);
process.exit(FAIL.length === 0 ? 0 : 1);
