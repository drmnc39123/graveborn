// GRAVEBORN — TANITIM VİDEOSU.
//
// 🔴 GÖRÜNTÜNÜN TAMAMI GERÇEK OYUN. Dövüş planları oyunun motorundan
// yakalandı (`tools/capture.mjs` → `/capture` sayfası), panel görüntüleri
// oyunun kendi ekranlarının fotoğrafı (`tools/shots.mjs`). Videoya özel
// çizilmiş tek bir oyun görseli yok — yalnız yazı, çerçeve ve geçişler bu
// dosyada üretiliyor.
//
// ⚠️ SAYILAR UYDURULMADI. Ekranda geçen her sayı `tools/counts.mts`
// çıktısından: 25 bölüm · 10 silah · 17 pasif · 10 evrim · 21 düşman türü ·
// 4 kahraman · 12 pet · 14 kalıcı yükseltme · 20 düğümlü ağaç (56 puan).
// İlk turda bu sayılar `grep` ile tahmin edilmişti ve ÜÇ-ALTI KAT şişikti;
// yayınlanmış bir videodaki yanlış sayı geri alınamaz.
//
// ⚠️ TOKEN İDDİALARI SİTEDEKİYLE AYNI: $GRAVE HENÜZ ÇIKMADI, sözleşme
// adresi YOK, betada kazanılan her şey lansmanda SİLİNİYOR. Ana sayfa bunu
// zaten böyle yazıyor; video daha iddialı konuşamaz.
//
// ⚠️ MOR YOK · oyuncu metni İNGİLİZCE · yorumlar Türkçe.

import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { FONT_CSS } from './font';
import { C, FONT } from './theme';
import { Panel, Plan } from './parts/Shot';
import {
  Bant, Flas, Karart, Koseler, Kunye, Perde, Tane, Tarama, Vinyet,
} from './parts/Overlay';
import { Etiket, Maddeler, Soz } from './parts/Text';
import { Kapanis, Logo } from './parts/Title';

/** Yakalanan planların kare sayıları — `public/frames/<ad>/` ile birebir. */
const KARE = {
  fight_open: 120, fight_horde: 130, fight_deep: 120,
  hero_ranger: 100, hero_priestess: 100, hero_knight: 100,
  boss_a: 150, boss_b: 130, descent: 130,
  village_a: 170, village_b: 150,
} as const;

/**
 * SAHNE TABLOSU — videonun kurgusu tek yerde.
 *
 * ⚠️ SÜRELER KISA TUTULDU (kullanıcı isteği: *"her sahneyi uzun
 * tutmayalım"*). Panel planları 2 saniyenin altında; bir panelde 2
 * saniyeden fazla durmak, izleyicinin okumaya çalışıp okuyamadığı ölü bir
 * zaman üretiyor. Okunacak şey ETİKETTE, panel onun kanıtı.
 */
type Sahne = { ad: string; sure: number; ic: React.FC };

// ── Ortak katman yığını ───────────────────────────────────────────────
// ⚠️ SIRA ÖNEMLİ: görüntü → vinyet → tarama → tane → bant → köşe → künye.
// Bant en üstte olmalı, yoksa tane ve tarama siyah bandın üstüne de
// düşüyor ve bant "kirli" görünüyor.
const Kaplama: React.FC<{
  kunye?: boolean; koseler?: boolean; vinyet?: number; perde?: boolean;
}> = ({ kunye = true, koseler = true, vinyet = 0.72, perde = false }) => (
  <>
    {/* ⚠️ Perde VİNYETTEN ÖNCE: vinyet köşeleri karartıyor, perde alt
        şeridi — ikisi üst üste binerse alt köşeler simsiyah oluyor. */}
    {perde ? <Perde /> : null}
    <Vinyet guc={vinyet} />
    <Tarama />
    <Tane />
    <Bant />
    {koseler ? <Koseler opaklik={0.42} /> : null}
    {kunye ? <Kunye /> : null}
  </>
);

