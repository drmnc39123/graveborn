'use client';
// ARENA — gerçek zamanlı 1v1 ekranı: kuyruk → maç → sonuç.
//
// ⚠️ SİMÜLASYON KENDİ GİRDİNLE İLERLEMİYOR. Tuş yalnızca sunucuya
// gönderiliyor; motor sunucudan dönen kare akışıyla ilerliyor
// (bkz. lib/arenaClient.ts). O yüzden burada `game.step()` YOK, sadece
// `handle.catchUp()` var.
//
// ⚠️ GÖRÜŞ ALANI MÜHÜRLÜ — `setViewport` çağrılmıyor. Pencere boyutu
// simülasyonu etkiliyor (doğum halkası) ve iki oyuncunun ekranı farklı
// olabilir; arena sabit 1280×720 simüle edip ekrana ölçekleniyor.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BTN, Panel, PixelButton } from '@/components/ui/kit';
import { ARENA, type ArenaSetup } from '@/game/arena';
import { render, resetEffects } from '@/game/render';
import { heroById } from '@/game/heroes';
import { Portrait } from '@/components/HeroPicker';
import {
  joinArena, leaveQueue, pollQueue, type ArenaEnd, type ArenaHandle,
} from '@/lib/arenaClient';
import { MenuBackground } from '@/components/MenuBackground';
import { duelTier } from '@/game/duel';
import { fetchPvpSeason, type PvpSeasonState } from '@/lib/gameSession';
import { isTestMode, TEST_PVP_SEASON } from '@/lib/testMode';
import { C, FONT, glass } from '@/lib/theme';

const kisa = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

type Durum =
  | { k: 'idle' }
  | { k: 'queue'; waited: number }
  | { k: 'match'; setup: ArenaSetup }
  | { k: 'result'; setup: ArenaSetup; end: ArenaEnd };

