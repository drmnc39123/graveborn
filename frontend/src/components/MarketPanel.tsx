'use client';
// THE MARKETPLACE — oyuncudan oyuncuya gold ↔ $GRAVE.
//
// ⚠️ EV TAKASI DEĞİL. Hazine sabit kurdan gold almaz; token DAİMA başka bir
// oyuncunun cüzdanından gelir. Panel hiçbir yerde "swap" demez.
//
// ⚠️ Fiyat METİN olarak taşınır. Token en küçük birimi 2^53'ü kolayca aşar;
// Number'a çevirmek sessizce yuvarlar. `Number()` yalnızca EKRANA yazarken
// ve SIRALARKEN kullanılır — fiyatın kendisiyle asla işlem yapılmaz.
//
// ── BU SÜRÜMDE NE DEĞİŞTİ ──
// Panel 560 px'de tek sütundu: fiyat, miktar, birim fiyat, satıcı ve eylem
// alt alta diziliyordu ve KIYASLAMA — bir marketin tek işi — imkânsızdı.
// Artık 1100 px, iki sekme, istatistik şeridi, sıralama ve filtre var.
//
// ⚠️ HACİM / FİYAT GRAFİĞİ / SON SATIŞLAR BİLEREK YOK. `buy` ucu token
// yokluğundan 503 dönüyor; yani hiç satış olmadı ve token gelene kadar
// olmayacak. O panelleri şimdi çizmek sonsuza kadar sıfır gösteren bir
// grafik demekti — Exchange'e OpenSea görünümü vermekle aynı yalan.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BTN, Icon, PixelButton } from '@/components/ui/kit';
import {
  cancelGoldListing, fetchListings, fetchMyListings, listGold,
  marketAvailable, type Listing,
} from '@/lib/gameSession';
import type { Progress } from '@/game/progress';
import { Card, PanelHead, Tag } from '@/components/ui/cards';
import { Fade } from '@/components/ui/motion';
import { play } from '@/game/sfx';
import { isTestMode, TEST_LISTINGS, TEST_MY_LISTINGS } from '@/lib/testMode';
import { C, glass } from '@/lib/theme';

/**
 * ⚠️ YEDEK DEĞERLER — gerçeği sunucudan geliyor (`/market/listings`).
 * Eskiden burada ELLE KOPYALANMIŞ sabitlerdi; sunucu değişince panel
 * sessizce yalan söylerdi ("min 50" yazıp 100 istemek).
 */
const VARSAYILAN_MIN_GOLD = 50;
const VARSAYILAN_MAX_ILAN = 10;

/**
 * ⚠️ İSTEMCİ SIRALAMASININ SINIRI. `listActive` en yeni 100 kaydı döndürüyor
 * ve sıralama burada yapılıyor. Aktif ilan bu sayıyı aşarsa "en ucuz"
 * yalnızca son 100'ün en ucuzu olur — yani YANLIŞ. O eşikte sıralama
 * sunucuya taşınmalı; panel eşiğe gelince uyarıyor.
 */
const ISTEMCI_SIRALAMA_SINIRI = 100;

/** Cüzdan adresini kısalt — tam adres yer kaplıyor, kimlik için 8 hane yeter */
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/**
 * BİRİM FİYAT — SAYISAL. Sıralama ve "en iyi fiyat" bununla hesaplanıyor.
 *
 * ⚠️ Sonuç yalnızca EKRAN ve SIRALAMA için. Fiyatın kendisi her katmanda
 * metin/BigInt kalır; bu değerle ödeme yapılmaz, sunucuya gönderilmez.
 * ⚠️ Bozuk veri sonsuz döner → sıralamada en sona düşsün diye `Infinity`.
 */
function unitPriceOf(goldAmount: number, priceGrave: string): number {
  const p = Number(priceGrave);
  if (!Number.isFinite(p) || goldAmount <= 0) return Infinity;
  return p / goldAmount;
}