/** Tek kelimelik açılış vuruşu. */
const Vurus: React.FC<{ metin: string; renk?: string }> = ({ metin, renk = C.bone }) => {
  const f = useCurrentFrame();
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'grid', placeItems: 'center',
    }}>
      <div style={{
        fontFamily: FONT, fontSize: 92, color: renk, letterSpacing: 12,
        textShadow: '0 5px 0 rgba(0,0,0,0.9), 0 0 50px rgba(0,0,0,0.85)',
        // ⚠️ Hafif bir büyüme: sabit duran bir kelime, hızlı kesmede
        // "donmuş kare" gibi okunuyor.
        transform: `scale(${1 + f * 0.0016})`,
      }}>{metin}</div>
    </div>
  );
};

/** Panel planı — fotoğraf + etiket + kaplama, tek satırda kurulan kalıp. */
function panelSahne(
  ad: string, dosya: string, ust: string, ana: string, alt: string,
  sure: number, odak: [number, number] = [50, 34], renk: string = C.candle,
): Sahne {
  return {
    ad,
    sure,
    ic: () => (
      <AbsoluteFill>
        <Panel ad={dosya} odak={odak} sure={sure} zoom={[1.2, 1.36]} />
        {/* ⚠️ Panel fotoğrafları PARLAK; etiketin arkasına ek karartma
            koymadan yazı okunmuyordu (ölçüldü: Forge kartlarının üstünde
            kemik rengi metin kayboluyor). */}
        <AbsoluteFill style={{
          background: 'linear-gradient(0deg, rgba(10,8,6,0.94) 0%, rgba(10,8,6,0.55) 26%, rgba(10,8,6,0) 52%)',
        }} />
        <Etiket ust={ust} ana={ana} alt={alt} renk={renk} />
        <Kaplama perde />
        <Flas renk={C.bone} kare={2} />
      </AbsoluteFill>
    ),
  };
}

