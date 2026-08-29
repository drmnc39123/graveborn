'use client';
// BİNA NAVBAR'I — köyün her binasına tek tıkla erişim, üstte ortada.
//
// KULLANICI KURALI: "tüm binaların erişiminin butonunu koyacağız, oyuncunun
// gitmesine gerek yok" + "sol menü olmasın, üstte ortada yan yana olsun,
// navbar gibi." Haritada yürümek bir SEÇENEK olarak kalıyor (atmosfer),
// zorunluluk değil.
//
// Ayrıca haritada 'quests' kapısı HİÇ YOK — Warden's Post'a tek giriş dövüş
// portalıydı. Bu navbar o boşluğu da kapatıyor.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PixelButton, Icon, BTN } from '@/components/ui/kit';
import { useCountUpInt } from '@/components/ui/motion';
import { C, FONT, thinGlass } from '@/lib/theme';

export interface DockEntry {
  id: string;
  /** navbar'da görünen kısa ad — uzun isimler yan yana sığmıyor */
  label: string;
  /** tam ad + ne işe yaradığı (tooltip) */
  sub: string;
}

/**
 * GRUPLAR — 13 sekme bir navbar değil, bir liste.
 *
 * ⚠️ Kullanıcının ilk kuralı hâlâ geçerli: "tüm binaların butonu olsun,
 * oyuncunun gitmesine gerek kalmasın." Ama sekme sayısı 13'e çıkınca navbar
 * satır sarmaya başladı ve hiçbir şey öne çıkmaz oldu — her şey eşit derecede
 * önemli olduğunda hiçbir şey önemli değildir.
 *
 * ⚠️ AÇILIR MENÜ (dropdown) YAPILMADI. Menü, üzerine gelmeyi/tıklamayı ve
 * kapanmayı yönetmek demek; mobilde de kötü. Onun yerine seçilen grubun
 * üyeleri ALTINDA İKİNCİ SATIR olarak açılıyor: hiçbir şey gizlenmiyor,
 * her yer hâlâ en fazla iki tıklama.
 *
 * ⚠️ Açık panelin grubu KENDİLİĞİNDEN AÇIK kalıyor — panel açıkken navbar
 * kapanırsa oyuncu nerede olduğunu kaybeder.
 */
export interface DockGroup {
  id: string;
  label: string;
  /** grubun rengi — hangi ailede olduğun bir bakışta okunsun */
  color: string;
  members: readonly string[];
}

// ⚠️ RENKLER PALETTEN OKUNUYOR, LİTERAL DEĞİL. Dördü de `C`nin birebir
// kopyasıydı (`#a01226`=blood · `#efa72e`=candle · `#5f9e4a`=ok ·
// `#8a97a3`=ice). Bu sessiz bir tuzak: paleti ayarlayan kişi navbarın da
// değiştiğini sanır, oysa burası kendi kopyasını tuttuğu için ESKİ renkte
// kalırdı — ve navbar oyunun en görünür yüzeyi.
export const GROUPS: readonly DockGroup[] = [
  // Dövüş önce: oyuncunun oyuna girdiği yer en solda ve en görünür olmalı.
  { id: 'fight', label: 'FIGHT', color: C.blood, members: ['quests', 'boss', 'duel', 'pit'] },
  { id: 'power', label: 'POWER', color: C.candle, members: ['upgrade', 'paths', 'gear', 'pets', 'shop'] },
  { id: 'spend', label: 'SPEND', color: C.ok, members: ['market', 'exchange', 'reliquary'] },
  { id: 'people', label: 'PEOPLE', color: C.ice, members: ['daily', 'watch', 'guild', 'tavern'] },
] as const;

