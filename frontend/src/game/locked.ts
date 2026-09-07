// KİLİTLİ BİNALAR — tek kaynak.
//
// ⚠️ NİYE AYRI DOSYA: kilit bilgisi İKİ yerde gerekiyor ve iki kopya er ya
// da geç ayrışır — köyde kapıya yaklaşan oyuncuya gösterilen ipucu
// (`HubCanvas`) ve kapıdan girince açılan panel (`play/page.tsx`). Ayrışırsa
// kapı "Enter" der, panel "kapalı" der; oyuncu kapının bozuk olduğunu sanır.
//
// ⚠️ "COMING SOON" TEK BAŞINA HİÇBİR ŞEY SÖYLEMİYOR. Buradaki metinler NE
// olacağını ve NİYE kapalı olduğunu yazıyor — kapalı bir kapının önünde
// duran oyuncuya borçlu olduğumuz şey bu.

export interface LockedBuilding {
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  /** kapının ne zaman açılacağı — TARİH DEĞİL, ŞART */
  gate: string;
  accent?: string;
}

/**
 * ⚠️ HİÇBİR YERDE "swap gold for $GRAVE" DEMİYORUZ: hazine sabit kurdan alım
 * yaparsa oyun token BASMIŞ olur ve sıfır-emisyon sözü çöker. Her işlem
 * oyuncudan oyuncuya.
 */
export const LOCKED_BUILDINGS: Record<string, LockedBuilding> = {
  exchange: {
    kicker: 'THE EXCHANGE',
    title: 'Not yet trading',
    body: 'Standing bids: post what you would pay for gold and let sellers come to you. The Marketplace next door already takes listings.',
    bullets: [
      'Player-to-player only, no house counterparty',
      'A fee on token trades; half of it burned',
      'Gold-priced trades stay fee-free',
    ],
    /**
     * 🔴 ESKİ METİN "Opens with $GRAVE." İDİ VE FAZLA SÖZ VERİYORDU.
     * Plan, Exchange'i token çıktıktan BİR SÜRE SONRA açmak; o cümleyi okuyan
     * oyuncu token'ı alıp ilk gün Exchange arar ve bulamaz. Söz verilen gün
     * gelmediğinde kaybedilen şey bir özellik değil, güven.
     *
     * ⚠️ TARİH DEĞİL ShART yazıyor. Takvime bağlı bir söz, market alımı o gün
     * bozuksa da gelir; şarta bağlı olan gelmez. Ölçüt: Marketplace'in alım
     * tarafı gerçekten çalışıyor olmalı.
     */
    gate: 'Opens after the Marketplace has been trading.',
  },
};

/** Bu bina kilitli mi — köydeki kapı ipucu ve panel AYNI cevabı almalı */
export function isLockedBuilding(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCKED_BUILDINGS, id);
}
