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

  /**
   * (x,y) çevresindeki 3×3 hücrede kaç öğe olduğunu SAYAR — diziye yazmaz.
   *
   * NEDEN AYRI BİR METOT: `swarm` davranışı her düşman için her tick komşu
   * sayısına ihtiyaç duyuyor. Bunu `query()` ile yapmak 420 düşmanlık sahnede
   * saniyede on binlerce dizi push'u demek — tick bütçesini tek başına yer.
   * Burada sadece 9 Map araması + 9 `length` okuması var, tahsis SIFIR.
   *
   * ⚠️ Yaklaşıktır: yarıçap değil KUTU sayar (3×3 hücre = 3·cell kenar) ve
   * öğenin kendisi de sayıya dahildir. `swarm` için doğru olan da bu —
   * mesele kesin mesafe değil "kalabalık mıyım".
   */
  countNear(x: number, y: number): number {
    const c = this.cell;
    const cx = Math.floor(x / c);
    const cy = Math.floor(y / c);
    let n = 0;
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        const arr = this.buckets.get(this.key(i, j));
        if (arr) n += arr.length;
      }
    }
    return n;
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
