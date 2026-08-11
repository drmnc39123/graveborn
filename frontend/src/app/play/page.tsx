'use client';
// Oyun kabuğu: HUB ⇄ BÖLÜM.
// Hub'da gezersin, Warden's Post'tan bölüm seçersin, bölüm biter/ölürsün,
// gold TAVANA GÖRE cüzdana yazılır ve hub'a dönersin.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HubCanvas } from '@/components/HubCanvas';
import { GameCanvas } from '@/components/GameCanvas';
import { ForgePanel } from '@/components/ForgePanel';
import { RecordsPanel } from '@/components/RecordsPanel';
import { MarketPanel } from '@/components/MarketPanel';
import { StallPanel } from '@/components/StallPanel';
import { PetPanel } from '@/components/PetPanel';
import { ReliquaryPanel } from '@/components/ReliquaryPanel';
import { WorldBossPanel } from '@/components/WorldBossPanel';
import { GuildPanel } from '@/components/GuildPanel';
import { GearPanel } from '@/components/GearPanel';
import { SkillPanel } from '@/components/SkillPanel';
import { DuelPanel } from '@/components/DuelPanel';
import { ArenaScreen } from '@/components/ArenaScreen';
import { QuestPanel } from '@/components/QuestPanel';
import { FollowPanel } from '@/components/FollowPanel';
import { FirstRun, isNewcomer } from '@/components/FirstRun';
import { SettingsPanel, applyStoredSettings } from '@/components/SettingsPanel';
import { HeroPicker } from '@/components/HeroPicker';
import { BuildingDock } from '@/components/BuildingDock';
import { EventBanner } from '@/components/EventBanner';
import { ChatPanel } from '@/components/ChatPanel';
import { ProfileCard } from '@/components/ProfileCard';
import { Panel, PixelButton, BTN, type PanelStyle } from '@/components/ui/kit';
import { MotionStyles, Reveal, motionOff, useCountUpInt } from '@/components/ui/motion';
import { Card, PanelHead, Pips, Tag, prettyId } from '@/components/ui/cards';
import { permanentBonus } from '@/game/forge';
import { charmBonus, mergeBonus } from '@/game/charms';
import {
  ASCENSION, STAGES, ascensionDamageMul, ascensionDropMul, ascensionHpMul, ascensionUnlockDepth,
  challengeRating,
  checkpointFor, depthGold, maxAscensionFor, stageById, startLevelFor,
} from '@/game/config';
import { BOSS_RUN_SEC, bossOfWeek, bossRoomStage, bossWeek } from '@/game/worldBoss';
import { GEAR, SLOT_NAME, affixText, rarityOf } from '@/game/gear';
import { loadProgress, resolveRunPets, paidDepth, type Progress, type RunResult } from '@/game/progress';
import { newlyUnlocked, unlockedWeapons, weaponName } from '@/game/unlocks';
import type { CSSProperties } from 'react';
import type { RunMode } from '@/game/engine';
import type { BuildingId } from '@/game/hub';
import { C, FONT, glass } from '@/lib/theme';
import { installAudioUnlock, installUiClickSound, play } from '@/game/sfx';
import { getMode, getWallet } from '@/lib/session';
import {
  buyUpgrade, engineModeOf, finishBossRun, finishRun as settleRun, loadSessionProgress,
  setHero as saveHero, startBossRun, startDuel, startRun,
  type RunKind, type RunTicket, type Settled,
} from '@/lib/gameSession';

type Screen =
  | { kind: 'hub' }
  | { kind: 'stage'; stageId: number; mode: RunKind; ticket: RunTicket }
  /** ⚠️ Boss odası AYRI bir ekran: `settleRun`'a hiç uğramıyor, gold ödemiyor */
  | { kind: 'boss'; runId: string; seed: number }
  /**
   * ⚠️ ARENA TAM EKRAN, PANEL DEĞİL. Gerçek zamanlı bir maçı panel içinde
   * göstermek, oyuncunun yanlışlıkla dışarı tıklayıp maçı kaybetmesi
   * demekti — panel katmanı arka plana basınca kapanıyor.
   */
  | { kind: 'arena' };

/** Koşu sonu bildirimi — ödülün nereden geldiği oyuncuya AÇIKÇA gösterilir */
type Payout = {
  mode: RunKind;
  /** bu koşuda temizlenen en derin seviye — "hiç inemedin" ile "buraya zaten
   *  inmiştin" ayrımı için gerekli; ikisi de 0 öder ama sebepleri farklı */
  deepestCleared: number;
  progressGold: number;
  dropGold: number;
  /** `dropGold`'un içindeki hafta sonu etkinliği payı — ayrı satır */
  eventGold: number;
  paidRange: { from: number; to: number } | null;
  /** bahis vardıysa sonucu — gold değil TOZ öder (bkz. game/wager.ts) */
  wager: { stake: number; target: number; won: boolean; dust: number } | null;
  /** Wilderness koşusuysa: çıkabildi mi ve ne buldu */
  wilderness: Settled['wilderness'];
  /** düello koşusuysa: kazandı mı, puan nasıl değişti */
  duel: Settled['duel'];
  /** bu koşuda AÇILAN silahlar (bkz. game/unlocks.ts) */
  unlocked: string[];
  /**
   * Bu koşuda bölüm temizlendi mi.
   *
   * ⚠️ OLMADAN İLK ÖLÜM MESAJI YANLIŞTI ve ölçüldü: kampanyada 0 gold'un
   * TEK açıklaması "zaten aldın" sanılıyordu. İlk koşusunda ölen yeni
   * oyuncuya "already claimed — replay pays nothing" deniyordu — hiçbir şey
   * almamışken. Bir oyuncunun göreceği en kötü ilk mesaj.
   */
  cleared: boolean;
};

/**
 * PANEL ÇERÇEVESİ — her kapının kendi kimliği.
 *
 * 🔴 ON ÜÇ ÇERÇEVE VAR ve HEPSİ 07A KULLANIYORDU. Kullanıcının şikâyeti
 * buydu: dokuz farklı yere giriyorsun, dokuzu da aynı pembe kutu.
 *
 * ⚠️ SEÇİMİ ÖLÇÜM DARALTTI, GÖZ KARAR VERDİ — ve ilk ölçüm YANLIŞ BÖLGEYİ
 * ölçtü. Önce çerçevelerin DOLGU parlaklığına bakıldı ve karartma katmanı
 * ona göre ayarlandı; ekranda hiçbir şey değişmedi. Sebep: karartma içerik
 * kutusunu kaplıyor, 48 px'lik KENARLIĞI değil — yani panelin "açık"
 * görünmesine sebep olan şey dolgu değil ÇERÇEVENİN KENDİSİYDİ.
 *
 * Kenarlık parlaklığı (algılanan, 0-255) doğru ölçü çıktı:
 *   07A  86,4 · 01B 104,3 · 02B 110,2 · 05A 126,6   ← gotik palete uyumlu
 *   03A 131,0 · 08A 136,6 · 06A 141,9 · 04B 147,9   ← sınırda
 *   04A 167,5 · 04C 216,2                           ← parlak, kullanılamaz
 *
 * Eşleme ANLAMLA ve yalnızca uyumlu olanlardan: tezgâh ahşap, beceri soğuk,
 * market turkuaz (para), geri kalan mezarlık sarmaşığı.
 */