/** Sıralama kasıtlı: oyuncunun döngüsü soldan sağa okunuyor. */
export const BUILDINGS: readonly DockEntry[] = [
  { id: 'quests', label: 'STAGES', sub: "The Warden's Post — stages & the Descent" },
  { id: 'upgrade', label: 'FORGE', sub: 'The Forge — permanent power' },
  { id: 'shop', label: 'STALL', sub: "Pedlar's Stall — charms for one run" },
  // ⚠️ Forge'un HEMEN ARDINDA duruyor ve bu kasıtlı: oyuncunun gold döngüsü
  // "kalıcı güç → görünür prestij" sırasında okunmalı. Forge sonlu, Reliquary
  // değil; ağaç bitince gold'un gideceği yer bir sonraki durak olsun.
  { id: 'reliquary', label: 'RELIQUARY', sub: 'The Reliquary — relics, titles, auras (appearance only)' },
  // ⚠️ Forge'la Reliquary'nin ARASINDA duruyor ve bu kasıtlı: Forge dikey
  // ilerleme (gold'la satın alınır), ekipman YATAY (bulunur). İkisini yan yana
  // koymak, oyuncunun iki farklı güç eksenini olduğu gibi okumasını sağlıyor.
  { id: 'gear', label: 'GEAR', sub: 'Your gear — what you found in the Wilderness' },
  // ⚠️ GEAR'ın hemen yanında: ikisi de YATAY ilerleme. Ekipman "ne buldun",
  // ağaç "neye yatırım yaptın" sorusunu cevaplıyor; yan yana durunca oyuncu
  // iki eksenin aynı aileden olduğunu okumadan görüyor.
  { id: 'paths', label: 'PATHS', sub: 'Your paths — skill points from the depths you reached' },
  { id: 'market', label: 'MARKET', sub: 'Marketplace — sell gold for $GRAVE' },
  { id: 'pets', label: 'BINDING', sub: 'The Binding — what you killed, kept' },
  { id: 'exchange', label: 'EXCHANGE', sub: 'The Exchange — player order book' },
  // ⚠️ Sonda duruyor ama en dikkat çeken yer olmalı — haftalık, kaçırılırsa
  // bir daha o boss gelmiyor. Rozet/vurgu Faz 5 cilasında eklenecek.
  { id: 'boss', label: 'BARROW', sub: "The Shared Barrow — this week's world boss" },
  // ⚠️ BARROW'un yanında: ikisi de "başkalarına karşı" oynanan yerler.
  // Boss ORTAK bir düşman, düello ise doğrudan başka bir oyuncunun koşusu —
  // rekabet kolu burada okunuyor.
  { id: 'duel', label: 'DUELS', sub: "The Answering — play another player's run and go deeper" },
  // ⚠️ DUELS'in yanında ama BAŞKA BİR ŞEY: düello asenkron (rakibin
  // kaydını oynuyorsun), Pit gerçek zamanlı (aynı anda aynı arenadasınız).
  // İkisi de "PvP" ama karıştırılırlarsa oyuncu yanlış beklentiyle giriyor.
  { id: 'pit', label: 'THE PIT', sub: 'Live 1v1 — same arena, same waves, last one standing' },
  // ⚠️ TAVERN'in yanında: ikisi de "ben ne yaptım" sorusu. Günlük görev
  // FIGHT grubuna konmadı — bir dövüş yeri değil, günün listesi.
  { id: 'daily', label: 'TODAY', sub: "Today's work — three things, resets at midnight UTC" },
  // ⚠️ TODAY'in yanında: ikisi de "her gün açtığın" ekranlar. Takip listesi
  // FIGHT grubuna konsaydı bir dövüş aracı gibi görünürdü; oysa asıl işi
  // kimin orada olduğunu göstermek.
  { id: 'watch', label: 'WATCH', sub: 'The Watch — people you keep an eye on' },
  { id: 'tavern', label: 'TAVERN', sub: 'Tavern — profile & records' },
  // ⚠️ TAVERN'in yanında: ikisi de "kim olduğun" ile ilgili. Lonca sohbetin
  // yanına konsaydı bir araç gibi görünürdü; profilin yanında bir AİDİYET
  // gibi okunuyor — sekmenin işi tam olarak bu.
  { id: 'guild', label: 'GUILD', sub: 'The Guilds — stand with others, share experience' },
  // ⚠️ Bir BİNA değil ama buraya konuldu: ayarlar ulaşılabilir olmalı ve
  // köyde onu barındıracak bir kapı yok. Ayrı bir dişli ikonu eklemek
  // rıhtımın dilini bozardı.
  { id: 'settings', label: 'SETTINGS', sub: 'Sound, motion, graphics' },
] as const;

