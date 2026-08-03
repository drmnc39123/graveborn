'use client';
// Oyun kabuğu: HUB ⇄ BÖLÜM.
// Hub'da gezersin, Warden's Post'tan bölüm seçersin, bölüm biter/ölürsün,
// gold TAVANA GÖRE cüzdana yazılır ve hub'a dönersin.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HubCanvas } from '@/components/HubCanvas';
import { GameCanvas } from '@/components/GameCanvas';
import { ForgePanel } from '@/components/ForgePanel';
import { RecordsPanel } from '@/components/RecordsPanel';
import { MarketPanel } from '@/components/MarketPanel';
import { HeroPicker } from '@/components/HeroPicker';
import { BuildingDock } from '@/components/BuildingDock';
import { Panel, PixelButton } from '@/components/ui/kit';
import { Card, Pips, Tag, prettyId } from '@/components/ui/cards';
import { permanentBonus } from '@/game/forge';
import { STAGES, challengeRating, depthGold, stageById } from '@/game/config';
import { loadProgress, paidDepth, type Progress, type RunResult } from '@/game/progress';
import type { RunMode } from '@/game/engine';
import type { BuildingId } from '@/game/hub';
import { C, glass, ctaButton } from '@/lib/theme';
import { getMode, getWallet } from '@/lib/session';
import {
  buyUpgrade, finishRun as settleRun, loadSessionProgress, setHero as saveHero,
  startRun, type RunTicket,
} from '@/lib/gameSession';

type Screen = { kind: 'hub' } | { kind: 'stage'; stageId: number; mode: RunMode; ticket: RunTicket };

/** Koşu sonu bildirimi — ödülün nereden geldiği oyuncuya AÇIKÇA gösterilir */
type Payout = {
  mode: RunMode;
  /** bu koşuda temizlenen en derin seviye — "hiç inemedin" ile "buraya zaten
   *  inmiştin" ayrımı için gerekli; ikisi de 0 öder ama sebepleri farklı */
  deepestCleared: number;
  progressGold: number;
  dropGold: number;
  paidRange: { from: number; to: number } | null;
};

