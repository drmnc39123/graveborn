// PLAN OYNATICI — diske yazılmış gerçek oyun karelerini video hızında sürer.
//
// 🔴 NİYE KARE DİZİSİ, VİDEO DOSYASI DEĞİL: kareler oyunun motorundan sabit
// adımla çıktı (`tools/capture.mjs`). Araya bir mp4 kodlaması sokmak hem
// piksel sanatı bulandırırdı hem de her plan için ayrı bir kırpma/zamanlama
// işi doğururdu. Burada plan = klasör + kare aralığı.
//
// ⚠️ `<Img>` REMOTION'DAN GELİYOR, `<img>` DEĞİL: Remotion'unki görsel
// yüklenene kadar KAREYİ BEKLETİYOR. Düz `<img>` ile render sırasında
// yüklenmemiş kareler siyah çıkar ve bu sessizce olur.

import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C } from '../theme';

export type PlanProps = {
  /** `public/frames/<sahne>/` klasörü */
  sahne: string;
  /** klasördeki kare sayısı */
  adet: number;
  /** ilk gösterilecek kare (planı ortasından başlatmak için) */
  bas?: number;
  /** 1 = yakalandığı hız. <1 ağır çekim, >1 hızlı */
  hiz?: number;
  /** yavaş yakınlaşma — sabit bir görüntü videoda ölü durur */
  zoom?: [number, number];
  /** kayma (yüzde) */
  kaydir?: [number, number];
  parlaklik?: number;
  doygunluk?: number;
  /** başa dönmesine İZİN ver (bkz. aşağıdaki mühür) */
  sarma?: boolean;
};

/**
 * ⚠️ KARE İNDEKSİ SARILIYOR (`%`), KIRPILMIYOR. Plan, klasördeki kareden
 * uzun tutulursa son karede DONMAK yerine başa dönüyor: donmuş bir plan
 * videoda "oyun kilitlendi" gibi okunuyor ve bu tam da tanıtımda
 * verilebilecek en kötü izlenim.
 *
 * 🔴 AMA SARMA SESSİZ OLAMAZ — MÜHÜR. Kurgunun ilk hâlinde DÖRT sahne
 * (söz · beta · token · kapanış) elindeki kare sayısını aşıyordu ve arka
 * plan sahnenin ortasında bambaşka bir yere ZIPLIYORDU: kapanış kartının
 * arkasında istenmeyen bir kesme. Hiçbir hata çıkmıyordu, çünkü `%` her
 * zaman geçerli bir kare üretiyor — "kod çalışıyor, veri geliyor, son
 * adımda ölüyor" sınıfının tam örneği.
 *
 * Artık sarma AÇIKÇA istenmediyse render DURUYOR. Remotion her kareyi
 * çizdiği için bu istisna, hatalı kurguyu ilk denemede yüzümüze vuruyor.
 */
export const Plan: React.FC<PlanProps> = ({
  sahne, adet, bas = 0, hiz = 1, zoom = [1.04, 1.1], kaydir = [0, 0],
  parlaklik = 1, doygunluk = 1, sarma = false,
}) => {
  const f = useCurrentFrame();
  const ham = bas + Math.floor(f * hiz);
  if (!sarma && ham >= adet) {
    throw new Error(
      `Plan "${sahne}": ${adet} kare var, ${ham + 1}. kare istendi. `
      + 'Sahne klipten uzun — `hiz`i düşür, `bas`ı küçült ya da bilerek '
      + 'başa dönsün istiyorsan `sarma` ver.',
    );
  }
  const i = ham % adet;
  const ad = String(i).padStart(4, '0') + '.webp';

  const olcek = interpolate(f, [0, 120], zoom, { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: C.void, overflow: 'hidden' }}>
      <Img
        src={staticFile(`frames/${sahne}/${ad}`)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: `scale(${olcek}) translate(${kaydir[0]}%, ${kaydir[1]}%)`,
          // ⚠️ Piksel sanat: tarayıcı yumuşatması kapatılıyor, yoksa
          // ölçeklenen kareler bulanır ve oyun "ucuz" görünür.
          imageRendering: 'pixelated',
          filter: `brightness(${parlaklik}) saturate(${doygunluk})`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * PANEL FOTOĞRAFI — tek kare, yavaş kaydırma/yakınlaşma (Ken Burns).
 *
 * ⚠️ HAREKET ŞART. Bir panel ekran görüntüsünü 2 saniye sabit göstermek,
 * videoyu slayt gösterisine çevirir; ölçülü bir yakınlaşma aynı kareyi
 * "çekim" yapar.
 */
export const Panel: React.FC<{
  ad: string;
  odak?: [number, number];   // yakınlaşmanın merkezi (yüzde)
  zoom?: [number, number];
  sure: number;
}> = ({ ad, odak = [50, 50], zoom = [1.12, 1.26], sure }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, sure], zoom, { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: C.void, overflow: 'hidden' }}>
      <Img
        src={staticFile(`shots/${ad}.png`)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transformOrigin: `${odak[0]}% ${odak[1]}%`,
          transform: `scale(${s})`,
          imageRendering: 'pixelated',
        }}
      />
    </AbsoluteFill>
  );
};
