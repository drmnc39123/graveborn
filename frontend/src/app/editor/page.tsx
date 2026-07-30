'use client';
// HARİTA EDİTÖRÜ — asseti soldan seç, haritaya tıkla, yerleştir.
//
// Neden: dünyayı kodda konumlandırmak işe yaramadı; tasarım kararı gözle
// verilir. Artık harita VERİ; bu sayfa o veriyi üretir, oyun okur.
//
// Kısayollar: 1 nesne · 2 zemin fırçası · 3 işaretçi · Del sil · Space+sürükle kaydır

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C, glass } from '@/lib/theme';
import { importCodeWorld } from '@/game/importWorld';
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
  const [screenGrid, setScreenGrid] = useState(true);
  /** Seçili asset bir SAYFA ise: kaç sütun/satır ve hangi hücre kullanılacak */
  const [slice, setSlice] = useState({ cols: 1, rows: 1, cx: 0, cy: 0 });
  /** fırça boyutu (karo) — zemin boyarken tek tek tıklamamak için */
  const [brush, setBrush] = useState(1);
  /** nesne dizerken kopyalar arası en az mesafe (px) */
  const [spacing, setSpacing] = useState(64);
  /** sürükleme durumu */
  const dragRef = useRef<{ active: boolean; mode: 'paint' | 'rect' | 'scatter' | 'erase' | null; sx: number; sy: number; lastX: number; lastY: number }>(
    { active: false, mode: null, sx: 0, sy: 0, lastX: 0, lastY: 0 },
  );
  const [rectPreview, setRectPreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** silgi modu — açıkken tıklama/sürükleme siler */
  const [erase, setErase] = useState(false);
  const [autoAt, setAutoAt] = useState<string>('');
  /** çizim gerekiyor mu — boştayken kare harcamamak için */
  const dirtyRef = useRef(true);
  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);
  /** panel katlama — ekran alanı dar geldiğinde kapatılır */
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(true);

  /**
   * OTOMATİK KAYDETME — 30 dakikalık emek kaybının sebebi buydu, artık var.
   * Her değişiklikten 1.5 sn sonra yazar (debounce); sürekli yazıp donmaz.
   */
  useEffect(() => {
    const id = setTimeout(() => {
      saveMapLocal(doc);
      setAutoAt(new Date().toLocaleTimeString());
    }, 1500);
    return () => clearTimeout(id);
  }, [doc]);

  /** Sekme kapanırken/gizlenirken son hâli garanti yaz */
  useEffect(() => {
    const flush = () => saveMapLocal(doc);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [doc]);
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
    if (!i) {
      i = new Image();
      // Görseller ASENKRON yükleniyor. Dirty-flag geldikten sonra döngü
      // sürekli çizmediği için yüklenen görsel tek başına ekrana gelmiyordu
      // (her şey turuncu yer tutucu kalıyordu). Yükleme bitince çizim iste.
      i.onload = () => { dirtyRef.current = true; };
      i.onerror = () => { dirtyRef.current = true; };
      i.src = src;
      imgCache.current.set(src, i);
    }
    return i.complete && i.naturalWidth ? i : null;
  }, []);

  /**
   * Sayfa ızgarasını TAHMİN ET. Paketlerin bir kısmı `_stripN` yazıyor
   * (o zaman zaten biliyoruz), bir kısmı yazmıyor ve 640×1440 gibi dev
   * ızgaralar geliyor. Yaygın hücre boyutlarından ikisini de tam bölen
   * EN BÜYÜĞÜNÜ seçiyoruz — 640×1440 için 80 → 8×18 çıkıyor.
   */
  const guessSlice = useCallback((a: Asset) => {
    if (a.frames > 1) return { cols: a.frames, rows: 1, cx: 0, cy: 0 };
    const fullW = a.w * a.frames, fullH = a.h;
    if (fullW <= 128 && fullH <= 128) return { cols: 1, rows: 1, cx: 0, cy: 0 };
    for (const cell of [128, 96, 80, 64, 48, 32]) {
      if (fullW % cell === 0 && fullH % cell === 0) {
        const cols = fullW / cell, rows = fullH / cell;
        if (cols * rows > 1) return { cols, rows, cx: 0, cy: 0 };
      }
    }
    return { cols: 1, rows: 1, cx: 0, cy: 0 };
  }, []);

  useEffect(() => { if (sel) setSlice(guessSlice(sel)); }, [sel, guessSlice]);

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
      // ── DONMA HATASI 3: boşa çizim ──
      // Editör çoğu zaman durağan ama döngü saniyede 60 kez tüm sahneyi
      // çiziyordu. Artık SADECE bir şey değiştiğinde çiziyor; boştayken
      // kare maliyeti sıfır.
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

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

      // ── GÖRÜNÜR ALAN (culling) ──
      // DONMA HATASI 2: burada tüm harita her karede çiziliyordu.
      // 6144 karo + 1294 nesne × 60 fps = saniyede ~444.000 çizim çağrısı.
      // Artık sadece kameraya giren çiziliyor; harita büyüdükçe maliyet artmıyor.
      const viewL = camRef.current.x, viewT = camRef.current.y;
      const viewR = viewL + w / zoom, viewB = viewT + h / zoom;

      // zemin — sürükleyerek boyarken tampondan oku, böylece anlık görünür
      // (tampon setDoc'a girmiyor; ilk donmayı önleyen şey oydu)
      const buf = paintBufRef.current;
      const tData = buf ? buf.data : terrain.data;
      const tPal = buf ? buf.palette : terrain.palette;
      const tx0 = Math.max(0, Math.floor(viewL / T));
      const tx1 = Math.min(terrain.w - 1, Math.ceil(viewR / T));
      const ty0 = Math.max(0, Math.floor(viewT / T));
      const ty1 = Math.min(terrain.h - 1, Math.ceil(viewB / T));
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const v = tData[ty * terrain.w + tx];
          if (!v) continue;
          const im = img(tPal[v - 1]);
          if (im) ctx.drawImage(im, tx * T, ty * T, T, T);
        }
      }

      // karo ızgarası — sadece görünen aralık (yakınlaşınca çizgi seli olmasın)
      if (zoom > 0.35) {
        ctx.strokeStyle = 'rgba(227,216,192,0.07)';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        for (let x = tx0; x <= tx1 + 1; x++) { ctx.moveTo(x * T, ty0 * T); ctx.lineTo(x * T, (ty1 + 1) * T); }
        for (let y = ty0; y <= ty1 + 1; y++) { ctx.moveTo(tx0 * T, y * T); ctx.lineTo((tx1 + 1) * T, y * T); }
        ctx.stroke();
      }

      // EKRAN IZGARASI — harita kaç ekran ediyor, gözle ölç.
      // "Her şeyi görünen alana mı dizeceğim?" sorusunun cevabı: hayır, ama
      // önemli şeyler spawn'a 1-2 ekran mesafede kalmalı.
      if (screenGrid) {
        const CW = 1280, CH = 720;
        ctx.strokeStyle = 'rgba(122,190,255,0.35)';
        ctx.lineWidth = 2 / zoom;
        const gx0 = Math.floor(viewL / CW) * CW, gx1 = Math.ceil(viewR / CW) * CW;
        const gy0 = Math.floor(viewT / CH) * CH, gy1 = Math.ceil(viewB / CH) * CH;
        ctx.beginPath();
        for (let x = gx0; x <= gx1; x += CW) { ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); }
        for (let y = gy0; y <= gy1; y += CH) { ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); }
        ctx.stroke();
        ctx.fillStyle = 'rgba(122,190,255,0.55)';
        ctx.font = `${13 / zoom}px ui-sans-serif`;
        const perRow = Math.ceil((terrain.w * T) / CW);
        for (let y = Math.max(0, gy0); y < gy1; y += CH)
          for (let x = Math.max(0, gx0); x < gx1; x += CW) {
            const n = (y / CH) * perRow + x / CW + 1;
            ctx.fillText(`ekran ${n}`, x + 8, y + 20);
          }
      }

      // nesneler — ayak Y'sine göre sıralı (oyundaki derinlikle aynı).
      // Önce GÖRÜNÜR olanları ele, sonra sırala: 1294 nesneyi her karede
      // sıralamak da başlı başına maliyetti.
      const objs = doc.objects
        .filter((o) => o.x + o.w >= viewL && o.x <= viewR && o.y + o.h >= viewT && o.y <= viewB)
        .sort((a, b) => a.y + a.h - (b.y + b.h));
      for (const o of objs) {
        const im = img(o.src);
        if (im) {
          // TEK KARE kes: sütun sayısı (frames) ve satır sayısı (rows) ile.
          // Izgara sayfaları (18 satır × 8 kare) bu olmadan tek parça çiziliyordu.
          const cols = o.frames ?? 1, rws = o.rows ?? 1;
          const fw = Math.floor(im.width / cols);
          const fh = Math.floor(im.height / rws);
          ctx.drawImage(im, (o.col ?? 0) * fw, (o.row ?? 0) * fh, fw, fh, o.x, o.y, o.w, o.h);
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

      // işaretçiler (görünür olanlar)
      for (const m of doc.markers) {
        if (m.x < viewL - 40 || m.x > viewR + 40 || m.y < viewT - 40 || m.y > viewB + 40) continue;
        const col = m.kind === 'fight' ? '#a01226' : m.kind === 'travel' ? '#5f9e4a' : '#8a97a3';
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2 / zoom; ctx.stroke();
        ctx.fillStyle = C.bone;
        ctx.font = `${11 / zoom}px ui-sans-serif, system-ui`;
        ctx.fillText(m.label || m.kind, m.x + 12, m.y + 4);
        if (m.id === selId) { ctx.strokeStyle = C.candle; ctx.strokeRect(m.x - 12, m.y - 12, 24, 24); }
      }

      // dikdörtgen doldurma önizlemesi
      if (rectPreview) {
        const a = Math.floor(Math.min(rectPreview.x0, rectPreview.x1) / T) * T;
        const b = Math.floor(Math.max(rectPreview.x0, rectPreview.x1) / T) * T + T;
        const c = Math.floor(Math.min(rectPreview.y0, rectPreview.y1) / T) * T;
        const e2 = Math.floor(Math.max(rectPreview.y0, rectPreview.y1) / T) * T + T;
        ctx.fillStyle = 'rgba(239,167,46,0.22)';
        ctx.fillRect(a, c, b - a, e2 - c);
        ctx.strokeStyle = C.candle; ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(a, c, b - a, e2 - c);
        ctx.fillStyle = C.candle;
        ctx.font = `${12 / zoom}px ui-sans-serif`;
        ctx.fillText(`${(b - a) / T} × ${(e2 - c) / T} karo`, a + 4, c - 6);
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
    dirtyRef.current = true; // bağımlılıklar değişti → bir kez çiz
    raf = requestAnimationFrame(draw);

    // GÜVENLİK AĞI: görseller akarken ilk 6 saniye düzenli çizim iste.
    // Tek başına img.onload'a güvenmek kırılgan — önbellekten gelen, hata
    // veren veya yarışan yüklemelerde ekran siyah kalıyordu.
    const warmup = setInterval(() => { dirtyRef.current = true; }, 250);
    const stop = setTimeout(() => clearInterval(warmup), 6000);

    return () => { cancelAnimationFrame(raf); clearInterval(warmup); clearTimeout(stop); };
  }, [doc, selId, zoom, img, screenGrid, rectPreview]);

  // ── girdi ──
  const toWorld = (e: React.MouseEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / zoom + camRef.current.x,
      y: (e.clientY - r.top) / zoom + camRef.current.y,
    };
  };
  const snapped = (v: number) => (snap ? Math.round(v / MAP_TILE) * MAP_TILE : Math.round(v));

  /**
   * Fırça boyutuna göre karo boya.
   *
   * PERFORMANS — DONMA HATASI BURADAYDI: eskiden her ara karo için ayrı
   * setDoc çağrılıyordu. Hızlı sürüklemede saniyede binlerce çağrı × 6144
   * elemanlık dizi kopyası + React render = sayfa kilitleniyordu.
   * ŞİMDİ: sürükleme boyunca TEK bir tampon dizide birikiyor (mutasyon),
   * setDoc sadece pointer bırakılınca bir kez çağrılıyor.
   */
  const paintBufRef = useRef<{ data: number[]; palette: string[] } | null>(null);

  const paintAt = useCallback((wx: number, wy: number) => {
    const buf = paintBufRef.current;
    if (!sel || !buf) return;
    let pi = buf.palette.indexOf(sel.src);
    if (pi < 0) { buf.palette.push(sel.src); pi = buf.palette.length - 1; }
    const cx = Math.floor(wx / MAP_TILE), cy = Math.floor(wy / MAP_TILE);
    const r = Math.floor(brush / 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx >= 0 && ty >= 0 && tx < doc.terrain.w && ty < doc.terrain.h) buf.data[ty * doc.terrain.w + tx] = pi;
      }
    }
  }, [sel, brush, doc.terrain.w, doc.terrain.h]);

  /** Dikdörtgen doldur — iki köşe arası tüm karolar */
  const fillRectTiles = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    if (!sel) return;
    setDoc((d) => {
      const t = { ...d.terrain, palette: [...d.terrain.palette], data: [...d.terrain.data] };
      const pi = paletteIndex(t, sel.src);
      const a = Math.floor(Math.min(x0, x1) / MAP_TILE), b = Math.floor(Math.max(x0, x1) / MAP_TILE);
      const c = Math.floor(Math.min(y0, y1) / MAP_TILE), e2 = Math.floor(Math.max(y0, y1) / MAP_TILE);
      for (let ty = c; ty <= e2; ty++)
        for (let tx = a; tx <= b; tx++)
          if (tx >= 0 && ty >= 0 && tx < t.w && ty < t.h) t.data[ty * t.w + tx] = pi;
      return { ...d, terrain: t };
    });
  }, [sel]);

  /** İmlecin altındaki nesneyi/işaretçiyi/karoyu sil */
  const eraseAt = useCallback((wx: number, wy: number) => {
    setDoc((d) => {
      // önce nesne (en üstteki)
      for (let i = d.objects.length - 1; i >= 0; i--) {
        const o = d.objects[i];
        if (wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) {
          return { ...d, objects: d.objects.filter((x) => x.id !== o.id) };
        }
      }
      // sonra işaretçi
      const mk = d.markers.find((m) => Math.hypot(m.x - wx, m.y - wy) < 18);
      if (mk) return { ...d, markers: d.markers.filter((m) => m.id !== mk.id) };
      // en son zemin karosu (0 = boş)
      const tx = Math.floor(wx / MAP_TILE), ty = Math.floor(wy / MAP_TILE);
      if (tx < 0 || ty < 0 || tx >= d.terrain.w || ty >= d.terrain.h) return d;
      if (!d.terrain.data[ty * d.terrain.w + tx]) return d;
      const data = [...d.terrain.data];
      const r = Math.floor(brush / 2);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const a = tx + dx, b = ty + dy;
          if (a >= 0 && b >= 0 && a < d.terrain.w && b < d.terrain.h) data[b * d.terrain.w + a] = 0;
        }
      return { ...d, terrain: { ...d.terrain, data } };
    });
  }, [brush]);

  const onClick = (e: React.MouseEvent) => {
    const p = toWorld(e);
    if (e.shiftKey && tool !== 'tile') { setDoc((d) => ({ ...d, spawn: { x: Math.round(p.x), y: Math.round(p.y) } })); return; }
    if (erase) { pushUndo(); eraseAt(p.x, p.y); return; }
    if (tool === 'tile') return; // zemin artık sürükleme ile (pointer olayları)

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
    // Seçilen HÜCRENİN boyutu (sayfa dilimlemesi uygulanmış).
    // 1080×1080 diyalog portreleri gerçek boyutta ekranı kaplıyordu → 256 tavan.
    const fullW = sel.w * sel.frames, fullH = sel.h;
    const cw = Math.floor(fullW / slice.cols), ch = Math.floor(fullH / slice.rows);
    const scale = Math.min(1, 256 / Math.max(cw, ch));
    const pw = Math.round(cw * scale), ph = Math.round(ch * scale);
    const o: MapObject = {
      id: nextId.current++, src: sel.src,
      x: snapped(p.x - pw / 2), y: snapped(p.y - ph / 2),
      w: pw, h: ph,
      frames: slice.cols, rows: slice.rows, row: slice.cy, col: slice.cx,
      fps: 0, // duruk başlar; animasyon istenirse sağdan FPS verilir
      solid: 0,
    };
    setDoc((d) => ({ ...d, objects: [...d.objects, o] }));
    setSelId(o.id);
  };

  // ── SÜRÜKLEME ── zemin boyama ve nesne dizme
  const onPointerDown = (e: React.PointerEvent) => {
    const p = toWorld(e as unknown as React.MouseEvent);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const dr = dragRef.current;
    dr.sx = p.x; dr.sy = p.y; dr.lastX = p.x; dr.lastY = p.y; dr.active = true;

    // Sağ tık VEYA silgi modu = sil (sürükleyerek de siler)
    if (e.button === 2 || erase) {
      dr.mode = 'erase'; pushUndo(); eraseAt(p.x, p.y);
      return;
    }

    if (tool === 'tile' && sel) {
      if (e.shiftKey) { dr.mode = 'rect'; setRectPreview({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }
      else {
        dr.mode = 'paint'; pushUndo();
        // sürükleme boyunca tek tampon — setDoc bırakınca bir kez çağrılır
        paintBufRef.current = { data: [...doc.terrain.data], palette: [...doc.terrain.palette] };
        paintAt(p.x, p.y);
        markDirty();
      }
    } else if (tool === 'object' && sel && e.altKey) {
      // Alt basılı + sürükle = aynı nesneden sıra dizer (ağaç sırası, çit)
      dr.mode = 'scatter'; pushUndo();
    } else {
      dr.mode = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (!dr.active || !dr.mode) return;
    const p = toWorld(e as unknown as React.MouseEvent);

    if (dr.mode === 'erase') {
      if (Math.hypot(p.x - dr.lastX, p.y - dr.lastY) < 8) return;
      dr.lastX = p.x; dr.lastY = p.y;
      eraseAt(p.x, p.y);
      markDirty();
      return;
    }

    if (dr.mode === 'paint') {
      markDirty(); // tampon setDoc'a girmiyor → çizimi elle tetikle
      // ara noktaları da doldur — hızlı sürüklemede boşluk kalmasın
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - dr.lastX, p.y - dr.lastY) / (MAP_TILE / 2)));
      for (let i = 1; i <= steps; i++) {
        paintAt(dr.lastX + (p.x - dr.lastX) * (i / steps), dr.lastY + (p.y - dr.lastY) * (i / steps));
      }
      dr.lastX = p.x; dr.lastY = p.y;
    } else if (dr.mode === 'rect') {
      setRectPreview({ x0: dr.sx, y0: dr.sy, x1: p.x, y1: p.y });
    } else if (dr.mode === 'scatter' && sel) {
      if (Math.hypot(p.x - dr.lastX, p.y - dr.lastY) < spacing) return;
      dr.lastX = p.x; dr.lastY = p.y;
      const fullW = sel.w * sel.frames, fullH = sel.h;
      const cw = Math.floor(fullW / slice.cols), ch = Math.floor(fullH / slice.rows);
      const sc = Math.min(1, 256 / Math.max(cw, ch));
      const pw = Math.round(cw * sc), ph = Math.round(ch * sc);
      const o: MapObject = {
        id: nextId.current++, src: sel.src,
        x: snapped(p.x - pw / 2), y: snapped(p.y - ph / 2), w: pw, h: ph,
        frames: slice.cols, rows: slice.rows, row: slice.cy, col: slice.cx,
        fps: 0, solid: 0,
      };
      setDoc((d) => ({ ...d, objects: [...d.objects, o] }));
    }
  };

  /**
   * Fare tekerleği ile zoom — İMLECİN ALTINDAKİ nokta sabit kalır.
   * Ekranın ortasına göre zoomlarsak kullanıcı baktığı yeri kaybediyor.
   * Matematik: dünya noktası wx = cam.x + sx/zoom sabit tutulacak şekilde
   * yeni cam hesaplanır.
   */
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;

    const old = zoom;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.min(3, Math.max(0.15, +(old * factor).toFixed(3)));
    if (next === old) return;

    // imlecin altındaki dünya noktası
    const wx = camRef.current.x + sx / old;
    const wy = camRef.current.y + sy / old;
    camRef.current.x = wx - sx / next;
    camRef.current.y = wy - sy / next;

    setZoom(next);
    markDirty();
  };

  const onPointerUp = () => {
    const dr = dragRef.current;
    if (dr.mode === 'rect' && rectPreview) {
      pushUndo();
      fillRectTiles(rectPreview.x0, rectPreview.y0, rectPreview.x1, rectPreview.y1);
    }
    // boyama tamponunu TEK seferde işle (sürükleme boyunca setDoc çağrılmadı)
    if (dr.mode === 'paint' && paintBufRef.current) {
      const buf = paintBufRef.current;
      setDoc((d) => ({ ...d, terrain: { ...d.terrain, data: buf.data, palette: buf.palette } }));
      paintBufRef.current = null;
    }
    setRectPreview(null);
    dr.active = false; dr.mode = null;
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
      if (k === 'w') { camRef.current.y -= pan; markDirty(); }
      if (k === 's') { camRef.current.y += pan; markDirty(); }
      if (k === 'a') { camRef.current.x -= pan; markDirty(); }
      if (k === 'd') { camRef.current.x += pan; markDirty(); }
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
      {/* Kapalıyken display:none — width:0 denendi, flex düzeninde hesaplanan
          genişlik 250'de takılı kaldı (inline 0px olmasına rağmen). Elemanı
          tamamen kaldırmak tek kesin yol. */}
      <div style={{ width: 250, flexShrink: 0, borderRight: `1px solid ${C.border}`,
        display: leftOpen ? 'flex' : 'none', flexDirection: 'column', background: '#14120f', overflow: 'hidden' }}>
        <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara…"
            style={{ width: '100%', padding: '7px 9px', borderRadius: 7, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone, outline: 'none', fontSize: 12 }} />
          <select value={cat} onChange={(e) => { setCat(e.target.value); setQ(''); }}
            style={{ width: '100%', marginTop: 7, padding: '6px 8px', borderRadius: 7, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone, fontSize: 12 }}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 6 }}>{shown.length} asset</div>
        </div>

        {/* SAYFA DİLİMLEYİCİ — çok kareli görsellerde HANGİ kareyi koyacağını seç.
            Bu olmadan 640×1440'lık canavar sayfası tek parça olarak konuyordu. */}
        {sel && slice.cols * slice.rows > 1 && (
          <div style={{ padding: 10, borderBottom: `1px solid ${C.border}`, background: 'rgba(239,167,46,0.05)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.candle, marginBottom: 6 }}>
              SAYFA — kareyi seç ({slice.cols}×{slice.rows})
            </div>
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${slice.cols}/${slice.rows}`, maxHeight: 190, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sel.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill', imageRendering: 'pixelated', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'grid',
                gridTemplateColumns: `repeat(${slice.cols},1fr)`, gridTemplateRows: `repeat(${slice.rows},1fr)` }}>
                {Array.from({ length: slice.cols * slice.rows }, (_, i) => {
                  const cx = i % slice.cols, cy = Math.floor(i / slice.cols);
                  const on = cx === slice.cx && cy === slice.cy;
                  return (
                    <button key={i} onClick={() => setSlice((s) => ({ ...s, cx, cy }))}
                      title={`sütun ${cx}, satır ${cy}`}
                      style={{ border: on ? `2px solid ${C.candle}` : '1px solid rgba(255,255,255,0.12)',
                        background: on ? 'rgba(239,167,46,0.22)' : 'transparent', cursor: 'pointer', padding: 0 }} />
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
              <MiniNum label="sütun" v={slice.cols} on={(v) => setSlice((s) => ({ ...s, cols: Math.max(1, v), cx: 0 }))} />
              <MiniNum label="satır" v={slice.rows} on={(v) => setSlice((s) => ({ ...s, rows: Math.max(1, v), cy: 0 }))} />
            </div>
            <div style={{ fontSize: 10, color: C.boneFaint, marginTop: 5 }}>
              Seçtiğin kare haritaya konur. Izgara yanlışsa sütun/satır sayısını düzelt.
            </div>
          </div>
        )}
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
        {/* Panel katlama düğmeleri — kenarlarda, harita alanını açmak için */}
        <button onClick={() => setLeftOpen((v) => !v)} title={leftOpen ? 'Paleti gizle' : 'Paleti göster'}
          style={sideTab(0)}>{leftOpen ? '◀' : '▶'}</button>
        <button onClick={() => setRightOpen((v) => !v)} title={rightOpen ? 'Paneli gizle' : 'Paneli göster'}
          style={sideTab(1)}>{rightOpen ? '▶' : '◀'}</button>

        <canvas ref={canvasRef} onClick={onClick} onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()} /* sağ tık = sil, menü açılmasın */
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: tool === 'tile' ? 'cell' : 'crosshair' }} />
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['object', 'tile', 'marker'] as Tool[]).map((t, i) => (
            <button key={t} onClick={() => setTool(t)}
              style={{ ...glass(8), padding: '6px 11px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                color: tool === t ? C.candle : C.boneDim, border: `1px solid ${tool === t ? C.candle : C.border}` }}>
              {i + 1}. {t === 'object' ? 'Nesne koy' : t === 'tile' ? 'Zemin boya' : 'Kapı/Portal'}
            </button>
          ))}
          <button onClick={() => setErase((v) => !v)}
            style={{ padding: '7px 14px', borderRadius: 8, fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
              border: `1px solid ${erase ? C.blood : C.border}`,
              background: erase ? 'rgba(160,18,38,0.25)' : 'transparent',
              color: erase ? '#ff8b9c' : C.boneDim }}>
            🧽 Silgi {erase ? 'AÇIK' : ''}
          </button>
          {tool === 'tile' && (
            <span style={{ ...glass(8), padding: '5px 10px', fontSize: 11.5, color: C.boneDim, display: 'flex', alignItems: 'center', gap: 7 }}>
              Fırça
              {[1, 3, 5, 9].map((b) => (
                <button key={b} onClick={() => setBrush(b)}
                  style={{ padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 800,
                    border: `1px solid ${brush === b ? C.candle : C.border}`,
                    background: brush === b ? 'rgba(239,167,46,0.18)' : 'transparent',
                    color: brush === b ? C.candle : C.boneDim }}>{b}×{b}</button>
              ))}
            </span>
          )}
          {tool === 'object' && (
            <span style={{ ...glass(8), padding: '5px 10px', fontSize: 11.5, color: C.boneDim, display: 'flex', alignItems: 'center', gap: 6 }}>
              Dizme aralığı
              <input type="range" min={24} max={200} step={8} value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} style={{ width: 80 }} />
              <b style={{ color: C.candle }}>{spacing}px</b>
            </span>
          )}
          {tool === 'marker' && (
            <select value={markerKind} onChange={(e) => setMarkerKind(e.target.value as MarkerKind)}
              style={{ ...glass(8), padding: '6px 8px', fontSize: 12, color: C.bone, border: `1px solid ${C.border}` }}>
              <option value="door">door (bina)</option>
              <option value="fight">fight portal</option>
              <option value="travel">travel portal</option>
            </select>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: 10, ...glass(8), padding: helpOpen ? '7px 11px' : '5px 9px', fontSize: 11, color: C.boneFaint, lineHeight: 1.7, maxWidth: '62%' }}>
          <button onClick={() => setHelpOpen((v) => !v)}
            style={{ background: 'none', border: 'none', color: C.candle, cursor: 'pointer', fontSize: 11, fontWeight: 800, padding: 0 }}>
            {helpOpen ? '▾ Kısayollar' : '▸ Kısayollar'}
          </button>
          {helpOpen && (
            <div style={{ marginTop: 4 }}>
              <b style={{ color: C.candle }}>ZEMİN:</b> basılı tut + sürükle = boya ·
              <b style={{ color: C.candle }}> Shift+sürükle</b> = dikdörtgen doldur · fırça 1/3/5/9<br />
              <b style={{ color: C.candle }}>NESNE:</b> <b style={{ color: C.candle }}>Alt+sürükle</b> = arka arkaya diz ·
              üstüne tık = seç · boşluğa tık = tek koy · Shift+tık = spawn taşı<br />
              <b style={{ color: C.blood }}>SİL:</b> sağ tık (veya Silgi) · sürükleyerek de siler<br />
              <b style={{ color: C.boneDim }}>Tekerlek</b> zoom (imlece doğru) · <b style={{ color: C.boneDim }}>WASD</b> kaydır ·
              <b style={{ color: C.boneDim }}>Ctrl+Z</b> geri al · <b style={{ color: C.boneDim }}>Del</b> sil
            </div>
          )}
        </div>
      </div>

      {/* SAĞ: özellikler */}
      <div style={{ width: rightOpen ? 250 : 0, minWidth: 0, flexShrink: 0,
        borderLeft: rightOpen ? `1px solid ${C.border}` : 'none',
        background: '#14120f', padding: rightOpen ? 12 : 0, overflowY: 'auto', overflowX: 'hidden', transition: 'width 120ms' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button onClick={() => { saveMapLocal(doc); setSaved(Date.now()); setAutoAt(new Date().toLocaleTimeString()); }} style={btn(C.ok)}>Kaydet</button>
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
          <label style={{ fontSize: 11, color: '#7abeff', display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={screenGrid} onChange={(e) => setScreenGrid(e.target.checked)} /> Ekranlar
          </label>
          <label style={{ fontSize: 11, color: C.boneDim, display: 'flex', alignItems: 'center', gap: 5 }}>
            Zoom
            <input type="range" min={0.4} max={2} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 70 }} />
          </label>
        </div>

        <div style={{ fontSize: 11, color: C.boneFaint, marginBottom: 3 }}>
          {doc.objects.length} nesne · {doc.markers.length} işaretçi
        </div>
        <div style={{ fontSize: 10.5, color: autoAt ? C.ok : C.boneFaint, marginBottom: 8 }}>
          {autoAt ? `✓ otomatik kaydedildi ${autoAt}` : 'otomatik kayıt bekleniyor…'}
        </div>

        {/* MEVCUT DÜNYAYI İÇE AKTAR — koddaki köyü editöre getirir,
            sıfırdan başlamak yerine üstünde çalışılır. */}
        <button onClick={() => {
          if (doc.objects.length && !confirm('Mevcut haritanın üstüne kodda tanımlı dünya yüklenecek. Devam?')) return;
          pushUndo();
          setDoc(importCodeWorld());
        }}
          style={{ width: '100%', padding: '9px 0', marginBottom: 8, borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${C.ice}66`, background: 'rgba(138,151,163,0.14)', color: C.bone, fontWeight: 800, fontSize: 12 }}>
          ⬇ Koddaki dünyayı yükle
        </button>

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
              <Num label="Kullanılan sütun" v={selObj.col ?? 0} on={(v) => patch({ col: Math.max(0, v) })} />
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

/** Kenardaki katlama sekmesi — 0 = sol, 1 = sağ */
const sideTab = (side: 0 | 1): React.CSSProperties => ({
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  [side === 0 ? 'left' : 'right']: 0,
  width: 18, height: 62, zIndex: 5, cursor: 'pointer',
  border: `1px solid ${C.border}`,
  borderRadius: side === 0 ? '0 7px 7px 0' : '7px 0 0 7px',
  background: 'rgba(20,18,15,0.92)', color: C.boneDim, fontSize: 11, padding: 0,
});

function MiniNum({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label style={{ flex: 1, fontSize: 10, color: C.boneFaint }}>
      {label}
      <input type="number" value={v} onChange={(e) => on(Number(e.target.value))}
        style={{ width: '100%', padding: '3px 5px', borderRadius: 5, background: 'rgba(0,0,0,0.4)', border: `1px solid ${C.border}`, color: C.bone, fontSize: 11 }} />
    </label>
  );
}

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