const SAHNELER: Sahne[] = [
  // ══ 1 · AÇILIŞ ═════════════════════════════════════════════════════
  {
    ad: 'vurus1', sure: 26,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="fight_deep" adet={KARE.fight_deep} bas={40} parlaklik={0.55} />
        <Vurus metin="EVERY RUN ENDS." />
        <Kaplama kunye={false} koseler={false} />
        <Karart sure={26} ac kare={8} />
      </AbsoluteFill>
    ),
  },
  {
    ad: 'vurus2', sure: 26,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="boss_a" adet={KARE.boss_a} bas={38} parlaklik={0.55} />
        <Vurus metin="YOU DO NOT." renk={C.bloodSoft} />
        <Kaplama kunye={false} koseler={false} />
        <Flas renk={C.blood} kare={4} />
      </AbsoluteFill>
    ),
  },
  {
    ad: 'vurus3', sure: 30,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="fight_horde" adet={KARE.fight_horde} bas={70} parlaklik={0.6} />
        <Vurus metin="RISE AGAIN." renk={C.candle} />
        <Kaplama kunye={false} koseler={false} />
        <Flas renk={C.bone} kare={3} />
      </AbsoluteFill>
    ),
  },

  // ══ 2 · BAŞLIK ═════════════════════════════════════════════════════
  {
    ad: 'baslik', sure: 84,
    ic: () => (
      <AbsoluteFill style={{ backgroundColor: C.void }}>
        <Plan sahne="boss_b" adet={KARE.boss_b} bas={20} parlaklik={0.28} doygunluk={0.7} />
        <Logo />
        <Vinyet guc={0.9} />
        <Tarama />
        <Tane guc={0.045} />
        <Bant />
        <Flas renk={C.bone} kare={5} />
      </AbsoluteFill>
    ),
  },

  // ══ 3 · KOŞU ═══════════════════════════════════════════════════════
  {
    ad: 'kosu', sure: 112,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="fight_open" adet={KARE.fight_open} zoom={[1.02, 1.12]} />
        <Etiket
          ust="THE RUN"
          ana="One hunter. Everything else is dead."
          alt="You only move. The weapons swing on their own — and the dead never stop coming."
        />
        <Maddeler satirlar={['21 KINDS OF DEAD', '25 STAGES', 'RUNS IN YOUR BROWSER']} />
        <Kaplama perde />
        <Flas kare={3} />
      </AbsoluteFill>
    ),
  },

  // ══ 4 · BUILD ══════════════════════════════════════════════════════
  {
    ad: 'build', sure: 104,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="fight_horde" adet={KARE.fight_horde} zoom={[1.1, 1.0]} />
        <Etiket
          ust="THE BUILD"
          ana="Six weapons. Then evolve them."
          alt="Level up mid-run and draft what you become. Feed a weapon the right passive and it turns into something else."
          renk={C.bloodSoft}
        />
        <Maddeler satirlar={['10 WEAPONS', '17 PASSIVES', '10 EVOLUTIONS']} renk={C.bloodSoft} />
        <Kaplama perde />
        <Flas kare={3} />
      </AbsoluteFill>
    ),
  },

  // ══ 5 · KAHRAMANLAR ════════════════════════════════════════════════
  {
    ad: 'kahraman1', sure: 52,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="hero_knight" adet={KARE.hero_knight} zoom={[1.16, 1.06]} />
        <Etiket ust="HERO 1 / 4" ana="Fire Knight" konum="ustSol" />
        <Kaplama perde />
        <Flas kare={2} />
      </AbsoluteFill>
    ),
  },
  {
    ad: 'kahraman2', sure: 52,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="hero_ranger" adet={KARE.hero_ranger} zoom={[1.16, 1.06]} />
        <Etiket ust="HERO 2 / 4" ana="Leaf Ranger" konum="ustSol" renk={C.ok} />
        <Kaplama perde />
        <Flas kare={2} />
      </AbsoluteFill>
    ),
  },
  {
    ad: 'kahraman3', sure: 52,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="hero_priestess" adet={KARE.hero_priestess} zoom={[1.16, 1.06]} />
        <Etiket ust="HERO 3 / 4" ana="Water Priestess" konum="ustSol" renk={C.ice} />
        <Kaplama perde />
        <Flas kare={2} />
      </AbsoluteFill>
    ),
  },
  {
    ad: 'kahraman4', sure: 56,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="fight_deep" adet={KARE.fight_deep} zoom={[1.16, 1.06]} />
        <Etiket
          ust="HERO 4 / 4" ana="Metal Bladekeeper" konum="ustSol"
          alt="Three of the four are locked. You do not buy them — you play them open."
        />
        <Kaplama perde />
        <Flas kare={2} />
      </AbsoluteFill>
    ),
  },

  // ══ 6 · BOSS ═══════════════════════════════════════════════════════
  {
    ad: 'boss', sure: 122,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="boss_a" adet={KARE.boss_a} zoom={[1.04, 1.14]} />
        <Etiket
          ust="WHAT WAITS AT THE END"
          ana="They have names."
          alt="Almost every stage ends with one. It telegraphs, it enrages at half health, and it drops what you came down for."
          renk={C.bloodSoft}
        />
        <Kaplama perde />
        <Flas renk={C.blood} kare={4} />
      </AbsoluteFill>
    ),
  },

  // ══ 7 · DESCENT ════════════════════════════════════════════════════
  {
    ad: 'descent', sure: 118,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="descent" adet={KARE.descent} zoom={[1.02, 1.13]} />
        <Etiket
          ust="THE DESCENT"
          ana="The stairs do not end."
          alt="Clear a depth and you fall straight into the next one, carrying the health you have left. How deep you get is how well you played."
        />
        <Kaplama perde />
        <Flas kare={3} />
      </AbsoluteFill>
    ),
  },

  // ══ 8 · SÖZ ════════════════════════════════════════════════════════
  {
    ad: 'soz1', sure: 84,
    ic: () => (
      <AbsoluteFill style={{ backgroundColor: C.void }}>
        <Plan sahne="fight_deep" adet={KARE.fight_deep} bas={30} parlaklik={0.24} doygunluk={0.55} />
        <Soz
          ust="AND THEN YOU COME BACK UP"
          satirlar={['Every run pays.', 'Even the ones you lose.']}
        />
        <Vinyet guc={0.9} />
        <Tarama /><Tane guc={0.04} /><Bant />
      </AbsoluteFill>
    ),
  },

  // ══ 9 · KÖY ════════════════════════════════════════════════════════
  {
    ad: 'koy', sure: 118,
    ic: () => (
      <AbsoluteFill>
        <Plan sahne="village_a" adet={KARE.village_a} zoom={[1.0, 1.08]} />
        <Etiket
          ust="THE VILLAGE"
          ana="Somewhere to spend it."
          alt="A live square you walk through with everyone else who is online. Seventeen doors, and you walk to every one of them."
        />
        <Kaplama perde />
        <Flas kare={3} />
      </AbsoluteFill>
    ),
  },

  // ══ 10 · KAPILAR ═══════════════════════════════════════════════════
  /**
   * 🔴 ANA SATIRLAR PANELİN KENDİ BAŞLIĞINI ARTIK TEKRAR ETMİYOR — ÖLÇÜLDÜ.
   * İlk sürümde etiket, ekrandaki panelin başlığıyla BİREBİR aynıydı ve
   * kare 1070'te "Permanent power" aynı karede İKİ KEZ görünüyordu. Panel
   * kendi adını zaten söylüyor; etiketin işi adı tekrarlamak değil, o
   * ekranın İDDİASINI söylemek. Alanın adı küçük üst satırda duruyor —
   * kullanıcının istediği "her yeri tanıtalım" tam olarak orada karşılanıyor.
   */
  panelSahne('forge', 'upgrade', 'THE FORGE', '14 upgrades that never reset.',
    'Bought once, kept forever. Every run after this one starts stronger — even the ones you lose.', 58),
  panelSahne('paths', 'paths', 'YOUR PATHS', 'The tree costs 56. You get 24.',
    'Twenty nodes, four branches, and every fork closes the other. Points come from depth — they are never bought.', 58, [50, 32], C.bloodSoft),
  panelSahne('binding', 'pets', 'THE BINDING', 'Kill enough of a thing and it follows you.',
    'Twelve bound creatures fight beside you. Gold is only half the price — the other half is proof of the kill.', 60),
  panelSahne('gear', 'gear', 'YOUR GEAR', 'Read both columns.',
    'Loot pulled out of the deep. Past the second tier, every good roll arrives carrying a bad one.', 58, [50, 34], C.ice),
  panelSahne('reliquary', 'reliquary', 'THE RELIQUARY', 'Gold in. Strange things out.',
    'Charms, cosmetics and dust — pulled, never bought outright.', 54),
  panelSahne('market', 'market', 'MARKET HALL', 'A real order book.',
    'Players list gold and players buy it. The game itself never mints a single token.', 60, [50, 34], C.candleSoft),
  panelSahne('guild', 'guild', 'THE GUILDS', 'Go down together.',
    'Found one, join one, and carry the tag wherever your name shows up.', 54, [50, 32], C.ok),
  panelSahne('boss', 'boss', 'THE WEEKLY BOSS', 'One health bar. Whole server.',
    'Everyone hits the same thing all week long. Your damage is your rank.', 58, [50, 34], C.bloodSoft),
  panelSahne('duel', 'duel', 'THE ANSWERING', 'Beat their best run.',
    'Asynchronous duels on the same seed — you fight the record, not the person.', 56, [50, 34], C.ice),
  {
    ad: 'pit', sure: 74,
    ic: () => (
      <AbsoluteFill>
        <Panel ad="pit" odak={[50, 45]} sure={74} zoom={[1.2, 1.44]} />
        <AbsoluteFill style={{
          background: 'linear-gradient(0deg, rgba(10,8,6,0.94) 0%, rgba(10,8,6,0.5) 28%, rgba(10,8,6,0) 54%)',
        }} />
        <Etiket
          ust="THE PIT  ·  LIVE 1V1"
          ana="Two hunters. One horde."
          alt="Real time, same arena, same waves. You cannot hurt each other — the last one standing wins."
          renk={C.bloodSoft}
        />
        <Kaplama perde />
        <Flas renk={C.blood} kare={3} />
      </AbsoluteFill>
    ),
  },

  // ══ 11 · GERİ KALANI ═══════════════════════════════════════════════
  {
    ad: 'dortlu', sure: 104,
    ic: () => {
      /**
       * ⚠️ ALTI KUTU, DÖRT DEĞİL. Kullanıcının isteği *"aklına ne gelirse
       * her yeri güzel bir şekilde tanıtalım"*: köyde on yedi kapı var,
       * onunu tek tek gösterip kalanları hiç göstermemek eksik kalıyordu.
       * Bunlar ayrı bir plan hak etmiyor ama VAR OLDUKLARI görünmeli —
       * ızgara tam olarak bunun için.
       */
      const kutular: [string, string][] = [
        ['tavern', 'THE REST · RECORDS'],
        ['shop', "PEDLAR'S STALL"],
        ['codex', 'THE CODEX'],
        ['daily', 'DAILY QUESTS'],
        ['watch', 'THE WATCH'],
        ['vigil', 'THE VIGIL'],
      ];
      return (
        <AbsoluteFill style={{ backgroundColor: C.void }}>
          <div style={{
            position: 'absolute', inset: 0, padding: '150px 88px 86px',
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 18,
          }}>
            {kutular.map(([dosya, ad], i) => (
              <Sequence key={dosya} from={i * 6} durationInFrames={104 - i * 6} layout="none">
                <div style={{
                  position: 'relative', overflow: 'hidden',
                  border: `2px solid ${C.border}`,
                }}>
                  <Panel ad={dosya} odak={[50, 32]} sure={104} zoom={[1.3, 1.42]} />
                  <div style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    padding: '42px 14px 12px',
                    background: 'linear-gradient(0deg, rgba(10,8,6,0.95), rgba(10,8,6,0))',
                    fontFamily: FONT, fontSize: 19, letterSpacing: 3, color: C.bone,
                  }}>{ad}</div>
                </div>
              </Sequence>
            ))}
          </div>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 104, textAlign: 'center',
            fontFamily: FONT, fontSize: 24, letterSpacing: 8, color: C.candle,
          }}>AND EVERY OTHER DOOR ON THE SQUARE</div>
          <Vinyet guc={0.6} /><Tarama /><Tane /><Bant />
          <Flas kare={3} />
        </AbsoluteFill>
      );
    },
  },

  // ══ 12 · BETA ══════════════════════════════════════════════════════
  {
    ad: 'beta', sure: 122,
    ic: () => (
      <AbsoluteFill style={{ backgroundColor: C.void }}>
        <Plan sahne="village_b" adet={KARE.village_b} bas={100} hiz={0.4} parlaklik={0.3} doygunluk={0.6} zoom={[1.06, 1.14]} />
        <Soz
          ust="RIGHT NOW"
          satirlar={['OPEN BETA', 'IS LIVE.']}
          alt="Connect a Solana wallet and play — or try the demo with no wallet at all. Free, in the browser, on desktop and phone."
          renk={C.candle}
        />
        <Vinyet guc={0.9} /><Tarama /><Tane guc={0.04} /><Bant />
        <Flas renk={C.bone} kare={4} />
      </AbsoluteFill>
    ),
  },

  // ══ 13 · TOKEN ═════════════════════════════════════════════════════
  {
    ad: 'token', sure: 152,
    ic: () => {
      const f = useCurrentFrame();
      return (
        <AbsoluteFill style={{ backgroundColor: C.void }}>
          <Plan sahne="boss_b" adet={KARE.boss_b} hiz={0.8} parlaklik={0.22} doygunluk={0.5} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 0,
          }}>
            <div style={{
              fontFamily: FONT, fontSize: 23, letterSpacing: 10, color: C.candle,
              opacity: Math.min(1, f / 12),
            }}>NEXT</div>
            <div style={{
              fontFamily: FONT, fontSize: 138, color: C.bone, letterSpacing: 8,
              marginTop: 18, textShadow: '0 5px 0 rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.85)',
              opacity: Math.min(1, Math.max(0, (f - 6) / 12)),
            }}>$GRAVE</div>
            <div style={{
              fontFamily: FONT, fontSize: 40, color: C.candleSoft, letterSpacing: 5, marginTop: 20,
              opacity: Math.min(1, Math.max(0, (f - 20) / 14)),
            }}>TOKEN LAUNCH  ·  SOLANA MAINNET</div>

            {/* 🔴 DÜRÜSTLÜK SATIRLARI. Ana sayfa bunları zaten yazıyor;
                video daha iddialı konuşamaz. Bir tanıtım videosunda
                söylenmeyen bir koşul, lansman günü şikâyet olarak geri
                geliyor. */}
            <div style={{
              display: 'flex', gap: 44, marginTop: 54,
              opacity: Math.min(1, Math.max(0, (f - 38) / 16)),
            }}>
              {['THE GAME NEVER MINTS', 'NO STAKING, NO REWARD POOL', 'PLAYER TO PLAYER ONLY'].map((s) => (
                <div key={s} style={{
                  fontFamily: FONT, fontSize: 21, letterSpacing: 2.5, color: C.boneDim,
                  border: '1px solid rgba(227,216,192,0.18)', padding: '12px 18px',
                }}>{s}</div>
              ))}
            </div>

            <div style={{
              fontFamily: FONT, fontSize: 22, color: C.bloodSoft, letterSpacing: 2.4,
              marginTop: 46, textAlign: 'center', lineHeight: 1.6,
              opacity: Math.min(1, Math.max(0, (f - 58) / 16)),
            }}>
              $GRAVE HAS NOT LAUNCHED — THERE IS NO CONTRACT ADDRESS YET.<br />
              <span style={{ color: C.boneFaint }}>
                EVERYTHING EARNED IN BETA IS WIPED WHEN IT DOES. PLAY FOR THE GAME.
              </span>
            </div>
          </div>
          <Vinyet guc={0.92} /><Tarama /><Tane guc={0.04} /><Bant />
          <Flas renk={C.candle} kare={4} />
        </AbsoluteFill>
      );
    },
  },

  // ══ 14 · KAPANIŞ ═══════════════════════════════════════════════════
  {
    // ⚠️ 142 KARE, 158 DEĞİL: ızgaraya iki kutu eklenince toplam 16 kare
    // uzadı ve müzik parçası (71,53 sn) videodan kısa kaldı — sonda yarım
    // saniye sessizlik oluyordu. Kapanış o kadar kısaltıldı, toplam yine
    // 2146 kare = 71,53 sn.
    ad: 'kapanis', sure: 142,
    ic: () => (
      <AbsoluteFill style={{ backgroundColor: C.void }}>
        <Plan sahne="village_a" adet={KARE.village_a} bas={25} parlaklik={0.2} doygunluk={0.5} zoom={[1.1, 1.16]} />
        <Kapanis />
        <Vinyet guc={0.95} /><Tarama /><Tane guc={0.035} /><Bant />
        <Koseler opaklik={0.3} />
        <Karart sure={142} ac={false} kare={26} />
      </AbsoluteFill>
    ),
  },
];