/**
 * BİRİM FİYAT — METİN.
 *
 * ⚠️ "2.500 gold / 12.000 $GRAVE" ile "800 gold / 3.900 $GRAVE" yan yana
 * durunca hangisinin ucuz olduğu görünmüyor; oyuncunun kafadan bölmesi
 * gerekiyordu. Bir emir defterinin tek işi karşılaştırma sunmaktır.
 */
function unitPrice(goldAmount: number, priceGrave: string): string {
  return perGold(unitPriceOf(goldAmount, priceGrave));
}

/**
 * Ham birim fiyatı yazıya çevirir.
 *
 * ⚠️ AYRI BİR FONKSİYON, çünkü "en iyi fiyat" istatistiği elinde zaten
 * hesaplanmış bir sayı tutuyor. Onu biçimlendirmek için `unitPrice(1, "0.0021")`
 * yazmak işe yarıyordu ama okunmuyordu — bir sonraki okuyan "neden 1 gold?"
 * diye durur. Üç kademeli hassasiyet tek yerde.
 */
function perGold(per: number): string {
  if (!Number.isFinite(per)) return '—';
  if (per >= 100) return `${Math.round(per).toLocaleString('en-US')} per gold`;
  if (per >= 1) return `${per.toFixed(2)} per gold`;
  return `${per.toFixed(4)} per gold`;
}

type Sira = 'ucuz' | 'pahali' | 'yeni' | 'buyuk';

const SIRA_ETIKET: Record<Sira, string> = {
  ucuz: 'BEST PRICE',
  pahali: 'HIGHEST',
  yeni: 'NEWEST',
  buyuk: 'LARGEST',
};

/** Emir defteri satırı — hem kendi ilanlarım hem açık ilanlar aynı kartı kullanır */
function ListingRow({ listing: l, mine = false, action }: {
  listing: Listing;
  mine?: boolean;
  action: React.ReactNode;
}) {
  return (
    <Card accent={mine}>
      <div style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, fontSize: 14, color: mine ? C.candle : C.bone }}>
              {l.goldAmount.toLocaleString('en-US')} GOLD
            </span>
            <span style={{ fontSize: 11.5, color: C.boneDim }}>
              for {Number(l.priceGrave).toLocaleString('en-US')} $GRAVE
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
            <Tag tone="gold">{unitPrice(l.goldAmount, l.priceGrave)}</Tag>
            {!mine && <span style={{ fontSize: 10, color: C.boneFaint }}>{short(l.seller)}</span>}
            {mine && <Tag>IN ESCROW</Tag>}
          </div>
        </div>
        {action}
      </div>
    </Card>
  );
}