/**
 * ⚠️ RIHTIM YÜKSEKLİĞİ DIŞARI BİLDİRİLİR (`onHeight`).
 *
 * Panel katmanı üstten sabit 78 px boşluk bırakıyordu — TEK SATIRLIK bir
 * navbar için ölçülmüş sihirli bir sayı. 9. düğme (SETTINGS) eklenince satır
 * sardı, rıhtım 85 px'e çıktı ve panelin ilk 31 pikselini ÖRTTÜ. Rıhtım
 * zIndex 6, panel 5 — yani oradaki her tıklama panele değil rıhtımın son
 * düğmesine gidiyordu: oyuncu karakter seçerken/WEAR'a basarken kendini
 * Settings'te buluyordu.
 *
 * Sabit sayı yerine GERÇEK yükseklik ölçülüyor; düğme sayısı ya da ekran
 * genişliği değişince kendiliğinden doğru kalıyor.
 */
export function BuildingDock({ open, onOpen, onClose, gold, grave = 0, wallet, style, onHeight, onLeft, footer }: {
  /** açık olan panel — buton "Selected" görünür */
  open: string | null;
  onOpen: (id: string) => void;
  /**
   * Açık paneli kapat.
   *
   * ⚠️ NİYE GEREKLİ: başka bir gruba geçince alt satır o grubun binalarını
   * gösteriyor ama panel eski grubunkinde kalıyordu — vurgulanan şey ile
   * ekranda duran şey birbirini tutmuyordu. Grup değişimi bir "nereye
   * bakıyorum" kararı; panelin onu takip etmesi gerekiyor.
   */
  onClose?: () => void;
  gold: number;
  grave?: number;
  /** bağlı cüzdan; yoksa DEMO modundayız */
  wallet?: string | null;
  style?: CSSProperties;
  /** rıhtımın kapladığı toplam yükseklik (px) — panel boşluğu buna göre ayarlanır */
  onHeight?: (h: number) => void;
  /**
   * Rıhtım İÇERİĞİNİN sol kenarı (px).
   *
   * ⚠️ NİYE GEREKLİ: rıhtım ORTALI, yani sol kenarı görüntü genişliğine
   * bağlı. Sol üstteki kimlik kartı navbar hizasında durmak istiyor ve
   * "kaç piksel yerim var" sorusunun cevabı sabit bir sayı DEĞİL. Kartı
   * sabit genişlikte yapmak, dar ekranda navbar'ın altına sokuyordu.
   */
  onLeft?: (x: number) => void;
  /**
   * Rıhtımın ALTINA, aynı sütunun içine asılan içerik (hafta sonu şeridi).
   * ⚠️ Sayfaya ayrı yerleştirilip `onHeight` ile hizalanmıyor — sebebi
   * aşağıda, render'ın sonundaki notta.
   */
  footer?: ReactNode;
}) {
  // ⚠️ Kesirli gold görünmüyor (`Math.floor` zaten vardı) — sayaç da tamsayı.
  const sayanGold = useCountUpInt(Math.floor(gold));
  const boxRef = useRef<HTMLDivElement>(null);
  /**
   * Elle yapılan seçim. `null` = seçim yok (açık panelin grubu gösterilir),
   * `'none'` = oyuncu açıkça KAPATTI.
   *
   * ⚠️ ELLE SEÇİM, OTOMATİĞİ EZER. İlk sürümde açık panelin grubu önce
   * geliyordu ve ölçüldü: DUELS paneli açıkken POWER'a basınca hiçbir şey
   * olmuyordu — panel açıkken başka bir gruba göz atmak imkânsızdı.
   */
  const [grup, setGrup] = useState<string | null>(null);

  // Satır sarması ekran genişliğine bağlı; `ResizeObserver` her değişimde
  // haber veriyor — pencere yeniden boyutlandırılınca da doğru kalıyor.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const bildir = () => {
      const r = el.getBoundingClientRect();
      onHeight?.(r.height);
      onLeft?.(r.left);
    };
    bildir();
    const ro = new ResizeObserver(bildir);
    ro.observe(el);
    // ⚠️ `ResizeObserver` BOYUTU izler, KONUMU değil. Rıhtım ortalı ve
    // içeriği `maxWidth`in altındaysa pencere genişleyince ENİ DEĞİŞMEZ,
    // yalnız SOL KENARI kayar — RO o durumda hiç tetiklenmez ve kartın
    // hesapladığı boş alan yanlış kalırdı. Pencere olayı o boşluğu kapatıyor.
    window.addEventListener('resize', bildir);
    return () => { ro.disconnect(); window.removeEventListener('resize', bildir); };
  }, [onHeight, onLeft]);

  /**
   * ⚠️ SIRA ÖNEMLİ: önce elle seçim, sonra AÇIK PANELİN GRUBU.
   *
   * 🔴 İKİNCİ ARAMA ULAŞILAMAZ KODDU. Eski hâli `grup === 'none' ? null : (…)`
   * ile başlıyordu; yani `grup` bir grup id'siyse ilk arama ZATEN her zaman
   * buluyor, `'none'` ise fonksiyon daha ikinci aramaya varmadan `null`
   * dönüyordu. Niyet ("açık panelin grubunu işaretle") yazılmış ve ekrana
   * HİÇ ulaşmamıştı — bu depoda tekrar eden hata sınıfı.
   *
   * Ekranda görülen sonucu: panel açıkken hiçbir grup vurgulu değildi.
   */
  const acikGrup =
    (grup !== 'none' ? GROUPS.find((g) => g.id === grup) ?? null : null)
    ?? (open !== null ? GROUPS.find((g) => g.members.includes(open)) ?? null : null);

  return (
    <div style={{
      // zIndex panel katmanının (5) ÜSTÜNDE: navbar her zaman tıklanabilir
      // kalmalı, panel açıkken de doğrudan başka binaya geçilebilsin.
      position: 'absolute', top: 10, left: 0, right: 0, zIndex: 6,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      pointerEvents: 'none', ...style,
    }}>
      {/* ⚠️ ÖLÇÜLEN KUTU İKİ SATIRI DA SARIYOR. Yalnızca üst satırı ölçmek,
          ikinci satır açıldığında panelin üstünü örtmesine yol açardı —
          daha önce tam olarak bu hata yaşandı (bkz. fonksiyon başlığı). */}
      <div ref={boxRef} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        maxWidth: 'calc(100vw - 24px)', pointerEvents: 'auto',
      }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        justifyContent: 'center', padding: '7px 11px', maxWidth: '100%',
        ...thinGlass(12),
      }}>
        {/* ⚠️ DÜĞMELER `PixelButton` — köyün geri kalanıyla AYNI dil.
            Bir ara düz CSS düğmeye çevrilmişti ve navbar oyunun içinden
            değil, üstüne yapıştırılmış bir web arayüzü gibi duruyordu.
            Gruplama kalıyor, düğmenin görünümü değişmiyor. */}
        {GROUPS.map((g) => (
          <PixelButton
            key={g.id}
            variant={BTN.action}
            scale={2}
            active={acikGrup?.id === g.id}
            // Açık gruba tekrar basmak KAPATIR ('none'); başkasına basmak ona geçer.
            // ⚠️ BAŞKA gruba geçerken açık panel de kapanır: alt satır artık
            // o grubun binalarını gösteriyor, panelin eski grupta kalması
            // "vurgulanan şey ile görünen şey" çelişkisi yaratıyordu.
            onClick={() => {
              const yeni = acikGrup?.id === g.id ? 'none' : g.id;
              if (yeni !== acikGrup?.id && open !== null) onClose?.();
              setGrup(yeni);
            }}
            style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.9 }}
          >
            {g.label}
          </PixelButton>
        ))}
        <PixelButton
          variant={BTN.action}
          scale={2}
          active={open === 'settings'}
          onClick={() => onOpen('settings')}
          title="Sound, motion, graphics"
          style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.9 }}
        >
          ⚙
        </PixelButton>

        {/* Cüzdan navbar'ın sağ ucunda — ayrı çerçeve tutarsız duruyordu */}
        <span style={{
          display: 'flex', gap: 10, alignItems: 'baseline', fontFamily: FONT.ui,
          paddingLeft: 12, marginLeft: 4, borderLeft: `1px solid ${C.border}`,
        }}>
          {/* ⚠️ Oyunun EN ÇOK GÖRÜLEN sayısı bu — navbar her ekranda açık.
              İkon burada bezeme değil çapa: oyuncu paneller arasında gezerken
              "gold nerede" sorusunu her seferinde yeniden sormasın. */}
          <span style={{ fontSize: 14, fontWeight: 900, color: C.candle, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="gold" />
            {/* ⚠️ SAYAN SAYI. Oyunun en görünür rakamı buydu ve harcama
                anında ZIPLIYORDU: Forge'da 120.000 gold gidince oyuncunun
                tek geri bildirimi, bir şeyin değişmiş olmasıydı — DEĞİŞTİĞİNİ
                görmüyordu. Hareket kapalıyken (`prefers-reduced-motion` ya da
                `lowGraphics`) anında son değeri gösterir, bilgi kaybolmaz. */}
            {sayanGold.toLocaleString('en-US')}
            <span style={{ fontSize: 9, color: C.candleSoft }}>GOLD</span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, color: C.boneFaint, whiteSpace: 'nowrap' }}>
            {grave.toLocaleString('en-US')}
            <span style={{ fontSize: 9, marginLeft: 3 }}>$GRAVE</span>
          </span>
          {/* Hangi kayda oynadığın HER ZAMAN görünsün. Demo ilerlemesi bu
              cihazda kalır; oyuncunun bunu sonradan öğrenmesi kötü olurdu. */}
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: 0.8, padding: '2px 6px',
            borderRadius: 4, whiteSpace: 'nowrap',
            color: wallet ? C.ok : C.candle,
            background: wallet ? 'rgba(95,158,74,0.16)' : 'rgba(239,167,46,0.14)',
          }}>
            {wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : 'DEMO'}
          </span>
        </span>
      </div>

      {/* ── İKİNCİ SATIR: seçili grubun üyeleri ──
          ⚠️ Gizlenmiyor, AÇILIYOR. Açılır menü yapmadım: menü, üzerine
          gelme/tıklama/kapanma yönetimi demek ve mobilde kötü. Bu hâliyle
          hiçbir yer iki tıklamadan uzak değil. */}
      {acikGrup && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          justifyContent: 'center', padding: '6px 10px', maxWidth: '100%',
          ...thinGlass(10),
          borderColor: `${acikGrup.color}44`,
        }}>
          {acikGrup.members.map((id) => {
            const b = BUILDINGS.find((x) => x.id === id);
            if (!b) return null;
            return (
              <PixelButton
                key={id}
                variant={BTN.action}
                scale={2}
                active={open === id}
                onClick={() => onOpen(id)}
                title={b.sub}
                style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.9 }}
              >
                {b.label}
              </PixelButton>
            );
          })}
        </div>
      )}

      {/* ── RIHTIMIN ALTINA ASILAN ŞERİT (hafta sonu etkinliği) ──
          ⚠️ ÖLÇÜLEN SAYIYLA DEĞİL, AKIŞLA konumlanıyor ve bu bilinçli.
          İlk denemede şerit `top: dockH + 8` ile sayfaya ayrı yerleştirildi;
          `dockH` ölçülen bir değer olduğu için "sabit sayı yazma" dersine
          uyuyordu ama yeni bir kırılganlık getiriyordu: ölçüm bir
          `ResizeObserver`'a bağlı ve RO — tıpkı `requestAnimationFrame` gibi —
          sayfa kare üretmediğinde SUSUYOR. Yani sekme arkadayken satır
          sarması olursa şerit eski yüksekliğe göre kalır ve rıhtımın son
          düğmelerini örter. Örtünce de zIndex 6 olan rıhtım kazanır: oyuncu
          şeride basar, tıklama başka bir düğmeye gider.
          Şerit rıhtımın KENDİ sütununun son çocuğu olunca, üst üste binmesi
          yapısal olarak imkânsız — ölçülecek bir şey kalmıyor. */}
      {footer}
      </div>
    </div>
  );
}
