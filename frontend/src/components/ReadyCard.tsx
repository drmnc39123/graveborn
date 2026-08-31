'use client';
// SONRAKİ KOŞUYA HAZIR OLAN — köyün sağ üstünde, "inersem ne olacak".
//
// ⚠️ NİYE VAR — İKİ AYRI GERÇEK SORUN:
//
// 1. GÖRÜNMEYEN ÖZELLİK. `progress.charms` ve `progress.equippedPets`
//    oyuncunun bir sonraki koşuya TAŞIDIĞI şeyler ama köyde hiçbir yerde
//    yazmıyordu: tılsımlar yalnız koşu BİLETİNDEN okunuyor (bkz.
//    `play/page.tsx` "Tılsımlar `progress.charms`'tan DEĞİL BİLETTEN
//    okunur"), pet'ler yalnız BINDING panelinde. Oyuncu köye dönünce ne
//    kuşandığını göremiyordu. Bu depoda tekrar eden sınıf: hesaplanan ama
//    ekrana çıkmayan veri.
//
// 2. ⚠️ BAHİS SESSİZCE PARA YAKIYOR. `wager` koşu AÇILIRKEN gold'u düşüyor
//    (`backend/src/index.ts`: `gold: { decrement: bahis.stake }`) ve köyde
//    HİÇBİR İZİ YOKTU — yalnız koşu SONRASI ödeme ekranında görünüyordu.
//    Yani oyuncu günler önce kurduğu bahsi unutup inişe geçiyor ve parası
//    yanıyor. Görünmeyen bir maliyet, maliyet değil TUZAKTIR.
//
// ⚠️ HİÇBİR YENİ SİSTEM YAZILMADI. Tılsım tanımları `charms.ts`te, bahis
// `wager.ts`te, pet'ler `pets.ts`te, cam yüzey `theme.ts`te zaten vardı.
//
// ⚠️ HİÇBİR ŞEY YOKSA KART DA YOK. Köy sahnesi oyunun görsel kalbi; boş
// bir kutu koymak onu kapatmak olurdu. `ProfileCard`ın duruşuyla aynı.

import { charmById } from '@/game/charms';
import { petById } from '@/game/pets';
import type { Progress } from '@/game/progress';
import { C, FONT, thinGlass } from '@/lib/theme';

/** Küçük etiket satırı — kartın tek görsel birimi */
function Satir({ renk, baslik, alt }: { renk: string; baslik: string; alt: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: 5, background: renk, flex: '0 0 auto' }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: C.bone, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {baslik}
      </span>
      <span style={{ fontSize: 10, color: C.boneFaint, marginLeft: 'auto', flex: '0 0 auto' }}>
        {alt}
      </span>
    </div>
  );
}

export function ReadyCard({ progress }: { progress: Progress }) {
  const tilsimlar = progress.charms.map(charmById).filter(Boolean);
  const petler = (progress.equippedPets ?? []).map(petById).filter(Boolean);
  const bahis = progress.wager;

  // ⚠️ Boşken çizme — köyü kapatma.
  if (!tilsimlar.length && !petler.length && !bahis) return null;

  return (
    <div style={{
      // ⚠️ `thinGlass`, `glass` DEĞİL — ve alfa `EventBanner` ile AYNI (0,80).
      // İkisi köyün sağ kolonunda ÜST ÜSTE duruyor; farklı yüzey
      // kullandıklarında iki kart iki ayrı oyundan gelmiş gibi görünüyordu.
      // 0,80 orada ölçülerek seçildi (parlak taş yolda kontrast 5,04).
      ...thinGlass(11, 0.80), padding: '9px 11px', fontFamily: FONT.ui,
      // ⚠️ `min(...)` — dar ekranda içerik alanına oturur. Çıplak `214`
      // yazmak bu depoda ölçülmüş bir taşma sınıfı (bkz. panel ızgaraları).
      width: 'min(214px, 100%)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.6, color: C.boneFaint }}>
        READY FOR THE DESCENT
      </div>

      {bahis && (
        <>
          {/* ⚠️ EN ÜSTTE ve KIRMIZI: tek para yakan kalem bu. Gold koşu
              açılırken gidiyor, oyuncu bunu inmeden ÖNCE görmeli. */}
          <Satir renk={C.blood} baslik={`Wager · depth ${bahis.target}`}
            alt={`${bahis.stake.toLocaleString('en-US')} G`} />
          <div style={{ fontSize: 9.5, color: C.badText, marginTop: 2, lineHeight: 1.4 }}>
            Stake burns when the run opens.
          </div>
        </>
      )}

      {tilsimlar.map((c) => (
        <Satir key={c!.id} renk={C.candle} baslik={c!.name} alt="one run" />
      ))}

      {petler.map((p) => (
        <Satir key={p!.id} renk={C.ice} baslik={p!.name}
          alt={`lv ${progress.petLevels[p!.id] ?? 0}`} />
      ))}
    </div>
  );
}
