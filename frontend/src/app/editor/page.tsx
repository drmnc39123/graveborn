'use client';
// HARİTA EDİTÖRÜ — asseti soldan seç, haritaya tıkla, yerleştir.
//
// Neden: dünyayı kodda konumlandırmak işe yaramadı; tasarım kararı gözle
// verilir. Artık harita VERİ; bu sayfa o veriyi üretir, oyun okur.
//
// Kısayollar: 1 nesne · 2 zemin fırçası · 3 işaretçi · Del sil · Space+sürükle kaydır

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C, glass } from '@/lib/theme';
import {
  MAP_TILE, emptyMap, loadMapLocal, paletteIndex, saveMapLocal,
  type MapDoc, type MapMarker, type MapObject, type MarkerKind,
} from '@/game/mapData';

interface Asset { src: string; cat: string; name: string; w: number; h: number; frames: number }
type Tool = 'object' | 'tile' | 'marker';

export default function EditorPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Asset | null>(null);
  const [tool, setTool] = useState<Tool>('object');
  const [markerKind, setMarkerKind] = useState<MarkerKind>('door');
  const [doc, setDoc] = useState<MapDoc>(() => emptyMap());
  const [selId, setSelId] = useState<number | null>(null);
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [saved, setSaved] = useState(0);
  // Geri alma yığını — her değişiklikten ÖNCE anlık görüntü alınır.
  const undoRef = useRef<MapDoc[]>([]);
  const pushUndo = useCallback(() => {
    undoRef.current.push(JSON.parse(JSON.stringify(docRef.current)));
    if (undoRef.current.length > 60) undoRef.current.shift();
  }, []);
  const docRef = useRef<MapDoc>(emptyMap());
  const camRef = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCache = useRef(new Map<string, HTMLImageElement>());
  const nextId = useRef(1);

  // manifest + kayıtlı harita
  useEffect(() => {
    fetch('/art/manifest.json').then((r) => r.json()).then((m) => {
      setAssets(m.items); setCats(m.cats); setCat(m.cats[0] ?? '');
    }).catch(() => {});
    const saved = loadMapLocal();
    if (saved) {
      setDoc(saved);
      nextId.current = Math.max(1, ...saved.objects.map((o) => o.id), ...saved.markers.map((m) => m.id)) + 1;
    }
  }, []);

  useEffect(() => { docRef.current = doc; }, [doc]);

  const img = useCallback((src: string) => {
    let i = imgCache.current.get(src);
    if (!i) { i = new Image(); i.src = src; imgCache.current.set(src, i); }
    return i.complete && i.naturalWidth ? i : null;
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assets.filter((a) => (needle ? a.name.toLowerCase().includes(needle) || a.cat.toLowerCase().includes(needle) : a.cat === cat));
  }, [assets, cat, q]);

  // ── çizim ──
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#12100e';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-camRef.current.x, -camRef.current.y);

      const T = MAP_TILE;
      const { terrain } = doc;

      // zemin
      for (let ty = 0; ty < terrain.h; ty++) {
        for (let tx = 0; tx < terrain.w; tx++) {
          const v = terrain.data[ty * terrain.w + tx];
          if (!v) continue;
          const im = img(terrain.palette[v - 1]);
          if (im) ctx.drawImage(im, tx * T, ty * T, T, T);
        }
      }

      // ızgara
      ctx.strokeStyle = 'rgba(227,216,192,0.07)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      for (let x = 0; x <= terrain.w; x++) { ctx.moveTo(x * T, 0); ctx.lineTo(x * T, terrain.h * T); }
      for (let y = 0; y <= terrain.h; y++) { ctx.moveTo(0, y * T); ctx.lineTo(terrain.w * T, y * T); }
      ctx.stroke();

      // nesneler — ayak Y'sine göre sıralı (oyundaki derinlikle aynı)
      const objs = [...doc.objects].sort((a, b) => a.y + a.h - (b.y + b.h));
      for (const o of objs) {
        const im = img(o.src);
        if (im) {
          // TEK KARE kes: sütun sayısı (frames) ve satır sayısı (rows) ile.
          // Izgara sayfaları (18 satır × 8 kare) bu olmadan tek parça çiziliyordu.
          const cols = o.frames ?? 1, rws = o.rows ?? 1;
          const fw = Math.floor(im.width / cols);
          const fh = Math.floor(im.height / rws);
          ctx.drawImage(im, 0, (o.row ?? 0) * fh, fw, fh, o.x, o.y, o.w, o.h);
        } else {
          ctx.fillStyle = 'rgba(239,167,46,0.25)';
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
        if (o.id === selId) {
          ctx.strokeStyle = C.candle; ctx.lineWidth = 2 / zoom;
          ctx.strokeRect(o.x, o.y, o.w, o.h);
          if (o.solid) {
            ctx.strokeStyle = 'rgba(200,50,74,0.9)';
            ctx.strokeRect(o.x + o.w * 0.28, o.y + o.h - o.solid, o.w * 0.44, o.solid);
          }
        }
      }

      // işaretçiler
      for (const m of doc.markers) {
        const col = m.kind === 'fight' ? '#a01226' : m.kind === 'travel' ? '#5f9e4a' : '#8a97a3';
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2 / zoom; ctx.stroke();
        ctx.fillStyle = C.bone;
        ctx.font = `${11 / zoom}px ui-sans-serif, system-ui`;
        ctx.fillText(m.label || m.kind, m.x + 12, m.y + 4);
        if (m.id === selId) { ctx.strokeStyle = C.candle; ctx.strokeRect(m.x - 12, m.y - 12, 24, 24); }
      }

      // spawn
      ctx.strokeStyle = '#efa72e'; ctx.lineWidth = 2 / zoom;
      ctx.beginPath(); ctx.arc(doc.spawn.x, doc.spawn.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#efa72e';
      ctx.font = `${11 / zoom}px ui-sans-serif`; ctx.fillText('SPAWN', doc.spawn.x + 16, doc.spawn.y + 4);

      // OYUNDA GÖRÜNEN ALAN — oyuncu spawn'dayken ekrana ne sığıyor.
      // "Harita boyu bize göre mi, oyunda bu alan mı görünecek?" sorusunun cevabı.
      const camW = 1280, camH = 720;
      ctx.strokeStyle = 'rgba(122,190,255,0.75)';
      ctx.setLineDash([8 / zoom, 6 / zoom]);
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(doc.spawn.x - camW / 2, doc.spawn.y - camH / 2, camW, camH);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(122,190,255,0.85)';
      ctx.fillText('oyuncunun gördüğü alan (1280×720)', doc.spawn.x - camW / 2 + 6, doc.spawn.y - camH / 2 - 6);

      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [doc, selId, zoom, img]);

  // ── girdi ──
  const toWorld = (e: React.MouseEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / zoom + camRef.current.x,
      y: (e.clientY - r.top) / zoom + camRef.current.y,
    };
  };
  const snapped = (v: number) => (snap ? Math.round(v / MAP_TILE) * MAP_TILE : Math.round(v));

  const onClick = (e: React.MouseEvent) => {
    const p = toWorld(e);
    if (e.shiftKey) { setDoc((d) => ({ ...d, spawn: { x: Math.round(p.x), y: Math.round(p.y) } })); return; }

    if (tool === 'tile') {
      if (!sel) return;
      setDoc((d) => {
        const t = { ...d.terrain, palette: [...d.terrain.palette], data: [...d.terrain.data] };
        const pi = paletteIndex(t, sel.src);
        const tx = Math.floor(p.x / MAP_TILE), ty = Math.floor(p.y / MAP_TILE);
        if (tx >= 0 && ty >= 0 && tx < t.w && ty < t.h) t.data[ty * t.w + tx] = pi;
        return { ...d, terrain: t };
      });
      return;
    }

    if (tool === 'marker') {
      const m: MapMarker = { id: nextId.current++, kind: markerKind, x: Math.round(p.x), y: Math.round(p.y), label: markerKind };
      setDoc((d) => ({ ...d, markers: [...d.markers, m] }));
      setSelId(m.id);
      return;
    }

    // SEÇME ÖNCELİKLİ: var olan nesnenin üstüne tıklayınca onu SEÇER,
    // üstüne yenisini koymaz. Yeni koymak için boş yere tıkla (veya Alt+tık).
    const hit = [...doc.objects].reverse().find((o) => p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h);
    if (hit && !e.altKey) { setSelId(hit.id); return; }
    if (!sel) return;
    pushUndo();
    // Boyut kırpma: pakette 1080×1080 diyalog portreleri var; gerçek boyutta
    // konunca ekranı kaplıyor ve "bu ne?" oluyor. Harita nesnesi olarak makul
    // bir tavana indiriyoruz — sağdaki alanlardan istenirse büyütülür.
    const scale = Math.min(1, 256 / Math.max(sel.w, sel.h));
    const pw = Math.round(sel.w * scale), ph = Math.round(sel.h * scale);
    const o: MapObject = {
      id: nextId.current++, src: sel.src,
      x: snapped(p.x - pw / 2), y: snapped(p.y - ph / 2),
      w: pw, h: ph,
      frames: sel.frames > 1 ? sel.frames : undefined,
      rows: 1, row: 0,
      fps: sel.frames > 1 ? 8 : undefined,
      solid: 0,
    };
    setDoc((d) => ({ ...d, objects: [...d.objects, o] }));
    setSelId(o.id);
  };

  // klavye
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === '1') setTool('object');
      if (k === '2') setTool('tile');
      if (k === '3') setTool('marker');
      if (k === 'escape') { setSel(null); setSelId(null); }
      if (k === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const prev = undoRef.current.pop();
        if (prev) { setDoc(prev); setSelId(null); }
        return;
      }
      if (k === 'delete' || k === 'backspace') {
        if (selId == null) return;
        pushUndo();
        setDoc((d) => ({ ...d, objects: d.objects.filter((o) => o.id !== selId), markers: d.markers.filter((m) => m.id !== selId) }));
        setSelId(null);
      }
      const step = e.shiftKey ? MAP_TILE : 1;
      if (selId != null && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        setDoc((d) => ({
          ...d,
          objects: d.objects.map((o) => (o.id === selId ? { ...o, x: o.x + dx, y: o.y + dy } : o)),
          markers: d.markers.map((m) => (m.id === selId ? { ...m, x: m.x + dx, y: m.y + dy } : m)),
        }));
      }
      const pan = 120;
      if (k === 'w') camRef.current.y -= pan;
      if (k === 's') camRef.current.y += pan;
      if (k === 'a') camRef.current.x -= pan;
      if (k === 'd') camRef.current.x += pan;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selId, pushUndo]);

  const selObj = doc.objects.find((o) => o.id === selId) ?? null;
  const selMarker = doc.markers.find((m) => m.id === selId) ?? null;

  const patch = (p: Partial<MapObject>) =>
    setDoc((d) => ({ ...d, objects: d.objects.map((o) => (o.id === selId ? { ...o, ...p } : o)) }));
  const patchM = (p: Partial<MapMarker>) =>
    setDoc((d) => ({ ...d, markers: d.markers.map((m) => (m.id === selId ? { ...m, ...p } : m)) }));

  const download = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name || 'map'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', color: C.bone, fontSize: 13 }}>
      {/* SOL: asset paleti */}
      <div style={{ width: 250, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: '#14120f' }}>
        <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…"
            style={{ width: '100%', padding: '7px 9px', borderRadius: 7, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone, outline: 'none', fontSize: 12 }} />
          <select value={cat} onChange={(e) => { setCat(e.target.value); setQ(''); }}
            style={{ width: '100%', marginTop: 7, padding: '6px 8px', borderRadius: 7, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone, fontSize: 12 }}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 6 }}>{shown.length} asset</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, padding: 8 }}>
          {shown.slice(0, 400).map((a) => (
            // Küçük resim SADECE İLK KAREYİ gösterir. Düz <img> kullanınca
            // strip'in tamamı (3-9 kare yan yana) görünüyordu ve ne seçtiğin
            // belli olmuyordu.
            <button key={a.src} onClick={() => setSel(a)} title={`${a.name} (${a.w}×${a.h}${a.frames > 1 ? `, ${a.frames} kare` : ''})`}
              style={{ aspectRatio: '1', background: sel?.src === a.src ? 'rgba(239,167,46,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${sel?.src === a.src ? C.candle : C.border}`, borderRadius: 6, cursor: 'pointer', padding: 3, overflow: 'hidden', position: 'relative' }}>
              <span style={{
                display: 'block', width: '100%', height: '100%',
                backgroundImage: `url(${a.src})`,
                backgroundSize: `${a.frames * 100}% 100%`,
                backgroundPosition: 'left top',
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
              }} />
              {a.frames > 1 && (
                <span style={{ position: 'absolute', right: 2, bottom: 1, fontSize: 9, color: C.candle, background: 'rgba(0,0,0,0.6)', padding: '0 3px', borderRadius: 3 }}>
                  {a.frames}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ORTA: harita */}
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} onClick={onClick}
          style={{ width: '100%', height: '100%', display: 'block', cursor: tool === 'tile' ? 'cell' : 'crosshair' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['object', 'tile', 'marker'] as Tool[]).map((t, i) => (
            <button key={t} onClick={() => setTool(t)}
              style={{ ...glass(8), padding: '6px 11px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                color: tool === t ? C.candle : C.boneDim, border: `1px solid ${tool === t ? C.candle : C.border}` }}>
              {i + 1}. {t === 'object' ? 'Nesne koy' : t === 'tile' ? 'Zemin boya' : 'Kapı/Portal'}
            </button>
          ))}
          {tool === 'marker' && (
            <select value={markerKind} onChange={(e) => setMarkerKind(e.target.value as MarkerKind)}
              style={{ ...glass(8), padding: '6px 8px', fontSize: 12, color: C.bone, border: `1px solid ${C.border}` }}>
              <option value="door">door (bina)</option>
              <option value="fight">fight portal</option>
              <option value="travel">travel portal</option>
            </select>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: 10, ...glass(8), padding: '7px 11px', fontSize: 11, color: C.boneFaint, lineHeight: 1.7 }}>
          <b style={{ color: C.boneDim }}>WASD</b> haritayı kaydır · <b style={{ color: C.boneDim }}>Ctrl+Z</b> geri al ·
          <b style={{ color: C.boneDim }}> Del</b> sil · <b style={{ color: C.boneDim }}>Ok</b> taşı (Shift = karo adım)<br />
          Nesnenin üstüne tık = <b style={{ color: C.boneDim }}>seç</b> · boşluğa tık = <b style={{ color: C.boneDim }}>koy</b> ·
          <b style={{ color: C.boneDim }}> Alt+tık</b> = üst üste koy · <b style={{ color: C.boneDim }}>Shift+tık</b> = spawn taşı
        </div>
      </div>

      {/* SAĞ: özellikler */}
      <div style={{ width: 250, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: '#14120f', padding: 12, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button onClick={() => { saveMapLocal(doc); setSaved(Date.now()); }} style={btn(C.ok)}>Kaydet</button>
          <button onClick={download} style={btn(C.candle)}>İndir</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button onClick={() => { if (confirm('Tüm nesneler silinsin mi?')) { setDoc((d) => ({ ...d, objects: [], markers: [] })); setSelId(null); } }}
            style={btn(C.blood)}>Hepsini temizle</button>
        </div>
        {saved > 0 && <div style={{ fontSize: 11, color: C.ok, marginBottom: 8 }}>✓ kaydedildi</div>}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: C.boneDim, display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Izgara
          </label>
          <label style={{ fontSize: 11, color: C.boneDim, display: 'flex', alignItems: 'center', gap: 5 }}>
            Zoom
            <input type="range" min={0.4} max={2} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 70 }} />
          </label>
        </div>

        <div style={{ fontSize: 11, color: C.boneFaint, marginBottom: 8 }}>
          {doc.objects.length} nesne · {doc.markers.length} işaretçi
        </div>

        {selObj && (
          <div style={{ ...glass(9), padding: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 12, wordBreak: 'break-all' }}>{selObj.src.split('/').pop()}</div>
            <Num label="X" v={selObj.x} on={(v) => patch({ x: v })} />
            <Num label="Y" v={selObj.y} on={(v) => patch({ y: v })} />
            <Num label="Genişlik" v={selObj.w} on={(v) => patch({ w: v })} />
            <Num label="Yükseklik" v={selObj.h} on={(v) => patch({ h: v })} />
            <Num label="Çarpışma (alt px)" v={selObj.solid ?? 0} on={(v) => patch({ solid: v })} />

            {/* Ölçek kısayolları — sayı yazmadan hızlı büyült/küçült */}
            <div style={{ display: 'flex', gap: 5, margin: '8px 0' }}>
              {[0.5, 0.75, 1.5, 2].map((k) => (
                <button key={k} onClick={() => patch({ w: Math.round(selObj.w * k), h: Math.round(selObj.h * k) })}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: C.boneDim, fontSize: 11, cursor: 'pointer' }}>
                  ×{k}
                </button>
              ))}
            </div>

            {/* Izgara sayfaları: hangi kare/satır kullanılacak */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 }}>
              <div style={{ fontSize: 10.5, color: C.boneFaint, marginBottom: 5 }}>
                SAYFA KESİMİ — çok kareli görsellerde tek kare göstermek için
              </div>
              <Num label="Sütun (kare)" v={selObj.frames ?? 1} on={(v) => patch({ frames: Math.max(1, v) })} />
              <Num label="Satır sayısı" v={selObj.rows ?? 1} on={(v) => patch({ rows: Math.max(1, v) })} />
              <Num label="Kullanılan satır" v={selObj.row ?? 0} on={(v) => patch({ row: Math.max(0, v) })} />
              {(selObj.frames ?? 1) > 1 && <Num label="FPS (0 = duruk)" v={selObj.fps ?? 8} on={(v) => patch({ fps: v })} />}
            </div>
            <button onClick={() => { setDoc((d) => ({ ...d, objects: d.objects.filter((o) => o.id !== selId) })); setSelId(null); }}
              style={{ ...btn(C.blood), width: '100%', marginTop: 8 }}>Sil</button>
          </div>
        )}

        {selMarker && (
          <div style={{ ...glass(9), padding: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 12 }}>{selMarker.kind}</div>
            <Txt label="Etiket" v={selMarker.label} on={(v) => patchM({ label: v })} />
            {selMarker.kind === 'door' && <Txt label="Panel (id)" v={selMarker.target ?? ''} on={(v) => patchM({ target: v })} />}
            {selMarker.kind === 'travel' && (<>
              <Num label="Hedef X" v={selMarker.toX ?? 0} on={(v) => patchM({ toX: v })} />
              <Num label="Hedef Y" v={selMarker.toY ?? 0} on={(v) => patchM({ toY: v })} />
            </>)}
            <button onClick={() => { setDoc((d) => ({ ...d, markers: d.markers.filter((m) => m.id !== selId) })); setSelId(null); }}
              style={{ ...btn(C.blood), width: '100%', marginTop: 8 }}>Sil</button>
          </div>
        )}

        {!selObj && !selMarker && (
          <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.65 }}>
            <b style={{ color: C.bone }}>1. Nesne koy</b> — bina, ağaç, çeşme, kaya gibi
            üstünde durulan/duvar olan her şey. Koyduktan sonra buradan boyut ve
            çarpışma ayarlanır.<br /><br />

            <b style={{ color: C.bone }}>2. Zemin boya</b> — karo karo zemin doldurur:
            çim, taş yol, su, toprak. Fırça gibi tıklayarak boyarsın.<br /><br />

            <b style={{ color: C.bone }}>3. Kapı/Portal</b> — oyunun etkileşim noktaları.
            <i>door</i> bir bina paneli açar, <i>fight</i> dövüş portalı,
            <i>travel</i> başka bir noktaya ışınlar.<br /><br />

            <b style={{ color: C.candle }}>Çarpışma</b> değeri, gövdenin alt kaç pikselinin
            geçilmez olduğudur. 0 = üstünden geçilir (çim, çiçek). Ağaç gövdesi ~14,
            bina duvarı ~46. Seçiliyken kırmızı çerçeve olarak görünür.<br /><br />

            <b style={{ color: '#7abeff' }}>Mavi kesikli çerçeve</b> oyuncunun ekranda
            gördüğü alanı gösterir — haritanın ne kadarının bir anda görüneceğini
            oradan ölçersin.
          </div>
        )}
      </div>
    </div>
  );
}

const btn = (col: string) => ({
  flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${col}66`,
  background: `${col}22`, color: col, fontWeight: 800, fontSize: 12, cursor: 'pointer',
});

function Num({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11.5, color: C.boneDim }}>
      {label}
      <input type="number" value={v} onChange={(e) => on(Number(e.target.value))}
        style={{ width: 84, padding: '4px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone, fontSize: 12 }} />
    </label>
  );
}

function Txt({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 6, fontSize: 11.5, color: C.boneDim }}>
      {label}
      <input value={v} onChange={(e) => on(e.target.value)}
        style={{ width: '100%', marginTop: 3, padding: '5px 7px', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone, fontSize: 12 }} />
    </label>
  );
}