const PANEL_CERCEVE: Record<string, PanelStyle> = {
  shop: '05A',       // PEDLAR'S STALL — ahşap kalas, tezgâh
  paths: '01B',      // YOUR PATHS — soğuk mavi-gri, zihinsel
  market: '02B',     // MARKETPLACE — turkuaz, para
  exchange: '02B',
  // ⚠️ Forge 06A, Reliquary 03A, Gear 08A DENENDİ ve GERİ ALINDI: üçü de
  // kenarlık parlaklığında sınırın üstünde ve ekranda panel soluk, çerçeve
  // cılız duruyordu (06A yalnızca köşe braketi çiziyor, gövde boş kalıyor).
  // Kimlik uğruna tema bozulmaz — geri kalan hepsi 07A.
};

/**
 * PANEL GENİŞLİĞİ — işin gerektirdiği kadar.
 *
 * ⚠️ HEPSİ 560 px'E KİLİTLİYDİ, tek bir satırda. Bir emir defteri için bu
 * dar: fiyat, miktar, birim fiyat, satıcı ve eylem aynı satıra sığmıyor,
 * kartlar alt alta diziliyor ve KIYASLAMA — bir marketin tek işi —
 * imkânsız hâle geliyordu.
 *
 * ⚠️ Genişlik ANLAMLA veriliyor, "daha büyük daha iyi" diye değil:
 * bir ayar paneli 1100 px'de sağı boş bir tarla olurdu.
 *
 * ⚠️ Franuka çerçevesi 9-slice + `fill` — orta karo yatayda tekrarlıyor,
 * yani genişlik riski yok (bkz. kit.tsx `nineSlice`).
 */
/**
 * EKRAN KÖKÜ — köy · boss odası · koşu üçü de aynı geçişi alıyor.
 *
 * ⚠️ Köyden koşuya geçiş SERT KESMEYDİ. Kısa bir belirme, "yükleniyor"
 * demeden yüklenme anını yumuşatıyor.
 * ⚠️ 180 ms'İ GEÇMEMELİ. Panelin 160 ms gerekçesinin aynısı: oyuncu bir
 * oturumda onlarca kez koşuya giriyor; uzun geçiş her seferinde bekleme
 * demek. Geçiş bir gösteri değil, bir dikiş.
 * ⚠️ `motionOff()` burada TEK SEFER okunuyor (modül düzeyinde değil, render
 * içinde) — ayar değişince yeniden değerlendirilsin.
 */
const EKRAN_GECIS_MS = 180;

/** Kapanış animasyonunun süresi — `gb-panel-out` ile AYNI olmalı (kit.tsx) */
const PANEL_KAPANIS_MS = 140;

const PANEL_GENISLIK: Record<string, number> = {
  market: 1100,      // emir defteri — kıyaslama için sütun gerekiyor
  exchange: 1100,    // aynı kabuk (içi token'a kadar kilitli)
  reliquary: 720,    // dört sekme + ızgara
  quests: 720,       // karakter vitrini + bölüm listesi
  duel: 720,         // iki sıralama tablosu
};

