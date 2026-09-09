// KOMPOZİSYON.
//
// ⚠️ TEK ORAN: 1920×1080. X zaman akışında 16:9 hem masaüstünde hem
// telefonda kırpılmadan oynuyor.
//
// ⚠️ DİKEY SÜRÜM BİLEREK YAPILMADI. Aynı kurguyu 9:16'ya sığdırmanın tek
// ucuz yolu videoyu bantlar arasına küçültmek; o da "ultra prof" değil,
// "yeniden paylaşılmış" görünür. Dikey gerçekten istenirse ayrı bir kurgu
// gerekir (etiketler ortada, planlar dikey kırpılmış) — yarım bir dikey
// sürüm koymaktansa hiç koymamak doğru.

import { Composition } from 'remotion';
import { TOPLAM, Trailer } from './Trailer';
import { FPS, H, W } from './theme';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Trailer"
    component={Trailer}
    durationInFrames={TOPLAM}
    fps={FPS}
    width={W}
    height={H}
  />
);