/** Toplam süre — tabloyu değiştirince kendiliğinden güncelleniyor. */
export const TOPLAM = SAHNELER.reduce((a, s) => a + s.sure, 0);

export const Trailer: React.FC = () => {
  let t = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: C.void }}>
      {/* Font gomulu data URI olarak veriliyor — bkz. font.ts basligi. */}
      <style>{FONT_CSS}</style>
      {/*
        🔴 MÜZİK DE OYUNUN KENDİSİ. "game/music.ts" prosedürel (dosyasız,
        re minör, sahneye göre katman açan) ve bu parça onun GERÇEK ZAMANDA
        kaydedilmiş hâli — "node tools/capture.mjs music". Dışarıdan lisanslı
        bir parça koymak hem lisans yükü hem de oyunun sesini duyurmamak
        olurdu.
        ⚠️ Ses "ffmpeg loudnorm" ile -15 LUFS'a çekildi: oyunun kendi
        seviyesi -44 dB ortalama, yani videoda pratikte SESSİZ duyuluyordu
        (ölçüldü). Oyunun içindeki seviye doğru, videodaki değil.
        ⚠️ Uzunluk videoyla BİREBİR (71,53 sn) ve son 2 saniyede kısılıyor.
      */}
      <Audio src={staticFile('audio/music.wav')} />
      {SAHNELER.map((s) => {
        const from = t;
        t += s.sure;
        return (
          <Sequence key={s.ad} from={from} durationInFrames={s.sure} name={s.ad}>
            <s.ic />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