/** İstatistik kutusu — şeritteki dört sayı aynı kalıptan */
function Stat({ ikon, etiket, deger, vurgu = false }: {
  ikon: 'gold' | 'urn' | 'star' | 'skull';
  etiket: string;
  deger: string;
  vurgu?: boolean;
}) {
  return (
    <div style={{
      ...glass(9), flex: '1 1 150px', minWidth: 0, padding: '9px 11px',
      border: `1px solid ${vurgu ? `${C.candle}55` : C.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <Icon name={ikon} scale={1} dim={!vurgu} />
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint }}>
          {etiket}
        </span>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 900, color: vurgu ? C.candle : C.bone,
        fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {deger}
      </div>
    </div>
  );
}

/** Sunucu hata kodları oyuncuya İngilizce anlatılır */
function errSozluk(minGold: number, maxIlan: number): Record<string, string> {
  return {
    yetersiz_gold: 'Not enough gold — some of it may already be listed.',
    gecersiz_miktar: `Minimum listing is ${minGold} gold, whole numbers only.`,
    gecersiz_fiyat: 'Set a price above zero.',
    ilan_siniri: `You can hold ${maxIlan} active listings at a time.`,
    ilan_yok: 'That listing is no longer active.',
    token_yok: '$GRAVE has not launched yet — buying opens with the token.',
    oturum_yok: 'Connect your wallet to trade.',
  };
}

export function MarketPanel({
  progress, onChange,
}: {
  progress: Progress;
  onChange: (p: Progress) => void;
}) {
  // ⚠️ Test modunda satış formu da AÇILIYOR — yoksa panelin yarısı
  // ("connect a wallet") görülemez ve görsel iş körlemesine yapılır.
  // Bu bir açık DEĞİL: düğmeye basmak sunucudan 401 alır, kapı orada.
  const canTrade = marketAvailable() || isTestMode();

  const [book, setBook] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [escrow, setEscrow] = useState(0);
  const [tokenLive, setTokenLive] = useState(false);
  const [minGold, setMinGold] = useState(VARSAYILAN_MIN_GOLD);
  const [maxIlan, setMaxIlan] = useState(VARSAYILAN_MAX_ILAN);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sekme, setSekme] = useState<'browse' | 'sell'>('browse');
  const [sira, setSira] = useState<Sira>('ucuz');
  const [enAz, setEnAz] = useState('');
  const [enCok, setEnCok] = useState('');
  const [kendiminiGizle, setKendiminiGizle] = useState(false);

  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');

  const ERR = useMemo(() => errSozluk(minGold, maxIlan), [minGold, maxIlan]);
  const humanise = useCallback((e: unknown) => {
    const code = e instanceof Error ? e.message : String(e);
    return ERR[code] ?? 'Something went wrong. Try again.';
  }, [ERR]);

  const refresh = useCallback(async () => {
    // ⚠️ Test modunda sunucuya HİÇ gidilmiyor; sahte defter çiziliyor.
    // Şekil `Listing` ile birebir, birim fiyatlar kasıtlı dağınık —
    // hepsi aynı olsaydı sıralama düğmeleri hiçbir şey değiştirmez ve
    // "çalışıyor" diye yanlış izlenim verirdi.
    if (isTestMode()) {
      setBook(TEST_LISTINGS as unknown as Listing[]);
      setMine(TEST_MY_LISTINGS.listings as unknown as Listing[]);
      setEscrow(TEST_MY_LISTINGS.escrowedGold);
      setLoading(false);
      return;
    }
    try {
      const [b, m] = await Promise.all([fetchListings(), fetchMyListings()]);
      setBook(b.listings);
      setTokenLive(b.tokenEnabled);
      if (b.minGold) setMinGold(b.minGold);
      if (b.maxListings) setMaxIlan(b.maxListings);
      setMine(m.listings.filter((l) => l.status === 'active'));
      setEscrow(m.escrowedGold);
    } catch {
      setErr('Could not reach the market.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── İSTATİSTİKLER — aktif ilanlardan türetilir, yeni uç gerekmez ──
  // ⚠️ Hacim ve fiyat geçmişi BİLEREK yok (dosya başlığı): satış olmadan
  // ikisi de sonsuza kadar sıfır gösterir.
  const istatistik = useMemo(() => {
    if (book.length === 0) return null;
    let enUcuz = Infinity;
    let toplamGold = 0;
    for (const l of book) {
      const u = unitPriceOf(l.goldAmount, l.priceGrave);
      if (u < enUcuz) enUcuz = u;
      toplamGold += l.goldAmount;
    }
    return { enUcuz, toplamGold, adet: book.length };
  }, [book]);

  const gorunen = useMemo(() => {
    const az = Number(enAz), cok = Number(enCok);
    const out = book.filter((l) => {
      if (kendiminiGizle && mine.some((m) => m.id === l.id)) return false;
      if (enAz && Number.isFinite(az) && l.goldAmount < az) return false;
      if (enCok && Number.isFinite(cok) && l.goldAmount > cok) return false;
      return true;
    });
    // ⚠️ Kopya üzerinde sıralanıyor — `book` state'i yerinde sıralamak
    // React'in değişmezlik varsayımını kırar.
    return [...out].sort((a, b) => {
      if (sira === 'yeni') return b.createdAt.localeCompare(a.createdAt);
      if (sira === 'buyuk') return b.goldAmount - a.goldAmount;
      const ua = unitPriceOf(a.goldAmount, a.priceGrave);
      const ub = unitPriceOf(b.goldAmount, b.priceGrave);
      return sira === 'ucuz' ? ua - ub : ub - ua;
    });
  }, [book, mine, sira, enAz, enCok, kendiminiGizle]);

  const submit = async () => {
    setErr(null);
    // ⚠️ Miktar sayı olabilir (gold Int), fiyat ASLA — metin kalır.
    const gold = Number(amount);
    if (!Number.isInteger(gold) || gold < minGold) { setErr(ERR.gecersiz_miktar); return; }
    if (!/^\d{1,30}$/.test(price) || /^0+$/.test(price)) { setErr(ERR.gecersiz_fiyat); return; }
    if (gold > progress.gold) { setErr(ERR.yetersiz_gold); return; }

    setBusy(true);
    try {
      const out = await listGold(gold, price);
      play('buy');
      onChange(out.progress);
      setEscrow(out.escrowedGold);
      setAmount(''); setPrice('');
      await refresh();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setErr(null); setBusy(true);
    try {
      const out = await cancelGoldListing(id);
      onChange(out.progress);
      setEscrow(out.escrowedGold);
      await refresh();
    } catch (e) {
      setErr(humanise(e));
    } finally {
      setBusy(false);
    }
  };

  const girdi = {
    width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
    color: C.bone, fontSize: 13, fontWeight: 700, outline: 'none',
  };

  return (
    <>
      <PanelHead
        kicker="THE MARKETPLACE" accent={C.ice}
        title="Player to player"
        sub="Sell your gold to another player for $GRAVE. The game never mints the token — every coin comes out of someone else’s wallet."
      />

      {/* ── İSTATİSTİK ŞERİDİ ──
          ⚠️ "En iyi fiyat" bir marketin ilk sorusu ve panelde HİÇ YOKTU.
          Dördü de aktif ilanlardan hesaplanıyor; sunucuya yeni uç eklenmedi. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Stat ikon="star" etiket="BEST PRICE" vurgu
          deger={istatistik ? perGold(istatistik.enUcuz) : '—'} />
        <Stat ikon="urn" etiket="OPEN LISTINGS"
          deger={istatistik ? istatistik.adet.toLocaleString('en-US') : '0'} />
        <Stat ikon="gold" etiket="GOLD ON THE MARKET"
          deger={istatistik ? istatistik.toplamGold.toLocaleString('en-US') : '0'} />
        <Stat ikon="skull" etiket="YOUR ESCROW"
          deger={escrow > 0 ? `${escrow.toLocaleString('en-US')} · ${mine.length}/${maxIlan}` : 'nothing listed'} />
      </div>

      {/* ── SEKMELER ──
          ⚠️ `PixelButton`ın kendi `active` durumu (Selected dokusu) kullanılıyor;
          ayrı bir sekme bileşeni yazmaya gerek yok. `Tab` ilkeli 44px KARE ikon
          sekmesi — "BROWSE" metnini kırpardı. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <PixelButton variant={BTN.action} scale={2} active={sekme === 'browse'}
          onClick={() => setSekme('browse')}
          style={{ minWidth: 150, fontSize: 11.5, letterSpacing: 1 }}>
          BROWSE
        </PixelButton>
        <PixelButton variant={BTN.action} scale={2} active={sekme === 'sell'}
          onClick={() => setSekme('sell')}
          style={{ minWidth: 150, fontSize: 11.5, letterSpacing: 1 }}>
          SELL YOUR GOLD
        </PixelButton>
      </div>

      {/* ⚠️ Sekme geçişi tek sarmalayıcıda — iki dala ayrı ayrı animasyon
          yazmak, biri eklenip diğeri unutulunca yarım bir geçiş bırakır. */}
      <Fade keyed={sekme} slide>
      {sekme === 'browse' ? (
        <>
          {/* ── SIRALAMA + FİLTRE ── */}
          <div style={{
            ...glass(9), padding: '9px 11px', marginBottom: 10,
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
          }}>
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint, marginBottom: 4 }}>
                SORT BY
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(Object.keys(SIRA_ETIKET) as Sira[]).map((k) => (
                  <PixelButton key={k} variant={BTN.action} scale={2} active={sira === k}
                    onClick={() => setSira(k)}
                    style={{ minWidth: 118, fontSize: 10, letterSpacing: 0.6 }}>
                    {SIRA_ETIKET[k]}
                  </PixelButton>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <label style={{ width: 96 }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint, marginBottom: 4 }}>
                  MIN GOLD
                </div>
                <input value={enAz} onChange={(e) => setEnAz(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" placeholder="any" style={{ ...girdi, fontSize: 12 }} />
              </label>
              <label style={{ width: 96 }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint, marginBottom: 4 }}>
                  MAX GOLD
                </div>
                <input value={enCok} onChange={(e) => setEnCok(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" placeholder="any" style={{ ...girdi, fontSize: 12 }} />
              </label>
            </div>

            {mine.length > 0 && (
              <PixelButton variant={BTN.action} scale={2} active={kendiminiGizle}
                onClick={() => setKendiminiGizle((v) => !v)}
                style={{ minWidth: 150, fontSize: 10, letterSpacing: 0.6 }}>
                HIDE MINE
              </PixelButton>
            )}
          </div>

          {/* ⚠️ SIRALAMA İSTEMCİDE ve sunucu en yeni 100'ü gönderiyor. Eşiğe
              gelindiğinde "en ucuz" artık defterin tamamının en ucuzu DEĞİL —
              oyuncuya söylenmesi gereken bir sınır, sessiz kalmak yanlış
              bir sayıya güvendirir. */}
          {book.length >= ISTEMCI_SIRALAMA_SINIRI && (
            <div style={{
              marginBottom: 8, padding: '8px 11px', borderRadius: 8,
              border: `1px solid ${C.candle}44`, background: 'rgba(239,167,46,0.10)',
              fontSize: 11, color: C.candleSoft, lineHeight: 1.5,
            }}>
              Showing the {ISTEMCI_SIRALAMA_SINIRI} most recent listings. Sorting covers only these.
            </div>
          )}

          {loading ? (
            <div style={{ ...glass(9), padding: '18px 12px', fontSize: 12, color: C.boneFaint, textAlign: 'center' }}>
              Reading the ledger…
            </div>
          ) : gorunen.length === 0 ? (
            <div style={{ ...glass(9), padding: '18px 12px', fontSize: 12, color: C.boneFaint, textAlign: 'center', lineHeight: 1.5 }}>
              {book.length === 0
                ? 'Nothing listed yet. Be the first — set your own price.'
                : 'No listing matches that filter.'}
            </div>
          ) : (
            /* ⚠️ IZGARA — 1100 px'de tek sütun israf. `auto-fill` ile dar
               ekranda kendiliğinden tek sütuna düşüyor. */
            <div style={{
              display: 'grid', gap: 8,
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            }}>
              {gorunen.map((l) => (
                <ListingRow key={l.id} listing={l}
                  action={
                    /* Token yokken sahte bir "BUY" düğmesi göstermek, oyuncuyu
                       olmayan bir işleme sokmak olurdu. Durum açıkça yazılıyor. */
                    <span style={{
                      flexShrink: 0, padding: '7px 11px', borderRadius: 8, fontWeight: 900, fontSize: 10.5,
                      color: C.boneFaint, background: 'rgba(255,255,255,0.05)', letterSpacing: 0.6,
                    }}>
                      {tokenLive ? 'BUY' : 'AWAITING $GRAVE'}
                    </span>
                  } />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {!canTrade ? (
            <div style={{
              ...glass(10), padding: '12px 14px',
              border: `1px solid ${C.blood}55`, fontSize: 12, color: C.boneDim, lineHeight: 1.55,
            }}>
              <b style={{ color: C.bone }}>Demo gold cannot be sold.</b> It lives only in this browser
              and never enters the economy. Connect a wallet to trade.
            </div>
          ) : (
            <>
              <div style={{ ...glass(10), padding: '12px 14px', marginBottom: 12, border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 9 }}>
                  <span style={{ fontWeight: 900, fontSize: 13, color: C.bone }}>List gold</span>
                  <span style={{ fontSize: 17, fontWeight: 900, color: C.candle }}>
                    {Math.floor(progress.gold).toLocaleString('en-US')} GOLD
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: C.boneFaint, marginBottom: 3 }}>GOLD (min {minGold})</div>
                    <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric" placeholder="500" style={girdi} />
                  </label>
                  <label style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: C.boneFaint, marginBottom: 3 }}>PRICE IN $GRAVE</div>
                    <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric" placeholder="1000" style={girdi} />
                  </label>
                  {/* ⚠️ BTN.strong — ilan açmak gold'u ESCROW'a kilitliyor, yani
                      geri dönüşü olan ama ağır bir eylem. Altın doku "satın
                      alıyorsun" der ve yanıltırdı. */}
                  <PixelButton variant={BTN.strong} scale={2} onClick={submit} disabled={busy}
                    style={{ minWidth: 150, fontSize: 12, letterSpacing: 1 }}>
                    LIST IT
                  </PixelButton>
                </div>

                {/* Girilen değerlerin birim fiyatı ANINDA görünüyor — oyuncu
                    kendi fiyatını defterdekiyle kıyaslayabilsin. */}
                {amount && price && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: C.boneDim }}>
                    Your price:{' '}
                    <b style={{ color: C.candle }}>{unitPrice(Number(amount), price)}</b>
                    {istatistik && Number.isFinite(istatistik.enUcuz) && (
                      <span style={{ color: C.boneFaint }}>
                        {' '}· best on the market is {perGold(istatistik.enUcuz)}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ fontSize: 10.5, color: C.boneFaint, marginTop: 7, lineHeight: 1.45 }}>
                  Listed gold leaves your balance immediately and waits in escrow. Cancel any time to
                  get it back. {tokenLive ? 'A 5% fee applies on sale — half of it burned.' : ''}
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: C.boneDim, marginBottom: 6 }}>
                YOUR LISTINGS — {mine.length}/{maxIlan}
              </div>
              {mine.length === 0 ? (
                <div style={{ ...glass(9), padding: '14px 12px', fontSize: 12, color: C.boneFaint, textAlign: 'center' }}>
                  You have nothing on the market.
                </div>
              ) : (
                <div style={{
                  display: 'grid', gap: 8,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                }}>
                  {mine.map((l) => (
                    <ListingRow key={l.id} listing={l} mine
                      action={
                        <PixelButton variant={BTN.action} scale={2} disabled={busy}
                          onClick={() => cancel(l.id)}
                          style={{ flexShrink: 0, minWidth: 110, fontSize: 10.5, letterSpacing: 0.8 }}>
                          CANCEL
                        </PixelButton>
                      } />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      </Fade>

      {err && (
        <div style={{
          marginTop: 10, padding: '9px 11px', borderRadius: 9,
          border: `1px solid ${C.blood}66`, background: 'rgba(120,20,30,0.18)',
          fontSize: 12, color: C.bone,
        }}>
          {err}
        </div>
      )}
    </>
  );
}