export function ArenaScreen({ onExit }: { onExit: () => void }) {
  const [durum, setDurum] = useState<Durum>({ k: 'idle' });
  const [hata, setHata] = useState<string | null>(null);
  // ⚠️ Sezon SÜS: gelmezse lobi eskisi gibi çalışmaya devam eder, hata
  // göstermez. Kuyruğa girmeyi bir sıralama isteğine bağlamak, sunucu
  // yavaşladığında maç bulmayı da engellerdi.
  const [sezon, setSezon] = useState<PvpSeasonState | null>(null);
  useEffect(() => {
    if (isTestMode()) { setSezon(TEST_PVP_SEASON as unknown as PvpSeasonState); return; }
    fetchPvpSeason().then(setSezon).catch(() => { /* süs */ });
  }, []);

  // ── KUYRUK ──
  useEffect(() => {
    if (durum.k !== 'queue') return;
    let bitti = false;
    const tik = async () => {
      if (bitti) return;
      try {
        const r = await pollQueue();
        if (bitti) return;
        if (r.state === 'matched' && r.setup) setDurum({ k: 'match', setup: r.setup });
        else setDurum({ k: 'queue', waited: r.waited ?? 0 });
      } catch (e) {
        setHata(e instanceof Error ? e.message : 'Could not join the queue.');
        setDurum({ k: 'idle' });
      }
    };
    tik();
    const id = setInterval(tik, 2000);
    return () => { bitti = true; clearInterval(id); };
  }, [durum.k]);

  // ⚠️ Sekme kapanırsa kuyruktan DÜŞ. Yoksa rakip, hiç gelmeyecek biriyle
  // eşleşip boş bir odada bekler.
  useEffect(() => {
    if (durum.k !== 'queue') return;
    const cik = () => { void leaveQueue(); };
    window.addEventListener('beforeunload', cik);
    return () => { window.removeEventListener('beforeunload', cik); cik(); };
  }, [durum.k]);

  if (durum.k === 'match') {
    return (
      <Match
        setup={durum.setup}
        onEnd={(end) => setDurum({ k: 'result', setup: durum.setup, end })}
      />
    );
  }
  if (durum.k === 'result') {
    return <Result setup={durum.setup} end={durum.end} onAgain={() => setDurum({ k: 'queue', waited: 0 })} onExit={onExit} />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, fontFamily: FONT.ui }}>
      {/* ⚠️ ARKA PLAN EKLENDİ. Lobi düpedüz SİYAHTI — oyunun en boş ekranıydı
          ve "yüklenmedi" gibi okunuyordu, oysa her panelin arkasında köy var.
          Yeni varlık ÜRETİLMEDİ: ana sayfanın `MenuBackground`u zaten gerçek
          köy haritasını süzülerek çiziyor ve tek kullanıcısı vardı. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MenuBackground />
      </div>
      {/* ⚠️ Karartma ŞART: panel metni köyün üstünde okunmuyordu. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse at center, rgba(8,6,5,0.55), rgba(8,6,5,0.88) 70%)' }} />
      {/* 🔴 LOBİ OYUNUN GERİ KALANINA HİÇ BENZEMİYORDU: düz yuvarlak bir kutu,
          Franuka çerçevesi yok, ham düğmeler. Oyunun her yeri piksel çerçeveliyken
          burası başka bir uygulamadan alınmış gibi duruyordu.
          ⚠️ 02B DEĞİL 08A. Eski gerekçe "02B, kenarlık PARLAKLIĞI 110 ile
          gotik palete uyumlu" diyordu — ama parlaklık TON demek değil ve
          ölçüm bunu yalanladı: 02B'nin tonu 201° CAMGÖBEĞİ, doygunluk %31,
          yani kullanımdaki en doygun ve palete en zıt çerçeveydi.
          Niyet ("arena köy değil") doğru; 08A onu palet kırmadan veriyor —
          20° kırmızı, %9 doygunluk, 07A'dan belirgin daha AÇIK (137 vs 90).
          Ton tablosu: kit.tsx. */}
      <Panel variant="08A" scale={3} pad={10}
        style={{ width: '100%', maxWidth: 420, textAlign: 'center',
          position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2.6, color: C.blood }}>
          THE PIT
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, color: C.bone, marginTop: 3, marginBottom: 8 }}>
          {durum.k === 'queue' ? 'Looking for someone…' : 'Same arena. Same waves.'}
        </div>
        <div style={{ fontSize: 12, color: C.boneFaint, lineHeight: 1.6, marginBottom: 18 }}>
          {durum.k === 'queue'
            ? `Waiting ${durum.waited}s — the longer you wait, the wider the search.`
            : 'You and one other hunter drop into the same arena, against the same horde. You cannot hurt each other. The last one standing wins.'}
        </div>

        {/* ⚠️ DURUŞ GÖRÜNÜR OLDU. Lobi oyuncuya kendisi hakkında HİÇBİR ŞEY
            söylemiyordu: puanı yok, geçmişi yok. Yan kapıdaki DUELS paneli
            bunların hepsini gösteriyor ve aynı sezon verisinden besleniyor —
            rekabet ekranının "ben neredeyim"i söylememesi tuhaftı. */}
        {sezon?.me && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            marginBottom: 14, padding: '7px 10px', borderRadius: 8,
            border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.32)',
          }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: C.boneFaint }}>
              YOUR STANDING
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, color: duelTier(sezon.me.rating).color }}>
              {duelTier(sezon.me.rating).name}
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, color: C.bone,
              fontVariantNumeric: 'tabular-nums' }}>
              {sezon.me.rating}
            </span>
            <span style={{ fontSize: 10.5, color: C.boneFaint }}>
              {sezon.me.wins}W {sezon.me.losses}L
            </span>
          </div>
        )}

        {hata && (
          <div style={{ marginBottom: 12, fontSize: 11.5, color: C.bad }}>{hata}</div>
        )}

        {durum.k === 'queue' ? (
          <PixelButton variant={BTN.action} scale={3}
            onClick={() => { void leaveQueue(); setDurum({ k: 'idle' }); }}
            style={{ width: '100%', fontSize: 13, fontWeight: 900, letterSpacing: 1.3 }}>
            CANCEL
          </PixelButton>
        ) : (
          <>
            {/* ⚠️ BTN.strong — kuyruğa girmek bir MAÇ açıyor; taahhüt eden ama
                gold harcamayan bir eylem, o yüzden altın DEĞİL. */}
            <PixelButton variant={BTN.strong} scale={3}
              onClick={() => { setHata(null); setDurum({ k: 'queue', waited: 0 }); }}
              style={{ width: '100%', fontSize: 13, fontWeight: 900, letterSpacing: 1.3 }}>
              FIND A MATCH
            </PixelButton>
            <PixelButton variant={BTN.action} scale={3} onClick={onExit}
              style={{ width: '100%', marginTop: 8, fontSize: 13, fontWeight: 900, letterSpacing: 1.3 }}>
              BACK
            </PixelButton>
          </>
        )}
      </Panel>
    </div>
  );
}

