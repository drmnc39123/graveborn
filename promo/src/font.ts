// FONT — oyunun kendi Pixellari'si, PAKETE GÖMÜLÜ ve `<style>` ile veriliyor.
//
// 🔴 BURADA `delayRender` YOK, VE BU İKİ ÖLÇÜMDEN SONRA BÖYLE.
//
// (1) Font `staticFile` ile ağdan isteniyordu → tam tur render KARE 239'da
//     düştü: *"delayRender() 28000ms sonra temizlenmedi"*. Remotion kareleri
//     işçi sekmelerinde çiziyor; o sekmeler aynı anda yüzlerce MB kare
//     görseli indirirken 39 KB'lık font isteği kuyrukta asılı kaldı.
//
// (2) Fontu gömdüm (ağ isteği sıfır) ve `delayRender`e beş saniyelik bir
//     EMNİYET SAATİ koydum. Yine düştü — bu sefer KARE 505'te, 58 saniye
//     sonra. Yani `setTimeout` bile ateşlenmemişti: işçi sekmesi o anda
//     donmuş durumdaydı. Ders: bir bekleme kilidini emniyet saatiyle
//     kurtarmak, sekmenin kendisi durunca işe yaramıyor.
//
// Kalan doğru çözüm en basiti: BEKLEME YOK. Font bir `data:` URI ve
// `<style>` etiketiyle veriliyor — ağ isteği olmadığı için tarayıcı onu
// stil sayfasını ayrıştırırken çözüyor, beklenecek bir şey kalmıyor.
//
// ⚠️ Dosya `frontend/public/fonts/Pixellari.ttf` ile AYNI: oyunun yazısıyla
// videonun yazısı aynı harfler olmak zorunda.

import { PIXELLARI_DATA } from './pixellari';

export const FONT_CSS = `
@font-face {
  font-family: 'Pixellari';
  src: url(${PIXELLARI_DATA}) format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}
`;
