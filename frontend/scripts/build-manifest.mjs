// Asset manifestosu üretir: public/art altındaki TÜM png'leri tarar,
// boyutlarını ve strip frame sayısını çıkarır, public/art/manifest.json yazar.
//
// Editör bu dosyayı okuyup paleti kuruyor. Yeni asset ekleyince tekrar çalıştır:
//   node scripts/build-manifest.mjs

import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ART = join(ROOT, 'public', 'art');

/** PNG başlığından genişlik/yükseklik oku (kütüphane yok) */
async function pngSize(file) {
  const buf = await readFile(file);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function walk(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) await walk(p, out);
    else if (name.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out;
}

const files = await walk(ART);
const items = [];
for (const f of files) {
  const size = await pngSize(f);
  if (!size) continue;
  const rel = relative(ART, f).split(sep).join('/');
  const m = /_strip(\d+)\b/i.exec(rel);
  const frames = m ? parseInt(m[1], 10) : 1;
  items.push({
    src: `/art/${rel}`,
    cat: rel.split('/').slice(0, -1).join('/') || 'root',
    name: rel.split('/').pop().replace(/\.png$/i, ''),
    w: Math.floor(size.w / frames),
    h: size.h,
    frames,
  });
}

items.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
const cats = [...new Set(items.map((i) => i.cat))].sort();

await writeFile(join(ART, 'manifest.json'), JSON.stringify({ cats, items }, null, 0));
console.log(`manifest.json: ${items.length} asset, ${cats.length} kategori`);