// ── MAÇ ──────────────────────────────────────────────────────────────

function Match({ setup, onEnd }: { setup: ArenaSetup; onEnd: (e: ArenaEnd) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ArenaHandle | null>(null);
  const [hud, setHud] = useState({ me: 100, them: 100, myKills: 0, theirKills: 0, behind: 0, bagli: false });

  useEffect(() => {
    resetEffects();
    const h = joinArena(setup, onEnd);
    handleRef.current = h;

    const tuslar = new Set<string>();
    const down = (e: KeyboardEvent) => { tuslar.add(e.key.toLowerCase()); };
    const up = (e: KeyboardEvent) => { tuslar.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let son = performance.now();

    const dongu = (now: number) => {
      const dt = Math.min((now - son) / 1000, 0.25);
      son = now;

      // ── GİRDİ → SUNUCU ──
      const x = (tuslar.has('d') || tuslar.has('arrowright') ? 1 : 0)
        - (tuslar.has('a') || tuslar.has('arrowleft') ? 1 : 0);
      const y = (tuslar.has('s') || tuslar.has('arrowdown') ? 1 : 0)
        - (tuslar.has('w') || tuslar.has('arrowup') ? 1 : 0);
      const m = Math.hypot(x, y) || 1;
      h.send(x / m, y / m);

      // ── SUNUCUDAN GELEN KARELERİ UYGULA ──
      h.catchUp();

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr; canvas.height = cssH * dpr;
      }
      // ⚠️ ODAK KENDİ DÖVÜŞÇÜN — 1. taraf oynayan oyuncunun karakteri `rival`
      const g = h.game;
      const ben = h.side === 0 ? g.hero : g.rival!;
      const rakip = h.side === 0 ? g.rival! : g.hero;
      render(ctx, g, cssW, cssH, dpr, dt, null, [], ben);

      setHud({
        me: Math.max(0, Math.round((ben.hp / ben.stats.maxHp) * 100)),
        them: Math.max(0, Math.round((rakip.hp / rakip.stats.maxHp) * 100)),
        myKills: ben.kills, theirKills: rakip.kills,
        behind: h.behind(), bagli: h.connected(),
      });

      raf = requestAnimationFrame(dongu);
    };
    raf = requestAnimationFrame(dongu);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      h.close();
      handleRef.current = null;
    };
  }, [setup, onEnd]);

  const benim = setup.players[setup.side];
  const onun = setup.players[setup.side === 0 ? 1 : 0];

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.void }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* ⚠️ İKİ CAN ÇUBUĞU DA GÖRÜNMEK ZORUNDA. "Son ayakta kalan" bir maçta
          tek bilinmesi gereken şey rakibin ne kadar dayandığı; onu göremezsen
          ne zaman risk alacağını bilemezsin. */}
      <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex',
        justifyContent: 'center', gap: 10, pointerEvents: 'none', fontFamily: FONT.ui }}>
        <Bar name="YOU" wallet={benim.wallet} hero={benim.heroId} pct={hud.me}
          kills={hud.myKills} accent={C.candle} />
        <Bar name="THEM" wallet={onun.wallet} hero={onun.heroId} pct={hud.them}
          kills={hud.theirKills} accent={C.blood} flip />
      </div>

      {/* ⚠️ GECİKME GÖSTERGESİ. Motor sunucudan hızlı koşamaz; kare gelmezse
          oyun donar. Oyuncu bunu "oyun bozuldu" diye okumamalı — sayı
          görünsün ki neyin beklendiği belli olsun. */}
      {(hud.behind > ARENA.hz / 2 || !hud.bagli) && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          ...glass(9), padding: '6px 12px', fontSize: 11, fontFamily: FONT.ui,
          color: hud.bagli ? C.candle : C.bad }}>
          {hud.bagli ? `catching up · ${hud.behind} ticks` : 'connection lost'}
        </div>
      )}
    </div>
  );
}