export default function PlayPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ kind: 'hub' });
  const [panel, setPanel] = useState<BuildingId | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // ⚠️ Doğrudan `getWallet()` ÇAĞIRMA. localStorage okur; sunucuda null döner,
  // istemcide adres döner ve navbar rozeti "DEMO" ↔ adres arasında uyuşmazlığa
  // düşerek hidrasyonu bozar (React tüm ağacı istemci içeriğiyle değiştirir).
  // Mount'tan SONRA okunmalı.
  const [wallet, setWallet] = useState<string | null>(null);

  // Mod seçilmemişse kapıya geri gönder — hangi kayda oynadığını bilmeden
  // oyuna girmek, sonradan "ilerlemem nerede?" demek olurdu.
  useEffect(() => {
    if (getMode() === null) { router.replace('/'); return; }
    setWallet(getWallet());
    loadSessionProgress()
      .then(setProgress)
      .catch(() => {
        // Cüzdan modunda sunucuya ulaşılamıyorsa YEREL kayda DÜŞMEYİZ:
        // iki kayıt birbirine karışır ve hangisinin doğru olduğu belirsizleşir.
        setNote('Sunucuya ulaşılamadı — ilerlemen yüklenemedi.');
      });
  }, [router]);

  const onEnter = useCallback((id: BuildingId) => setPanel(id), []);

  /** Karakter seçimi kalıcı — her koşuda yeniden seçtirmek gereksiz sürtünme */
  const pickHero = useCallback((hero: string) => {
    setProgress((prev) => {
      if (!prev) return prev;
      saveHero(hero, prev).then(setProgress).catch(() => setNote('Karakter kaydedilemedi.'));
      return { ...prev, hero };            // arayüz beklemesin, iyimser güncelle
    });
  }, []);

  /** Koşu bitti — ödülü demo'da progress.ts, cüzdanda SUNUCU hesaplar */
  const finishRun = useCallback((run: RunResult) => {
    const ticket = screen.kind === 'stage' ? screen.ticket : null;
    setScreen({ kind: 'hub' });
    const base = progress ?? loadProgress();
    settleRun(ticket, run, base)
      .then((r) => {
        setProgress(r.progress);
        setPayout({
          mode: run.mode, deepestCleared: run.deepestCleared,
          progressGold: r.progressGold, dropGold: r.dropGold, paidRange: r.paidRange,
        });
      })
      .catch(() => setNote('Koşu kaydedilemedi — ödül işlenmedi.'));
  }, [screen, progress]);

  /** Bölüm başlat: cüzdan modunda seed'i ve koşu kimliğini SUNUCU verir */
  const beginStage = useCallback((stageId: number, mode: RunMode) => {
    setPanel(null);
    startRun(mode, stageId)
      .then((ticket) => setScreen({ kind: 'stage', stageId, mode, ticket }))
      .catch(() => setNote('Koşu başlatılamadı.'));
  }, []);

  // GELİŞTİRME KANCASI — üretimde YOK.
  // Hub'da gezmek requestAnimationFrame'e bağlı; otomatik doğrulamada tarayıcı
  // paneli görünmediğinde rAF donuyor ve hiçbir panele yürüyerek ulaşılamıyor.
  // Bu kanca panelleri doğrudan açar: /play?panel=quests  ·  window.__gb.panel('quests')
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as { __gb?: unknown };
    w.__gb = { panel: setPanel, finish: finishRun, screen: setScreen };
    const q = new URLSearchParams(window.location.search).get('panel');
    if (q) setPanel(q);
    return () => { delete w.__gb; };
  }, [finishRun]);

  if (screen.kind === 'stage') {
    const def = stageById(screen.stageId)!;
    const p = progress ?? loadProgress();
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <GameCanvas
          stage={def}
          mode={screen.mode}
          hero={p.hero}
          seed={screen.ticket.seed}
          permanent={permanentBonus(p.upgrades)}
          onFinish={finishRun}
        />
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <HubCanvas
        onEnterBuilding={onEnter}
        // Dövüş portalı doğrudan bölüm BAŞLATMAZ, seçim panelini açar.
        // (HubCanvas burada os(0) çağırıyordu; stageById(0) undefined olduğu
        //  için portala basmak sayfayı çökertiyordu.)
        onEnterStage={() => setPanel('quests')}
      />

      {/* Cüzdan + bina rıhtımı — yürümek seçenek, zorunluluk değil */}
      <BuildingDock open={panel} onOpen={setPanel} gold={progress?.gold ?? 0} wallet={wallet} />

      {/* Sunucu hatası oyuncudan GİZLENMEZ: cüzdan modunda ilerleme sunucuda,
          sessizce yerel kayda düşmek iki gerçeklik yaratırdı. */}
      {note && (
        <div onClick={() => setNote(null)}
          style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 7, ...glass(10), padding: '10px 16px', cursor: 'pointer',
            fontSize: 12, color: C.bad, maxWidth: 'min(92vw, 420px)', textAlign: 'center' }}>
          {note}
        </div>
      )}

      {/* Koşu sonu ödül dökümü — ödülün NEREDEN geldiği görünür olmalı,
          yoksa "tekrar oynadım ama gold gelmedi" haklı şikâyeti doğar */}
      {payout && (
        <div onClick={() => setPayout(null)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '78px 20px 20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass(16), padding: 24, width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 6 }}>THE VILLAGE SETTLES UP</div>
            <div style={{ fontSize: 38, fontWeight: 900, color: C.candle, marginBottom: 14 }}>
              +{payout.progressGold + payout.dropGold} <span style={{ fontSize: 16 }}>GOLD</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, textAlign: 'left' }}>
              <Row
                label={payout.paidRange
                  ? `New depths ${payout.paidRange.from + 1}–${payout.paidRange.to}`
                  : payout.mode === 'descent'
                    ? (payout.deepestCleared === 0 ? 'No depth cleared' : 'No new depths')
                    : 'First clear'}
                value={payout.progressGold}
                hint={payout.progressGold > 0 ? undefined
                  : payout.mode === 'descent'
                    ? (payout.deepestCleared === 0
                        ? 'you left before clearing depth 1'
                        : 'you have been this deep before — go deeper')
                    : 'already claimed — replay pays nothing'}
              />
              <Row label="Rare finds" value={payout.dropGold} hint={payout.dropGold === 0 ? 'nothing dropped this run' : undefined} />
            </div>
            <button onClick={() => setPayout(null)}
              style={{ ...ctaButton(true), marginTop: 18, width: '100%' }}>Continue</button>
          </div>
        </div>
      )}

      {panel && (
        <div onClick={() => setPanel(null)}
          style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(10,8,6,0.84)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '78px 20px 20px' }}>
          <Panel variant="07A" scale={3} pad={6} onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: '84vh', overflowY: 'auto' }}>
            {/* Panel içinde ikinci bir bina sırası YOK — navbar panelin üstünde
                (zIndex 6) ve açıkken de tıklanabilir kalıyor. İki sıra hem
                gereksizdi hem panelin içinde sarıp dağınık duruyordu. */}
            {panel === 'quests' ? (
              <StageSelect
                progress={progress}
                onHero={pickHero}
                onPick={beginStage}
              />
            ) : panel === 'upgrade' ? (
              <ForgePanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : panel === 'tavern' ? (
              <RecordsPanel progress={progress ?? loadProgress()} />
            ) : panel === 'market' ? (
              <MarketPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
              />
            ) : (
              <ComingSoon id={panel} />
            )}

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <PixelButton variant="02A" scale={2} onClick={() => setPanel(null)}
                style={{ width: '100%', fontSize: 12, fontWeight: 900, letterSpacing: 1.5 }}>
                CLOSE
              </PixelButton>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div style={{ ...glass(9), padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', color: C.bone, fontWeight: 800 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11, color: C.boneFaint, marginTop: 1 }}>{hint}</span>}
      </span>
      <span style={{ flexShrink: 0, fontWeight: 900, fontSize: 15, color: value > 0 ? C.candle : C.boneFaint }}>
        +{value}
      </span>
    </div>
  );
}

function StageSelect({ progress, onPick, onHero }: {
  progress: Progress | null;
  onPick: (id: number, mode: RunMode) => void;
  onHero: (id: string) => void;
}) {
  const p = progress ?? loadProgress();
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>THE WARDEN&apos;S POST</div>
      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: C.bone }}>Choose your road</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        Clear a stage once for its reward. Then the Descent opens beneath it — an endless
        ladder where every new depth pays, and no depth pays twice.
      </p>

      <HeroPicker selected={p.hero} onSelect={onHero} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {STAGES.map((s) => {
          const locked = s.id > p.unlockedStage;
          const cleared = !!p.cleared[s.id];
          const claimed = !!p.firstClear[s.id];
          const best = paidDepth(p, s.id);
          return (
            <StageCard
              key={s.id} stage={s} locked={locked} cleared={cleared} claimed={claimed}
              bestDepth={best} onPick={onPick}
            />
          );
        })}
      </div>
    </>
  );
}

