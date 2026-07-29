// Spatial hash grid — çarpışma sorgularını O(n²)'den kurtarır.
// NEDEN ZORUNLU: 500 düşman × 200 mermi = 100.000 mesafe kontrolü/frame → naive yaklaşım
// orta segment mobilde frame düşürür. Grid ile sorgu başına ~5-15 aday kalır.
// Her frame clear() + insert() yapılır (düşmanlar sürekli hareket ettiği için
// güncelleme yerine yeniden inşa daha hızlı ve daha az hata üretir).

export class SpatialHash<T> {
  private cell: number;
  private buckets = new Map<number, T[]>();

  constructor(cellSize: number) {
    this.cell = cellSize;
  }

  clear() {
    // Bucket dizilerini yeniden kullan (GC baskısı = frame spike)
    for (const arr of this.buckets.values()) arr.length = 0;
  }

  private key(cx: number, cy: number) {
    // 16-bit'e sıkıştırılmış hücre koordinatı → tek sayı anahtar
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  insert(x: number, y: number, item: T) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let arr = this.buckets.get(k);
    if (!arr) {
      arr = [];
      this.buckets.set(k, arr);
    }
    arr.push(item);
  }

  /** (x,y) merkezli r yarıçapındaki adayları out dizisine yazar (tahsis yok) */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c);
    const y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.buckets.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }
}
