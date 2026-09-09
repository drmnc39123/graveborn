// REMOTION AYARLARI.
//
// ⚠️ `setChromiumDisableWebSecurity` YOK ve gerekmiyor: her şey `staticFile`
// üzerinden aynı origin'den geliyor, dışarıdan tek istek atılmıyor
// (font dâhil — `public/fonts/Pixellari.ttf` repoda).
//
// ⚠️ ÖLÇEK 1: kareler zaten 1920×1080 yakalandı. Remotion'un kendi
// ölçeklemesini açmak piksel sanatı ikinci kez yeniden örnekler.

import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
/**
 * ⚠️ CRF 17 — X yeniden kodluyor, o yüzden KAYNAK KALİTESİ YÜKSEK OLMALI.
 * Varsayılan (23) piksel sanatın keskin kenarlarında blok üretiyor ve X'in
 * ikinci kodlaması onu iyice bozuyor: elimizdeki tek kontrol, servise
 * verdiğimiz dosyanın temizliği.
 */
Config.setCrf(17);
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