/**
 * BÖLÜM KARTI.
 *
 * ⚠️ Eskiden burada iki satır vardı: "1. The Hollow Wood / First clear pays
 * 300 gold" ve sağda "100 enemies". Oyuncu neye girdiğini bilmeden seçim
 * yapıyordu — hangi yaratıklar var, boss var mı, ne kadar sürer, bir sonraki
 * derinlik ne öder, hiçbiri yazmıyordu. Veri zaten `StageDef`'te duruyordu.
 */
function StageCard({ stage: s, locked, cleared, claimed, bestDepth, onPick }: {
  stage: (typeof STAGES)[number];
  locked: boolean;
  cleared: boolean;
  claimed: boolean;
  bestDepth: number;
  onPick: (id: number, mode: RunMode) => void;
}) {
  // Taban süre: düşmanlar spawn hızından çabuk sahneye çıkamaz, hepsi ölmeden
  // bölüm bitmez. Gerçek koşu bundan uzun sürer — "en az" diyoruz.
  const tabanSn = Math.round(s.enemyCount / s.spawnRate);
  // hpMul 1 → 14 aralığında; beş kademeye indiriyoruz
  const zorluk = Math.max(1, Math.min(5, Math.ceil(Math.log(s.hpMul) / Math.log(1.72) + 1)));
  const derinlikOdemesi = depthGold(s.id, bestDepth + 1);
  const derinlikZorlugu = challengeRating(s.id, bestDepth + 1) / Math.max(1, challengeRating(s.id, 1));

  return (
    <Card accent={cleared} dim={locked}>
      {/* ── Kampanya bacağı ── */}
      <button disabled={locked} onClick={() => onPick(s.id, 'campaign')}
        style={{ all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
          padding: '12px 13px', cursor: locked ? 'default' : 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {/* Bölüm numarası — sıralamayı bir bakışta okunur yapan çapa */}
          <span style={{
            flexShrink: 0, width: 26, height: 26, borderRadius: 6,
            display: 'grid', placeItems: 'center',
            fontSize: 12, fontWeight: 900,
            color: cleared ? C.candle : C.boneDim,
            background: cleared ? 'rgba(239,167,46,0.14)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${cleared ? `${C.candle}55` : 'rgba(255,255,255,0.10)'}`,
          }}>{s.id}</span>

          <span style={{ flex: 1, minWidth: 0, fontWeight: 900, fontSize: 15, color: C.bone }}>{s.name}</span>

          {locked ? <Tag>LOCKED</Tag>
            : cleared ? <Tag tone="gold">✓ CLEARED</Tag>
            : <Tag tone="blood">NEW</Tag>}
        </div>

        {locked ? (
          <div style={{ fontSize: 11.5, color: C.boneFaint, marginTop: 7 }}>
            Clear stage {s.id - 1} to unlock
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <Tag>{s.enemyCount} ENEMIES</Tag>
              {/* ⚠️ "≥" işareti bu punto'da rakam gibi okunuyordu ("≥1m 3s" ekranda
                  "21m 3s"). Kelimeyle yazmak tek çare. */}
              <Tag title="Enemies cannot spawn faster than this, so no run is shorter">
                MIN {tabanSn >= 60 ? `${Math.floor(tabanSn / 60)}m ${tabanSn % 60}s` : `${tabanSn}s`}
              </Tag>
              {s.boss && <Tag tone="blood">BOSS · {s.boss.label}</Tag>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, color: C.boneFaint }}>THREAT</span>
                <Pips value={zorluk} title={`Enemy health ×${s.hpMul.toFixed(1)}, speed ×${s.speedMul.toFixed(2)}`} />
              </span>
            </div>

            {/* Neyle karşılaşacağı — sürünün bileşimi seçimi etkiler */}
            <div style={{ fontSize: 11, color: C.boneDim, marginTop: 7, lineHeight: 1.45 }}>
              {s.enemies.map(prettyId).join(' · ')}
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: !claimed ? C.candle : C.boneFaint, marginTop: 7 }}>
              {!claimed
                ? `First clear pays ${s.firstClearGold.toLocaleString('en-US')} gold`
                : 'Reward claimed — replay pays nothing'}
            </div>
          </>
        )}
      </button>

      {/* ── Descent bacağı — bölüm bir kez temizlenince açılır ── */}
      {cleared && (
        <button onClick={() => onPick(s.id, 'descent')}
          style={{ all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '10px 13px 12px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(180deg, rgba(160,18,38,0.10), rgba(0,0,0,0.20))',
            cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, fontSize: 13, color: '#e4657a', letterSpacing: 0.5 }}>⛏ THE DESCENT</span>
            {bestDepth > 0
              ? <Tag tone="gold">BEST · DEPTH {bestDepth}</Tag>
              : <Tag>NEVER ENTERED</Tag>}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.boneFaint }}>
              endless · no depth pays twice
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.candle }}>
              Depth {bestDepth + 1} pays {derinlikOdemesi.toLocaleString('en-US')} gold
            </span>
            <Tag tone="blood" title="How much harder than depth 1">
              ×{derinlikZorlugu.toFixed(1)} HARDER
            </Tag>
          </div>
        </button>
      )}
    </Card>
  );
}