function Bar({ name, wallet, hero, pct, kills, accent, flip }: {
  name: string; wallet: string; hero: string; pct: number;
  kills: number; accent: string; flip?: boolean;
}) {
  return (
    <div style={{
      ...glass(10), padding: '7px 10px', minWidth: 190,
      display: 'flex', gap: 8, alignItems: 'center',
      flexDirection: flip ? 'row-reverse' : 'row',
    }}>
      <Portrait hero={heroById(hero)} size={34} frame={false} flip={flip} />
      <div style={{ flex: 1, minWidth: 0, textAlign: flip ? 'right' : 'left' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline',
          flexDirection: flip ? 'row-reverse' : 'row' }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: accent }}>
            {name}
          </span>
          <span style={{ fontSize: 10, color: C.boneFaint }}>{kisa(wallet)}</span>
          <span style={{ marginLeft: flip ? 0 : 'auto', marginRight: flip ? 'auto' : 0,
            fontSize: 10, color: C.boneDim }}>{kills} kill</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, marginTop: 3, overflow: 'hidden',
          background: 'rgba(0,0,0,0.45)' }}>
          <div style={{
            width: `${pct}%`, height: '100%', float: flip ? 'right' : 'left',
            background: pct > 30 ? accent : C.bad,
            transition: 'width 120ms linear',
          }} />
        </div>
      </div>
    </div>
  );
}

// ── SONUÇ ────────────────────────────────────────────────────────────

function Result({ setup, end, onAgain, onExit }: {
  setup: ArenaSetup; end: ArenaEnd; onAgain: () => void; onExit: () => void;
}) {
  const kazandim = end.winner === setup.side;
  const benim = setup.players[setup.side];
  const onun = setup.players[setup.side === 0 ? 1 : 0];
  const t = duelTier(benim.duelRating + (kazandim ? end.delta : -end.delta));

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,6,5,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: FONT.ui }}>
      <div style={{ ...glass(16), padding: 24, width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2.6, color: C.blood }}>
          THE PIT
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4, marginBottom: 6,
          color: end.winner === null ? C.boneDim : kazandim ? C.candle : '#e4657a' }}>
          {end.winner === null ? 'No result' : kazandim ? 'Last one standing' : 'You fell first'}
        </div>
        <div style={{ fontSize: 12, color: C.boneFaint, marginBottom: 16, lineHeight: 1.55 }}>
          {end.winner === null
            // ⚠️ Sonuçsuz maç SEBEBİYLE söylenmeli, yoksa "oyun bozuk" okunur
            ? 'The match ended without a winner — someone left, or it ran past the limit. No standing changed.'
            : `${Math.round(end.tick / ARENA.hz)} seconds in the same arena.`}
        </div>

        <div style={{ display: 'flex', gap: 9, marginBottom: 16 }}>
          <Sonuc label="YOU" wallet={benim.wallet} hero={benim.heroId}
            kills={end.kills[setup.side]} accent={C.candle} />
          <Sonuc label="THEM" wallet={onun.wallet} hero={onun.heroId}
            kills={end.kills[setup.side === 0 ? 1 : 0]} accent={C.blood} flip />
        </div>

        {end.winner !== null && (
          <div style={{ ...glass(9), padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 1.4, color: C.boneFaint }}>STANDING</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: t.color }}>{t.name}</div>
            <div style={{ fontSize: 12, fontWeight: 900,
              color: kazandim ? C.ok : C.bloodSoft }}>
              {kazandim ? '+' : '−'}{Math.abs(end.delta)}
            </div>
          </div>
        )}

        {/* ⚠️ AGAIN güçlü, çıkış sıradan: maç sonunda asıl istenen tekrar
            oynamak. İkisi de aynı ağırlıkta olsaydı ekran hangisini
            önerdiğini söylemezdi. */}
        <PixelButton variant={BTN.strong} scale={3} onClick={onAgain}
          style={{ width: '100%', fontSize: 13, letterSpacing: 1 }}>AGAIN</PixelButton>
        <PixelButton variant={BTN.action} scale={2} onClick={onExit}
          style={{ width: '100%', marginTop: 8, fontSize: 11, letterSpacing: 0.8 }}>
          BACK TO THE VILLAGE
        </PixelButton>
      </div>
    </div>
  );
}

function Sonuc({ label, wallet, hero, kills, accent, flip }: {
  label: string; wallet: string; hero: string; kills: number; accent: string; flip?: boolean;
}) {
  return (
    <div style={{ flex: 1, padding: '10px 8px', borderRadius: 10,
      border: `1px solid ${accent}44`,
      background: `linear-gradient(180deg, ${accent}18, rgba(0,0,0,0.30))` }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Portrait hero={heroById(hero)} size={54} frame={false} flip={flip} />
      </div>
      <div style={{ fontSize: 11, color: C.bone }}>{kisa(wallet)}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: accent }}>{kills} <span style={{ fontSize: 10, color: C.boneFaint }}>kill</span></div>
    </div>
  );
}