export default function PlayPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ kind: 'hub' });
  const [panel, setPanelRaw] = useState<BuildingId | null>(null);
  /**
   * ⚠️ AÇILIŞ/KAPANIŞ SESİ BURADA — tek kaynak.
   *
   * `Panel` bileşeninin içine konmuştu ve hiç çalmadı: sekmeler arası geçişte
   * React o elemanı yeniden monte etmiyor, sadece çocuklarını değiştiriyor.
   * Durum değişimi burada olduğu için ses de burada.
   *
   * Aynı paneli tekrar seçmek ses çıkarmaz (`p === panel`) — düğmenin kendi
   * tıklama sesi zaten var, ikisi üst üste binmemeli.
   */
  const panelRef = useRef<BuildingId | null>(null);
  /**
   * KAPANIŞ ANİMASYONU İÇİN GECİKMELİ SÖKME.
   *
   * ⚠️ Panel açılırken canlanıyor ama kapanırken BİR ANDA yok oluyordu —
   * geçişin yarısı yapılmıştı. Animasyonun oynayabilmesi için elemanın kısa
   * bir süre daha monteli kalması gerekiyor; `kapanan` o kalıntıyı tutuyor.
   *
   * ⚠️ Kalıntı TIKLAMA ALMAZ (`pointerEvents:'none'`). Almasaydı, kapanan
   * panelin üstüne denk gelen ilk tıklama köye değil ölmekte olan panele
   * giderdi — rıhtımın paneli örtmesiyle aynı sınıf hata.
   */
  const [kapanan, setKapanan] = useState<BuildingId | null>(null);
  const kapanisSaati = useRef<number | null>(null);
  const setPanel = useCallback((p: BuildingId | null) => {
    // ⚠️ KARŞILAŞTIRMA REF ÜZERİNDEN, `setPanelRaw` GÜNCELLEYİCİSİNİN İÇİNDE
    // DEĞİL. İlk sürüm sesi güncelleyicinin içinde çalıyordu; React geliştirme
    // modunda (StrictMode) güncelleyici fonksiyonları İKİ KEZ çağırıyor — ses
    // çift çalardı. Güncelleyici SAF olmak zorunda, yan etki dışarıda kalır.
    if (p !== panelRef.current) play(p ? 'open' : 'close');

    if (kapanisSaati.current !== null) {
      window.clearTimeout(kapanisSaati.current);
      kapanisSaati.current = null;
    }
    if (p === null && panelRef.current !== null && !motionOff()) {
      const giden = panelRef.current;
      setKapanan(giden);
      kapanisSaati.current = window.setTimeout(() => {
        setKapanan(null);
        kapanisSaati.current = null;
      }, PANEL_KAPANIS_MS);
    } else {
      // ⚠️ Yeni panel açılırken kalıntı ANINDA silinir; yoksa hızlı geçişte
      // iki panel üst üste çizilir.
      setKapanan(null);
    }

    panelRef.current = p;
    setPanelRaw(p);
  }, []);
  // Bileşen sökülürken bekleyen zamanlayıcı kalmasın
  useEffect(() => () => {
    if (kapanisSaati.current !== null) window.clearTimeout(kapanisSaati.current);
  }, []);
  /**
   * ETKİN PANEL — açık olan ya da kapanmakta olan.
   *
   * ⚠️ Kapanış animasyonu sırasında `panel` NULL oluyor. İçerik dalları
   * yalnız `panel`e baksaydı hepsi false olur ve panel gövdesi sönerken
   * bir anlığına "Coming soon"a düşerdi — geçiş bir hataya benzerdi.
   */
  const [progress, setProgress] = useState<Progress | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [note, setNoteRaw] = useState<string | null>(null);
  /**
   * Rıhtım içeriğinin sol kenarı — kimlik kartının kullanabileceği genişlik.
   *
   * ⚠️ SABİT SAYI OLAMAZ: rıhtım ORTALI, sol kenarı görüntü genişliğine
   * bağlı. Kart 214 px sabitken ölçüldü: 1134 px'de rıhtım x=189'da
   * başlıyor, kart x=226'da bitiyordu — navbar'ın ÜSTÜNE biniyordu.
   * `dockH` ile aynı desen: ölç, varsayma.
   */
  const [dockLeft, setDockLeft] = useState(0);

  /**
   * ⚠️ ERKEN DÖNÜŞLERDEN ÖNCE tanımlı olmak zorunda: arena ve boss ekranları
   * da bu kökü kullanıyor ve panel state'inden ÖNCE dönüyorlar.
   * ⚠️ Render içinde okunuyor — `motionOff()` ayara bağlı ve ayar oturum
   * ortasında değişebiliyor (Settings paneli). Modül düzeyinde donardı.
   */
  const EKRAN_KOK: CSSProperties = {
    position: 'fixed', inset: 0,
    animation: motionOff() ? undefined : `gb-fade ${EKRAN_GECIS_MS}ms ease-out both`,
  };

  /**
   * ⚠️ SES BAĞLAMINI KÖYDE DE AÇ.
   *
   * `unlockAudio` daha önce YALNIZCA `GameCanvas` içinde çağrılıyordu — yani
   * ses ancak bir koşuya girildikten sonra açılıyordu. Arayüz sesleri
   * (tıklama, panel açılışı, reddedilme) hub'da çalınıyor ve `play()`
   * kilitliyken SESSİZCE geri dönüyor: hiçbir hata çıkmadan hiçbir ses
   * duyulmaz, sebebi de görünmezdi.
   */
  useEffect(() => installAudioUnlock(), []);
  // ⚠️ Tıklama sesi TEK NOKTADAN — bkz. sfx.installUiClickSound başlığı.
  useEffect(() => installUiClickSound(), []);
  /**
   * ⚠️ HER HATA MESAJI BURADAN GEÇİYOR — reddedilme sesi de burada.
   *
   * `deny`'ı 11 ayrı `onError` çağrısına serpmek denenmedi ve denenmemeli:
   * yeni bir panel eklendiğinde biri unutulur, "bazı hatalar ses çıkarıyor"
   * hâli hiç ses olmamasından kötüdür. Ses mesajın KENDİSİNE bağlı, mesajı
   * üreten yere değil.
   */
  const setNote = useCallback((m: string | null) => {
    if (m) play('deny');
    setNoteRaw(m);
  }, []);
  /** rıhtımın ölçülen yüksekliği — panel boşluğu buna göre (bkz. BuildingDock) */
  const [dockH, setDockH] = useState(78);
  /**
   * İlk koşu çağrısı kapatıldı mı — SADECE bu oturum için.
   *
   * ⚠️ Kalıcı olarak saklanmıyor: koşuyu bitiren oyuncuda `isNewcomer`
   * zaten false oluyor, yani kaydedilecek bir şey yok. Ayrı bir bayrak
   * tutmak, ilerlemeden türeyen bir soruya ikinci bir gerçek eklerdi.
   */
  const [ilkGizli, setIlkGizli] = useState(false);
  // ⚠️ Doğrudan `getWallet()` ÇAĞIRMA. localStorage okur; sunucuda null döner,
  // istemcide adres döner ve navbar rozeti "DEMO" ↔ adres arasında uyuşmazlığa
  // düşerek hidrasyonu bozar (React tüm ağacı istemci içeriğiyle değiştirir).
  // Mount'tan SONRA okunmalı.
  const [wallet, setWallet] = useState<string | null>(null);

  // Mod seçilmemişse kapıya geri gönder — hangi kayda oynadığını bilmeden
  // oyuna girmek, sonradan "ilerlemem nerede?" demek olurdu.
  useEffect(() => {
    if (getMode() === null) { router.replace('/'); return; }
    // ⚠️ Ayarlar HER ŞEYDEN ÖNCE uygulanır: koşu başladıktan sonra
    // uygulanırsa oyuncu ilk saniyelerde kapattığı sarsıntıyı görür ve
    // kıstığı sesi duyar.
    applyStoredSettings();
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

  /**
   * ⚠️ SON KAHRAMAN KAYDI UÇUŞTA MI — düello brifingi bunu BEKLEMEK ZORUNDA.
   *
   * Kahraman seçimi iyimser: arayüz anında değişiyor, kayıt arkadan gidiyor.
   * Düelloda bu bir yarış açıyordu — oyuncu kahramanı seçip hemen "ANSWER
   * THEM"e basarsa `/duel/start` kayıttaki ESKİ kahramanı okuyup koşuyu
   * onunla açabilirdi. Brifingde seçilen kahramanla girilmemesi, sessiz ve
   * çok kızdırıcı bir hata olurdu.
   */
  const heroSaveRef = useRef<Promise<unknown>>(Promise.resolve());

  /** Karakter seçimi kalıcı — her koşuda yeniden seçtirmek gereksiz sürtünme */
  const pickHero = useCallback((hero: string) => {
    setProgress((prev) => {
      if (!prev) return prev;
      const p = saveHero(hero, prev).then(setProgress)
        .catch(() => setNote('Karakter kaydedilemedi.'));
      heroSaveRef.current = p;
      return { ...prev, hero };            // arayüz beklemesin, iyimser güncelle
    });
  }, []);

  /** Koşu bitti — ödülü demo'da progress.ts, cüzdanda SUNUCU hesaplar */
  const finishRun = useCallback((run: RunResult) => {
    const ticket = screen.kind === 'stage' ? screen.ticket : null;
    const kind: RunKind = screen.kind === 'stage' ? screen.mode : run.mode;
    setScreen({ kind: 'hub' });
    const base = progress ?? loadProgress();
    settleRun(ticket, run, base)
      .then((r) => {
        setProgress(r.progress);
        setPayout({
          // ⚠️ Çeşit BİLETTEN okunur, `run.mode`'dan DEĞİL: motor Wilderness'ı
          // descent olarak çalıştırıyor, yani `run.mode` her zaman 'descent'
          // döner ve döküm yanlış ekranı gösterirdi.
          mode: kind, deepestCleared: run.deepestCleared, cleared: run.cleared,
          progressGold: r.progressGold, dropGold: r.dropGold,
          eventGold: r.eventGold, paidRange: r.paidRange,
          wager: r.wager, wilderness: r.wilderness ?? null, duel: r.duel ?? null,
          // ⚠️ ÖNCE/SONRA farkından TÜRETİLİYOR — "yeni açıldı" diye bir
          // bayrak saklanmıyor. Kazanılan şey kazanıldığı AN söylenmezse
          // oyuncu kartı bir sonraki koşuda görür ve "bu ne zaman geldi" der.
          unlocked: newlyUnlocked(base, r.progress),
        });
      })
      .catch(() => setNote('Koşu kaydedilemedi — ödül işlenmedi.'));
  }, [screen, progress]);

  /** Bölüm başlat: cüzdan modunda seed'i, koşu kimliğini ve checkpoint'i SUNUCU verir */
  const beginStage = useCallback((stageId: number, mode: RunKind, wantStartDepth = 1, wantAscension = 0) => {
    setPanel(null);
    startRun(mode, stageId, wantStartDepth, wantAscension)
      .then((ticket) => setScreen({ kind: 'stage', stageId, mode, ticket }))
      .catch(() => setNote('Koşu başlatılamadı.'));
  }, []);

  /**
   * Düelloya gir — rakibin koşusunu oynamak.
   *
   * ⚠️ AYRI UÇ (`/duel/start`): seed rakibin KAYDINDAN geliyor, yeni
   * üretilmiyor. `startRun` kullanılsaydı sunucu taze bir seed üretir ve
   * düellonun tek adalet dayanağı yok olurdu.
   */
  const beginDuel = useCallback((recordId: string) => {
    setPanel(null);
    // ⚠️ Uçuştaki kahraman kaydını BEKLE — bkz. heroSaveRef
    heroSaveRef.current
      .then(() => startDuel(recordId))
      .then((t) => setScreen({ kind: 'stage', stageId: t.duel.stageId, mode: 'duel', ticket: t }))
      .catch((e) => setNote(e instanceof Error ? e.message : 'Meydan okuma açılamadı.'));
  }, []);

  /**
   * Boss odasına gir. ⚠️ Ayrı uçlar (`/boss/start`) — ödül hesabına
   * dokunmuyor, o yüzden `settleRun`'ın kampanya/descent dallarına üçüncü
   * bir mod eklemek sadece risk olurdu.
   */
  const beginBoss = useCallback(() => {
    setPanel(null);
    startBossRun()
      .then((t) => setScreen({ kind: 'boss', runId: t.runId, seed: t.seed }))
      .catch(() => setNote('Barrow açılamadı — cüzdan gerekiyor.'));
  }, []);

  /** Boss koşusu bitti: hasarı sunucuya bildir, tavana kırpılmışsa söyle */
  const finishBoss = useCallback((run: RunResult) => {
    const runId = screen.kind === 'boss' ? screen.runId : null;
    setScreen({ kind: 'hub' });
    if (!runId) return;
    finishBossRun(runId, Math.floor(run.bossDamage ?? 0))
      .then((r) => {
        setNote(r.capped
          ? `Barrow: ${r.accepted.toLocaleString('en-US')} damage counted (claim trimmed).`
          : `Barrow: ${r.accepted.toLocaleString('en-US')} damage dealt.`);
      })
      .catch(() => setNote('Hasar kaydedilemedi.'));
  }, [screen]);

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

  if (screen.kind === 'arena') {
    return <ArenaScreen onExit={() => setScreen({ kind: 'hub' })} />;
  }

  if (screen.kind === 'boss') {
    const p = progress ?? loadProgress();
    const def = bossOfWeek(bossWeek(new Date()));
    return (
      <div style={EKRAN_KOK}>
      <MotionStyles />
        {/* ⚠️ Tılsım YOK ve bu kasıtlı: tılsımlar koşu açılırken yanıyor ve
            boss odası ayrı bir uçtan başlıyor. Oyuncunun tılsımını burada
            harcatmak, descent için sakladığı şeyi sessizce yakmak olurdu. */}
        <GameCanvas
          stage={bossRoomStage(def)}
          mode="campaign"
          hero={p.hero}
          seed={screen.seed}
          aura={p.equipped.aura ?? null}
          timeLimitSec={BOSS_RUN_SEC}
          livePresence
          permanent={permanentBonus(p.upgrades)}
          // ⚠️ Boss odasında pet YOK — silah kilidiyle aynı gerekçe: orası
          // ayrı bir uçtan başlıyor, gold ödemiyor ve hasar tablosu ortak.
          // Pet'li/pet'siz oyuncuyu aynı tabloda yarıştırmak haksız olurdu.
          onFinish={finishBoss}
        />
      </div>
    );
  }

  if (screen.kind === 'stage') {
    const def = stageById(screen.stageId)!;
    const p = progress ?? loadProgress();
    return (
      <div style={EKRAN_KOK}>
      <MotionStyles />
        {/* ⚠️ Tılsımlar `progress.charms`'tan DEĞİL BİLETTEN okunur: koşu
            açılırken tüketildiler, kayıtta artık yoklar. Kayıttan okumak bu
            koşuyu tılsımsız başlatırdı. */}
        <GameCanvas
          stage={def}
          mode={engineModeOf(screen.mode)}
          hero={p.hero}
          seed={screen.ticket.seed}
          startDepth={screen.ticket.startDepth}
          ascension={screen.ticket.ascension}
          aura={p.equipped.aura ?? null}
          permanent={runBonus(p.upgrades, screen.ticket)}
          // ⚠️ Pet'ler İLERLEMEDEN türetiliyor (bkz. resolveRunPets): sahip
          // olmadığını takamaz, yuvası yoksa taşıyamaz. Silah kilidiyle aynı
          // duruş — motor `Progress` görmüyor, sadece çözülmüş sonucu alıyor.
          pets={resolveRunPets(p)}
          // ⚠️ Kilit İLERLEMEDEN TÜRETİLİYOR, kayıtta saklanmıyor
          // (bkz. game/unlocks.ts). Boss odasına verilmiyor: orası ayrı bir
          // uçtan başlıyor ve gold ödemiyor; oyuncuyu orada da kısıtlamak
          // haftalık boss'u sebepsiz zorlaştırırdı.
          allowedWeapons={unlockedWeapons(p)}
          duelTarget={screen.mode === 'duel' ? screen.ticket.duel?.target : undefined}
          onFinish={finishRun}
        />
      </div>
    );
  }

  const acik = panel ?? kapanan;
  /**
   * KOŞU ÖDEMESİ — oyunun en büyük ödül anı.
   *
   * ⚠️ Bakiye sayacından DAHA YAVAŞ (700 ms). Bakiye bir arka plan bilgisi;
   * bu ise oyuncunun koşusunun karşılığı ve üstünde durulmayı hak ediyor.
   * ⚠️ `payout` yokken 0 — ekran açılınca 0'dan toplama sayıyor, yani ilk
   * değer BURADA sayılmalı (bakiyenin tersine).
   */
  const odemeToplam = useCountUpInt(payout ? payout.progressGold + payout.dropGold : 0, 700);

  return (
    <div style={EKRAN_KOK}>
      <MotionStyles />
      <HubCanvas
        hero={(progress ?? loadProgress()).hero}
        onEnterBuilding={onEnter}
        // Dövüş portalı doğrudan bölüm BAŞLATMAZ, seçim panelini açar.
        // (HubCanvas burada os(0) çağırıyordu; stageById(0) undefined olduğu
        //  için portala basmak sayfayı çökertiyordu.)
        onEnterStage={() => setPanel('quests')}
      />

      {/* Cüzdan + bina rıhtımı — yürümek seçenek, zorunluluk değil */}
      <BuildingDock open={panel} onOpen={(id) => {
        // ⚠️ Pit bir panel değil, ekran: rıhtımdan doğrudan maça giriliyor.
        if (id === 'pit') { setPanel(null); setScreen({ kind: 'arena' }); return; }
        setPanel(id);
      }} gold={progress?.gold ?? 0} wallet={wallet}
        onHeight={setDockH}
        onLeft={setDockLeft}
        // ⚠️ ŞERİT RIHTIMIN İÇİNDE, sayfada ayrı bir katmanda DEĞİL — gerekçe
        // BuildingDock'un render sonundaki notta. Panel açıkken gizleniyor:
        // oyuncu zaten bir şeye bakıyor demektir.
        footer={!panel ? <EventBanner /> : null} />

      {/* ── İLK KOŞU ÇAĞRISI ──
          ⚠️ ÖLÇÜLDÜ: yeni oyuncu köye düşüyor ve karşısında 4 grup, 14 panel,
          12 bina buluyor; hiçbiri "önce şunu yap" demiyordu. Tutorial ancak
          koşunun İÇİNDE başlıyor. Panel açıkken gösterilmiyor — oyuncu zaten
          bir şeye bakıyor demektir. */}
      {!panel && !ilkGizli && isNewcomer(progress) && (
        <FirstRun
          // ⚠️ Kahraman ve mod SORULMUYOR: ilk koşuda oyuncunun bunlara
          // verecek cevabı yok, sadece engel oluyorlar.
          onBegin={() => beginStage(STAGES[0].id, 'campaign')}
          onDismiss={() => setIlkGizli(true)}
        />
      )}

      {/* ⚠️ SOHBET PANEL DEĞİL, KÖŞEDE DURUYOR. Panele koymak onu "gidip
          bakılan bir yer" yapardı; insanların orada olduğunu görmeyen oyuncu
          sohbet olduğunu da bilmez. Panel açıkken gizleniyor — üst üste
          binmesin ve panelin içindeki alanları kapatmasın. */}
      {!panel && <ChatPanel />}

      {/* ⚠️ KİMLİK KARTI SOL ÜSTTE — ölçüldü, ekranın tek gerçekten boş
          köşesi orası: rıhtım üstte ORTALI ve sarmalayıcısı `pointerEvents:
          none`, sohbet sol altta, tuş ipucu sağ altta.
          ⚠️ SAĞ ÜSTE KONULAMAZ: minimap canvas'ın İÇİNDE çiziliyor
          (`hubRender.ts` drawMinimap) — oraya HTML koymak üstüne binerdi.
          ⚠️ zIndex 6: 5 panel katmanı (açıkken kartın kaybolması gerekir
          zaten `!panel` ile hallediliyor), 7/8 ödeme ve düello kaplamaları
          kartın ÜSTÜNDE kalmalı.
          ⚠️ Panel açıkken gizleniyor — ChatPanel ve EventBanner emsali:
          oyuncu zaten bir şeye bakıyor demektir. */}
      {!panel && progress && (
        // ⚠️ NAVBAR HİZASINDA (`top: 10`) ama GENİŞLİĞİ ÖLÇÜLEN BOŞLUĞA GÖRE.
        //
        // Üç deneme oldu ve ikisi ölçümle çürüdü:
        //   1) `top:10` + sabit 214 px → 1134 px'de rıhtım x=189'da başlıyor,
        //      kart x=226'da bitiyordu: navbar'ın ÜSTÜNE biniyordu.
        //   2) Rıhtımın ALTINA almak (`top: dockH+16`) çakışmayı çözüyordu
        //      ama kart ekranın ortasına doğru sarkıyordu — istenen, navbar
        //      gibi üste bitişik durması.
        //   3) Şimdi: üstte kalıyor, genişliği `dockLeft`ten türüyor.
        //      Rıhtım ORTALI olduğu için o sayı görüntü genişliğiyle
        //      değişiyor; sabit bir genişlik dar ekranda yine çakışırdı.
        //
        // ⚠️ `dockLeft` 0 gelirse (ilk kare, henüz ölçülmedi) kart çizilmez —
        // yanlış genişlikle bir kare çizip zıplamasındansa bir kare beklesin.
        <div style={{
          position: 'absolute', top: 10, left: 12, zIndex: 6,
          width: Math.max(0, Math.min(214, dockLeft - 24)),
          visibility: dockLeft > 60 ? 'visible' : 'hidden',
        }}>
          <ProfileCard
            progress={progress}
            wallet={wallet}
            onOpen={() => setPanel('tavern')}
          />
        </div>
      )}

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
      {/* ⚠️ DÜELLONUN KENDİ DÖKÜMÜ. Gold dökümünü göstermek "+0 GOLD" yazan
          bir ekran olurdu — oyuncu düelloyu kazandığı hâlde başarısız
          olduğunu sanırdı. Farklı ödeyen mod, farklı ekran. */}
      {payout?.duel && (
        <div onClick={() => setPayout(null)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.86)', zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${dockH + 20}px 20px 20px` }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass(16), padding: 22, width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2.4, color: C.blood, marginBottom: 5 }}>
              THE ANSWERING
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 4,
              color: payout.duel.won ? C.candle : '#e4657a' }}>
              {payout.duel.won ? 'You went deeper' : 'You fell short'}
            </div>
            <div style={{ fontSize: 12.5, color: C.boneFaint, marginBottom: 16, lineHeight: 1.5 }}>
              Depth <b style={{ color: C.bone }}>{payout.duel.depth}</b> against
              their <b style={{ color: C.bone }}>{payout.duel.target}</b>
              {' — '}same seed, same enemies.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...glass(9), padding: '10px 14px', minWidth: 96 }}>
                <span style={{ display: 'block', fontSize: 9, letterSpacing: 1.4, color: C.boneFaint }}>STANDING</span>
                <span style={{ display: 'block', fontSize: 20, fontWeight: 900, color: C.bone }}>
                  {payout.duel.rating}
                </span>
                <span style={{ fontSize: 11, fontWeight: 900,
                  color: payout.duel.delta >= 0 ? C.ok : C.bloodSoft }}>
                  {payout.duel.delta >= 0 ? '+' : ''}{payout.duel.delta}
                </span>
              </span>
              <span style={{ ...glass(9), padding: '10px 14px', minWidth: 96 }}>
                <span style={{ display: 'block', fontSize: 9, letterSpacing: 1.4, color: C.boneFaint }}>DUST</span>
                <span style={{ display: 'block', fontSize: 20, fontWeight: 900,
                  color: payout.duel.dust > 0 ? C.candle : C.boneFaint }}>
                  +{payout.duel.dust}
                </span>
                {/* ⚠️ Toz 0 ise SEBEBİ yazılmalı: oyuncu kazandığı hâlde toz
                    gelmeyince "bozuk" sanar. */}
                <span style={{ fontSize: 10, color: C.boneFaint }}>
                  {payout.duel.won
                    ? (payout.duel.dust > 0 ? 'today’s reward' : 'daily cap reached')
                    : 'wins only'}
                </span>
              </span>
            </div>

            {/* ⚠️ Kırpılmış koşu düello KAZANAMAZ ve bu SESSİZ KALMAMALI */}
            {payout.duel.capped && (
              <div style={{ marginTop: 12, padding: '9px 11px', borderRadius: 8,
                background: 'rgba(160,18,38,0.14)', border: `1px solid ${C.bad}55`,
                fontSize: 11.5, color: '#e4657a', lineHeight: 1.5 }}>
                Your claim did not fit the time you spent, so it was not counted.
              </div>
            )}

            <PixelButton variant={BTN.strong} scale={3} onClick={() => setPayout(null)}
              style={{ marginTop: 18, width: '100%', fontSize: 13, letterSpacing: 0.6 }}>
              BACK TO THE VILLAGE
            </PixelButton>
          </div>
        </div>
      )}

      {/* ⚠️ WILDERNESS'IN KENDİ DÖKÜMÜ. Gold dökümünü göstermek "+0 GOLD"
          yazan bir ekran olurdu — oyuncu ödülünü aldığı hâlde başarısız
          olduğunu sanırdı. Farklı ödeyen mod, farklı ekran. */}
      {payout?.wilderness && (
        <div onClick={() => setPayout(null)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.86)', zIndex: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${dockH + 20}px 20px 20px` }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass(16), padding: 22, width: '100%', maxWidth: 460, maxHeight: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 2.4, color: C.ice, marginBottom: 5 }}>
              THE WILDERNESS
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 4,
              color: payout.wilderness.extracted ? C.bone : '#e4657a' }}>
              {payout.wilderness.extracted ? 'You walked out' : 'You did not come back'}
            </div>
            <div style={{ fontSize: 12, color: C.boneFaint, marginBottom: 14, lineHeight: 1.5 }}>
              {payout.wilderness.extracted
                ? `Depth ${payout.wilderness.depth}. Everything below is yours.`
                : 'Whatever you were carrying stayed down there. That was the deal.'}
            </div>

            {payout.wilderness.items.length === 0 ? (
              <div style={{ fontSize: 12, color: C.boneDim, lineHeight: 1.6 }}>
                {payout.wilderness.extracted
                  ? `You came back empty — gear only drops every ${GEAR.everyDepths} depths.`
                  : 'Nothing to show for it.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {payout.wilderness.items.map((it) => {
                  const r = rarityOf(it.rarity);
                  return (
                    <div key={it.id} style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
                      borderRadius: 8, border: `1px solid ${r.color}55`,
                      background: `linear-gradient(180deg, ${r.color}1c, rgba(0,0,0,0.3))`,
                      textAlign: 'left',
                    }}>
                      <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: r.color }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 900, color: r.color }}>
                          {r.name} {SLOT_NAME[it.slot]}
                        </span>
                        <span style={{ display: 'block', fontSize: 10.5, color: C.boneFaint, lineHeight: 1.4 }}>
                          {it.affixes.map(affixText).join(' · ')}
                        </span>
                      </span>
                      <span style={{ fontSize: 10, color: C.boneFaint, whiteSpace: 'nowrap' }}>d{it.depth}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ⚠️ Çantaya sığmayanlar SESSİZ KALMAZ. "Bulmuştum ama yok"
                şikâyetinin tek panzehiri bunu koşunun hemen sonunda söylemek. */}
            {payout.wilderness.dropped > 0 && (
              <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8,
                background: 'rgba(160,18,38,0.14)', border: `1px solid ${C.bad}55`,
                fontSize: 11.5, color: '#e4657a', lineHeight: 1.5 }}>
                {payout.wilderness.dropped} more piece{payout.wilderness.dropped > 1 ? 's were' : ' was'} left
                behind — your vault is full. Break something down before you go out again.
              </div>
            )}

            <PixelButton variant={BTN.strong} scale={3} onClick={() => setPayout(null)}
              style={{ marginTop: 16, width: '100%', fontSize: 13, letterSpacing: 0.6 }}>
              BACK TO THE VILLAGE
            </PixelButton>
          </div>
        </div>
      )}

      {payout && !payout.wilderness && !payout.duel && (
        <div onClick={() => setPayout(null)}
          style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '78px 20px 20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass(16), padding: 24, width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 6 }}>THE VILLAGE SETTLES UP</div>
            <Reveal>
              <div style={{ fontSize: 38, fontWeight: 900, color: C.candle, marginBottom: 14 }}>
                +{odemeToplam.toLocaleString('en-US')} <span style={{ fontSize: 16 }}>GOLD</span>
              </div>
            </Reveal>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, textAlign: 'left' }}>
              <Row
                label={payout.paidRange
                  ? `New depths ${payout.paidRange.from + 1}–${payout.paidRange.to}`
                  : payout.mode === 'descent'
                    ? (payout.deepestCleared === 0 ? 'No depth cleared' : 'No new depths')
                    // ⚠️ ÜÇ AYRI DURUM, ÜÇ AYRI CÜMLE. Kampanyada 0 gold'un
                    // iki sebebi var ve ikisi bambaşka: ya bölümü BİTİREMEDİN
                    // ya da ilk-geçiş ödülünü DAHA ÖNCE aldın. Tek cümleye
                    // indirmek, ilk koşusunda ölen yeni oyuncuya "zaten
                    // aldın" dedirtiyordu.
                    : payout.cleared ? 'First clear' : 'Stage unfinished'}
                value={payout.progressGold}
                hint={payout.progressGold > 0 ? undefined
                  : payout.mode === 'descent'
                    ? (payout.deepestCleared === 0
                        ? 'you left before clearing depth 1'
                        : 'you have been this deep before — go deeper')
                    : payout.cleared
                      ? 'already claimed — replay pays nothing'
                      : 'the stage pays when you finish it — try again'}
              />
              {/* ⚠️ ETKİNLİK PAYI `dropGold`'un İÇİNDE, yanında değil. Ayrı bir
                  satır olarak gösterip toplama da eklemek, oyuncuya olmayan
                  bir gold saydırırdı. Bu yüzden "Rare finds" TAM tutarı yazıyor,
                  bonus onun altında bir AÇIKLAMA satırı olarak duruyor. */}
              <Row label="Rare finds" value={payout.dropGold}
                hint={payout.dropGold === 0 ? 'nothing dropped this run' : undefined} />
              {payout.eventGold > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginTop: -3, paddingLeft: 10, fontSize: 11,
                }}>
                  <span style={{ color: C.candle }}>↳ weekend event</span>
                  <span style={{ color: C.candle, fontWeight: 900 }}>
                    {payout.eventGold} of that
                  </span>
                </div>
              )}
            </div>

            {/* ── AÇILAN SİLAH ──
                ⚠️ EN ÜSTTE ve GOLD SATIRLARINDAN AYRI. Bir silah kazanmak
                bu ekrandaki en büyük olay; gold dökümünün arasına sıkışsaydı
                oyuncu kaçırırdı. Kilit sisteminin işe yaramasının şartı
                kazanımın GÖRÜNMESİ (bkz. game/unlocks.ts). */}
            {payout.unlocked.length > 0 && (
              <div style={{
                marginTop: 14, padding: '12px 13px', borderRadius: 9,
                background: 'linear-gradient(180deg, rgba(239,167,46,0.18), rgba(0,0,0,0.28))',
                border: `1px solid ${C.candle}77`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: C.candle }}>
                  {payout.unlocked.length > 1 ? 'NEW WEAPONS' : 'NEW WEAPON'}
                </div>
                {payout.unlocked.map((id) => (
                  <div key={id} style={{ fontSize: 15, fontWeight: 900, color: C.bone, marginTop: 5 }}>
                    {weaponName(id)}
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 6, lineHeight: 1.5 }}>
                  It will start appearing when you level up.
                </div>
              </div>
            )}

            {/* ⚠️ BAHİS AYRI KUTUDA. Yukarıdaki satırlar GOLD sayıyor; bahis
                toz ödüyor. Aynı listeye koymak "+45" satırını gold sanmaya
                yol açardı — oyuncunun kazandığı şeyi yanlış okuması en kötü
                arayüz hatasıdır. */}
            {payout.wager && (
              <div style={{
                marginTop: 12, padding: '11px 12px', borderRadius: 8,
                background: payout.wager.won ? 'rgba(138,151,163,0.12)' : 'rgba(160,18,38,0.12)',
                border: `1px solid ${payout.wager.won ? 'rgba(138,151,163,0.4)' : 'rgba(160,18,38,0.34)'}`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>
                  THE WAGER · DEPTH {payout.wager.target}
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, marginTop: 4,
                  color: payout.wager.won ? C.ice : C.bloodSoft }}>
                  {payout.wager.won
                    ? `+${payout.wager.dust} dust`
                    : `${payout.wager.stake.toLocaleString('en-US')} gold lost`}
                </div>
                <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 3, lineHeight: 1.4 }}>
                  {payout.wager.won
                    ? 'You went deeper than you ever had. The dead paid up.'
                    : 'You did not get past your own record. The stake stays down there.'}
                </div>
              </div>
            )}
            <PixelButton variant={BTN.strong} scale={3} onClick={() => setPayout(null)}
              style={{ marginTop: 18, width: '100%', fontSize: 13, letterSpacing: 0.6 }}>
              CONTINUE
            </PixelButton>
          </div>
        </div>
      )}

      {acik && (
        // ⚠️ ÜST BOŞLUK ÖLÇÜLÜR, SABİT DEĞİL. Eskiden 78 px yazıyordu ve tek
        // satırlık navbar'a göre ölçülmüştü; 9. düğme satırı sardırınca rıhtım
        // (zIndex 6) panelin (zIndex 5) ilk 31 pikselini örttü ve oradaki
        // tıklamalar rıhtımın son düğmesine gitti — oyuncu karakter seçerken
        // kendini Settings'te buluyordu.
        <div onClick={() => setPanel(null)}
          style={{
            position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(10,8,6,0.84)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: `${dockH + 24}px 20px 20px`, overflowY: 'auto',
            // ⚠️ KAPANAN PANEL TIKLAMA ALMAZ. Almasaydı kapanış animasyonu
            // sürerken ekrana yapılan ilk tıklama köye değil ölmekte olan
            // panele giderdi.
            pointerEvents: panel ? 'auto' : 'none',
            opacity: panel ? 1 : 0,
            transition: `opacity ${PANEL_KAPANIS_MS}ms ease-out`,
          }}>
          {/* ⚠️ `alignItems: center` DEĞİL `flex-start`. Ortalamak, içeriği
              boşluktan uzun panellerde yukarı taşırıyordu: padding 99 px olsa
              bile panel 65 px'te başlıyor ve rıhtımın altına giriyordu.
              Hizalama üstten olunca panel boşluğun ALTINDA kalmayı garanti
              ediyor; maxHeight de ölçülen rıhtıma göre. */}
          {/* ⚠️ ÇERÇEVE ve GENİŞLİK ETKİN id'den okunur (`panel ?? kapanan`).
              Yalnız `panel` okunsaydı kapanış sırasında panel varsayılan
              çerçeveye ve 560 px'e ATLAR, sonra sönerdi — geçiş bir hataya
              benzerdi. */}
          <Panel variant={PANEL_CERCEVE[acik] || '07A'} scale={3} pad={6} onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: PANEL_GENISLIK[acik] || 560,
              animation: panel ? undefined : `gb-panel-out ${PANEL_KAPANIS_MS}ms ease-out both`,
              // ⚠️ `dockH` ÖLÇÜLEN değer, sabit sayı DEĞİL — 78 px sabiti
              // 9. düğme satırı sardırınca panelin ilk 31 pikselini örtmüştü.
              maxHeight: `calc(100vh - ${dockH + 48}px)`,
              overflowY: 'auto',
            }}>
            {/* Panel içinde ikinci bir bina sırası YOK — navbar panelin üstünde
                (zIndex 6) ve açıkken de tıklanabilir kalıyor. İki sıra hem
                gereksizdi hem panelin içinde sarıp dağınık duruyordu. */}
            {acik === 'quests' ? (
              <StageSelect
                progress={progress}
                onHero={pickHero}
                onPick={beginStage}
                wilderness={!!wallet}
              />
            ) : acik === 'upgrade' ? (
              <ForgePanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : acik === 'settings' ? (
              <SettingsPanel onError={setNote} />
            ) : acik === 'boss' ? (
              <WorldBossPanel onEnter={beginBoss} />
            ) : acik === 'reliquary' ? (
              <ReliquaryPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : acik === 'gear' ? (
              <GearPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : acik === 'watch' ? (
              <FollowPanel onChallenge={beginDuel} onError={setNote} />
            ) : acik === 'daily' ? (
              <QuestPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : acik === 'duel' ? (
              <DuelPanel
                hero={(progress ?? loadProgress()).hero}
                onHero={pickHero}
                onChallenge={beginDuel}
                onError={setNote}
              />
            ) : acik === 'paths' ? (
              <SkillPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : acik === 'guild' ? (
              <GuildPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : acik === 'tavern' ? (
              <RecordsPanel progress={progress ?? loadProgress()} onChange={setProgress} onError={setNote} />
            ) : acik === 'market' ? (
              <MarketPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
              />
            ) : acik === 'pets' ? (
              <PetPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
                onError={setNote}
              />
            ) : acik === 'shop' ? (
              <StallPanel
                progress={progress ?? loadProgress()}
                onChange={setProgress}
              />
            ) : (
              <ComingSoon id={acik} />
            )}

            {/* ── KAPAT ──
                ⚠️ TAM GENİŞLİKTE KIRMIZI BİR ÇUBUKTU ve panelin EN BASKIN
                öğesiydi — market ekranda görüldüğünde ilanlardan bile önce
                göze çarpıyordu. Hiyerarşi ters: kapatmak panelin en önemli
                eylemi değil, en sıradanı.
                ⚠️ Sözlüğe göre de yanlıştı: `02A` = BTN.strong, yani
                "geri dönüşsüz / ağır eylem". Panel kapatmak ikisi de değil.
                Artık BTN.action ve içeriğe göre ölçülü genişlikte.
                ⚠️ Kolay vurulur kalıyor (240 px, ortada) — küçültmek
                erişilebilirlikten çalmak olurdu. */}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <PixelButton variant={BTN.action} scale={2} onClick={() => setPanel(null)}
                style={{ minWidth: 240, fontSize: 12, letterSpacing: 1.5 }}>
                CLOSE
              </PixelButton>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/**
 * Koşuya giren toplam bonus: Forge + tılsımlar + lonca.
 *
 * ⚠️ LONCA BONUSU BİLETTEN OKUNUR, kayıttan değil. Kayıttaki lonca koşu
 * sırasında değişebilir (biri seviye yükseltir, biri ayrılır); koşunun bonusu
 * BAŞLADIĞI andaki bonus olmalı — ve o anı sunucu mühürledi.
 */
function runBonus(upgrades: Record<string, number>, ticket: RunTicket) {
  let b = mergeBonus(permanentBonus(upgrades), charmBonus(ticket.charms));
  // ⚠️ Ekipman da AYNI kanaldan giriyor — motor ekipmanı bilmiyor bile.
  // Motorda tek satır değişmediği için determinizm mührü de bozulmuyor.
  b = mergeBonus(b, ticket.gear);
  // ⚠️ Beceri ağacı da aynı kanaldan — dördüncü kaynak, sıfır motor değişikliği.
  b = mergeBonus(b, ticket.skills);
  return ticket.guildGrowth > 0 ? mergeBonus(b, { growth: ticket.guildGrowth }) : b;
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

function StageSelect({ progress, onPick, onHero, wilderness }: {
  progress: Progress | null;
  onPick: (id: number, mode: RunKind, startDepth?: number, ascension?: number) => void;
  onHero: (id: string) => void;
  /**
   * ⚠️ The Wilderness DEMO'DA KAPALI ve bu bir süsleme kararı değil:
   * ekipman SUNUCUDA üretiliyor, demoda hiç üretilmiyor. Kapı açık kalsaydı
   * demo koşusu `applyRunResult`'a düşer ve wilderness GOLD ÖDERDİ — yani
   * modun tek kuralı ("gold ödemez") demoda tersine dönerdi.
   */
  wilderness: boolean;
}) {
  const p = progress ?? loadProgress();
  return (
    <>
      <PanelHead
        kicker="THE WARDEN'S POST" accent={C.blood}
        title="Choose your road"
        sub={<>Clear a stage once for its reward. Then the Descent opens beneath it — an endless
          ladder where every new depth pays, and no depth pays twice.</>}
      />

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
              bestDepth={best} onPick={onPick} wilderness={wilderness}
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
function StageCard({ stage: s, locked, cleared, claimed, bestDepth, onPick, wilderness }: {
  stage: (typeof STAGES)[number];
  locked: boolean;
  cleared: boolean;
  claimed: boolean;
  bestDepth: number;
  onPick: (id: number, mode: RunKind, startDepth?: number, ascension?: number) => void;
  wilderness: boolean;
}) {
  // Taban süre: düşmanlar spawn hızından çabuk sahneye çıkamaz, hepsi ölmeden
  // bölüm bitmez. Gerçek koşu bundan uzun sürer — "en az" diyoruz.
  const tabanSn = Math.round(s.enemyCount / s.spawnRate);
  // hpMul 1 → 14 aralığında; beş kademeye indiriyoruz
  const zorluk = Math.max(1, Math.min(5, Math.ceil(Math.log(s.hpMul) / Math.log(1.72) + 1)));
  const derinlikOdemesi = depthGold(s.id, bestDepth + 1);
  const derinlikZorlugu = challengeRating(s.id, bestDepth + 1) / Math.max(1, challengeRating(s.id, 1));
  // Checkpoint = geçilmiş en derin boss basamağı; koşu onun BİR ALTINDAN başlar
  const kontrolNoktasi = checkpointFor(bestDepth);
  const devamDerinligi = kontrolNoktasi + 1;
  const baslangicSeviyesi = startLevelFor(devamDerinligi);
  // ⚠️ Kilit oyuncunun ULAŞTIĞI derinlikten türüyor, seçtiğinden değil.
  // Sunucu da aynı fonksiyonu çalıştırıyor (`resolveAscension`) — kural iki
  // yerde YAZILMADI, iki yerde ÇAĞRILDI.
  const enYuksekKademe = maxAscensionFor(bestDepth);
  const [kademe, setKademe] = useState(0);

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
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(160,18,38,0.10), rgba(0,0,0,0.20))',
        }}>
          <div style={{ padding: '10px 13px 0' }}>
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
          </div>

          {/* ── ASCENSION ──
              Ölçüldü: Forge yarıya geldiği anda 21 koşunun 21'i 30 dakika
              tavanına çarpıyor — koşuyu bitiren ölüm değil SAAT. Bu seçici
              o duvarı kaldırıyor: zorluk Forge'un satın alabildiğinin
              ötesine çıkabiliyor.
              ⚠️ Kilitli kademe GÖSTERİLMİYOR ama kaç kaldığı yazıyor —
              görünmeyen bir sistem hedef olamaz. */}
          {enYuksekKademe > 0 ? (
            <div style={{ padding: '8px 13px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, color: C.ice }}>
                  ASCENSION
                </span>
                {Array.from({ length: enYuksekKademe + 1 }, (_, i) => (
                  <button key={i} onClick={() => setKademe(i)}
                    title={i === 0 ? 'Standard descent' :
                      `Enemies ×${ascensionHpMul(i).toFixed(1)} health, ×${ascensionDamageMul(i).toFixed(2)} damage, +${Math.round((ascensionDropMul(i) - 1) * 100)}% drop value`}
                    style={{
                      all: 'unset', cursor: 'pointer', minWidth: 20, padding: '2px 7px',
                      borderRadius: 5, textAlign: 'center', fontSize: 11, fontWeight: 900,
                      fontFamily: FONT.ui,
                      color: kademe === i ? '#1a0508' : C.boneDim,
                      background: kademe === i
                        ? `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`
                        : 'rgba(227,216,192,0.07)',
                      border: `1px solid ${kademe === i ? C.candle : 'rgba(227,216,192,0.14)'}`,
                    }}>
                    {i}
                  </button>
                ))}
                {enYuksekKademe < ASCENSION.max && (
                  <span style={{ fontSize: 10, color: C.boneFaint }}>
                    next at depth {ascensionUnlockDepth(enYuksekKademe + 1)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: kademe > 0 ? C.bloodSoft : C.boneFaint, marginTop: 5, lineHeight: 1.45 }}>
                {kademe === 0
                  ? 'Standard descent. Raise this once the clock, not the enemies, is what stops you.'
                  : `Enemies ×${ascensionHpMul(kademe).toFixed(1)} health, ×${ascensionDamageMul(kademe).toFixed(2)} damage and ×${(1 + ASCENSION.countPer * kademe).toFixed(2)} in number · drops worth +${Math.round((ascensionDropMul(kademe) - 1) * 100)}% · counts far higher on the board`}
              </div>
            </div>
          ) : (
            <div style={{ padding: '8px 13px 0', fontSize: 10.5, color: C.boneFaint, lineHeight: 1.45 }}>
              Reach depth {ascensionUnlockDepth(1)} to unlock Ascension — harder descents that count for more.
            </div>
          )}

          {/* ── Nereden başlanacak ──
              Checkpoint yoksa (hiç boss derinliği geçilmemişse) tek düğme
              kalır — ortada seçim yokken iki düğme göstermek kullanıcıya
              olmayan bir karar verdirmek olurdu. */}
          <div style={{ display: 'flex', gap: 7, padding: '9px 13px 12px', flexWrap: 'wrap' }}>
            <DescentStart
              label={kontrolNoktasi > 0 ? `RESUME · DEPTH ${devamDerinligi}` : 'ENTER · DEPTH 1'}
              hint={kontrolNoktasi > 0
                ? `Start at the last checkpoint with level ${baslangicSeviyesi} to draft`
                : 'Clear a boss depth to unlock a checkpoint'}
              primary
              onClick={() => onPick(s.id, 'descent', devamDerinligi, kademe)}
            />
            {kontrolNoktasi > 0 && (
              <DescentStart
                label="FROM THE TOP"
                hint="Depth 1 · build from nothing"
                onClick={() => onPick(s.id, 'descent', 1, kademe)}
              />
            )}
          </div>

          {wilderness && (
          <>
          {/* ── THE WILDERNESS ──
              ⚠️ AYRI BİR KUTU, üçüncü bir düğme DEĞİL. Descent'in yanına
              sıradan bir düğme koymak onu "başka bir başlangıç derinliği"
              gibi gösterirdi; oysa kuralları tamamen farklı: gold ödemez,
              checkpoint yoktur, ve ÖLÜRSEN HİÇBİR ŞEY ALAMAZSIN. Farklı
              kurallar farklı bir kapıdan girilmeli. */}
          <div style={{
            margin: '0 13px 13px', padding: '10px 12px', borderRadius: 9,
            border: '1px solid rgba(138,151,163,0.34)',
            background: 'linear-gradient(180deg, rgba(138,151,163,0.10), rgba(0,0,0,0.30))',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, color: C.ice }}>
                THE WILDERNESS
              </span>
              <span style={{ fontSize: 10.5, color: C.boneFaint }}>no gold · no checkpoint</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.5, margin: '5px 0 8px' }}>
              Gear drops every {GEAR.everyDepths} depths. Nothing you find is
              yours until you walk out — <b style={{ color: '#e4657a' }}>die down
              there and you come back with nothing</b>.
            </div>
            <button onClick={() => onPick(s.id, 'wilderness', 1, 0)}
              style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
                padding: '8px 11px', borderRadius: 7, textAlign: 'center',
                background: 'linear-gradient(180deg, rgba(138,151,163,0.30), rgba(60,70,80,0.24))',
                border: '1px solid rgba(138,151,163,0.5)',
                fontSize: 11.5, fontWeight: 900, letterSpacing: 1, color: C.bone }}>
              GO OUT
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Descent giriş düğmesi. İki seçenek de aynı görsel dili konuşsun diye ayrı
 * bileşen — biri "kaldığın yerden", diğeri "baştan".
 */
function DescentStart({ label, hint, primary, onClick }: {
  label: string;
  hint: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      style={{ all: 'unset', flex: '1 1 150px', boxSizing: 'border-box', cursor: 'pointer',
        padding: '9px 11px', borderRadius: 7,
        background: primary
          ? 'linear-gradient(180deg, rgba(160,18,38,0.42), rgba(120,12,28,0.30))'
          : 'rgba(255,255,255,0.05)',
        border: `1px solid ${primary ? 'rgba(228,101,122,0.55)' : 'rgba(255,255,255,0.12)'}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 0.8,
        color: primary ? '#ffd9df' : C.bone }}>{label}</div>
      <div style={{ fontSize: 10, color: C.boneFaint, marginTop: 3, lineHeight: 1.35 }}>{hint}</div>
    </button>
  );
}

// Kapalı binalar. "Coming soon" tek başına oyuncuya hiçbir şey söylemiyordu;
// burada NE olacağı ve NİYE kapalı olduğu yazıyor.
// ⚠️ Hiçbir yerde "swap gold for $GRAVE" DEMİYORUZ: hazine sabit kurdan alım
// yaparsa oyun token BASMIŞ olur ve sıfır-emisyon sözü çöker. İkisi de P2P.
const LOCKED: Record<string, { kicker: string; title: string; body: string; bullets: string[]; gate: string; accent?: string }> = {
  // ⚠️ `shop` ARTIK BURADA DEĞİL — StallPanel canlı.
  // ⚠️ `market` ARTIK BURADA DEĞİL — MarketPanel canlı (listeleme + escrow +
  // iptal çalışıyor, sadece satın alma tarafı token bekliyor).
  exchange: {
    kicker: 'THE EXCHANGE', title: 'Not yet trading', accent: C.ice,
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
      <PanelHead kicker={l.kicker} accent={l.accent ?? C.blood} title={l.title} sub={l.body} />
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