// Kapalı binalar. "Coming soon" tek başına oyuncuya hiçbir şey söylemiyordu;
// burada NE olacağı ve NİYE kapalı olduğu yazıyor.
// ⚠️ Hiçbir yerde "swap gold for $GRAVE" DEMİYORUZ: hazine sabit kurdan alım
// yaparsa oyun token BASMIŞ olur ve sıfır-emisyon sözü çöker. İkisi de P2P.
const LOCKED: Record<string, { kicker: string; title: string; body: string; bullets: string[]; gate: string }> = {
  shop: {
    kicker: "THE PEDLAR'S STALL", title: 'Shuttered',
    body: 'The pedlar deals in things you carry into a run — not permanent power. That is the Forge’s business.',
    bullets: [
      'Charms consumed on a single descent',
      'Bought with gold, spent whether you win or lose',
      'Deliberately weaker than Forge levels — convenience, not a shortcut',
    ],
    gate: 'Opens when run-consumables land.',
  },
  // ⚠️ `market` ARTIK BURADA DEĞİL — MarketPanel canlı (listeleme + escrow +
  // iptal çalışıyor, sadece satın alma tarafı token bekliyor).
  exchange: {
    kicker: 'THE EXCHANGE', title: 'Not yet trading',
    body: 'Standing bids: post what you would pay for gold and let sellers come to you. The Marketplace next door already takes listings.',
    bullets: [
      'Player-to-player only, no house counterparty',
      'A fee on token trades; half of it burned',
      'Gold-priced trades stay fee-free',
    ],
    gate: 'Opens with $GRAVE.',
  },
};

function ComingSoon({ id }: { id: BuildingId }) {
  const l = LOCKED[id];
  if (!l) {
    return <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.bone }}>{id}</h2>;
  }
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>{l.kicker}</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900, color: C.bone }}>{l.title}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: C.boneDim, lineHeight: 1.6 }}>{l.body}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {l.bullets.map((b) => (
          <div key={b} style={{ ...glass(9), padding: '9px 12px', fontSize: 12, color: C.boneDim, lineHeight: 1.45 }}>
            <span style={{ color: C.candle, marginRight: 8 }}>•</span>{b}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, fontWeight: 900,
        letterSpacing: 1.6, color: C.boneDim }}>
        {l.gate.toUpperCase()}
      </div>
    </>
  );
}
