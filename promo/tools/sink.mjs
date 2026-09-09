// KARE ALICISI — tarayıcıdan gelen PNG/JPEG karelerini diske yazar.
//
// 🔴 NİYE VAR: tanıtım videosundaki dövüş sahneleri EKRAN GÖRÜNTÜSÜ DEĞİL,
// oyunun kendisi. `/capture` sayfası gerçek `Game` motorunu sabit adımla
// sürüp her kareyi buraya POST ediyor; burası da `promo/public/frames/`
// altına numaralı dosyalar olarak yazıyor. Remotion sonra o diziyi okuyor.
//
// ⚠️ TARAYICI DİSKE YAZAMAZ. `canvas.toBlob` + indirme yolu headless'ta
// güvenilmez ve dosya adını biz veremeyiz; bu yüzden HTTP üzerinden.
//
// ⚠️ CORS AÇIK ama SADECE localhost'ta çalışıyor ve yayına çıkmıyor.

import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 7788;

/** ⚠️ Sahne adı dosya yoluna giriyor — yol kaçışına izin verilmez. */
function temizAd(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

const sayac = new Map();

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (url.pathname === '/frame' && req.method === 'POST') {
    const scene = temizAd(url.searchParams.get('scene'));
    const i = Number(url.searchParams.get('i') || 0);
    const istenen = url.searchParams.get('ext');
    const ext = ['png','webp','jpg'].includes(istenen) ? istenen : 'jpg';
    if (!scene) { res.writeHead(400); res.end('scene?'); return; }

    const parcalar = [];
    req.on('data', (c) => parcalar.push(c));
    req.on('end', () => {
      const dir = join(KOK, 'public', 'frames', scene);
      mkdirSync(dir, { recursive: true });
      const ad = String(i).padStart(4, '0') + '.' + ext;
      writeFileSync(join(dir, ad), Buffer.concat(parcalar));
      sayac.set(scene, (sayac.get(scene) || 0) + 1);
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // SES — video ile aynı boru hattı, farklı klasör.
  if (url.pathname === /*sabit*/ '/audio' && req.method === 'POST') {
    const scene = temizAd(url.searchParams.get('scene'));
    const parcalar = [];
    req.on('data', (c) => parcalar.push(c));
    req.on('end', () => {
      const dir = join(KOK, 'public', 'audio');
      mkdirSync(dir, { recursive: true });
      const yol = join(dir, (scene || 'music') + '.webm');
      writeFileSync(yol, Buffer.concat(parcalar));
      console.log('[sink] ses yazıldı →', yol);
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  if (url.pathname === '/done') {
    const scene = temizAd(url.searchParams.get('scene'));
    console.log(`[sink] ${scene} tamam — ${sayac.get(scene) || 0} kare`);
    res.writeHead(200); res.end('ok');
    return;
  }

  res.writeHead(404); res.end('no');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[sink] 127.0.0.1:${PORT} dinliyor → ${join(KOK, 'public', 'frames')}`);
});
