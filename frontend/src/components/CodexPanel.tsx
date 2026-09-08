'use client';
// THE CODEX — oyunun her sistemini anlatan panel.
//
// ⚠️ İÇERİK BURADA DEĞİL, `game/codex.ts`te. Bu dosya yalnız ÇİZİYOR.
// Metni bileşene gömseydik `/codex` sayfası ikinci bir kopya tutmak
// zorunda kalır ve ikisi ayrışırdı.
//
// ⚠️ SAYILAR ELLE YAZILMIYOR — `facts` canlı sabitlerden geliyor. Bir
// rehberin en sinsi bozulma biçimi, denge değiştikten sonra eski rakamı
// söylemeye devam etmesidir.
//
// ⚠️ HER ZAMAN AÇIK. Cüzdan da demo da aynı rehberi görüyor: oyunu
// anlatmak için giriş yapmış olmak gerekmez, tam tersi — anlamayan
// oyuncu zaten giriş yapmaz.

import { useState } from 'react';
import { codexInGame } from '@/game/codex';
import { PanelHead } from '@/components/ui/cards';
import { C, FONT, glass } from '@/lib/theme';

export function CodexPanel() {
  /**
   * ⚠️ `codexInGame()` — whitepaper'a özel bölümler burada YOK. Oyuncu
   * köyde oynamak için duruyor; "fair play" ve "token" başlıkları
   * `/codex` sayfasının işi.
   */
  const bolumler = codexInGame();
  const [acik, setAcik] = useState<string>(bolumler[0].id);
  const bolum = bolumler.find((s) => s.id === acik) ?? bolumler[0];

  return (
    <>
      <PanelHead
        kicker="THE CODEX" accent={C.ice}
        title={bolum.title}
        sub="Everything the village runs on, written out. Nothing here is a spoiler — the game keeps its secrets in the cards."
      />

      {/* ⚠️ SEKMELER SARIYOR, KAYDIRMIYOR. Yatay kaydırmalı bir şerit
          telefonda görünmeyen sekmeler bırakır ve oyuncu onların varlığını
          hiç öğrenmez — `RecordsPanel`de ölçülmüş aynı tuzak. */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 12, flexWrap: 'wrap' }}>
        {bolumler.map((s) => {
          const on = s.id === bolum.id;
          return (
            <button key={s.id} onClick={() => setAcik(s.id)}
              style={{
                all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
                fontFamily: FONT.ui, fontSize: 10, fontWeight: 900, letterSpacing: 1,
                color: on ? C.bone : C.boneFaint,
                background: on ? 'rgba(138,151,163,0.22)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${on ? `${C.ice}66` : 'rgba(255,255,255,0.10)'}`,
              }}>
              {s.kicker}
            </button>
          );
        })}
      </div>

      {/* ⚠️ TAM BELGEYE BAGLANTI. Panel KISA olmak zorunda ama oyuncunun
          daha fazlasini isteme hakki var; bu satir olmadan `/codex`
          oyunun icinden GORUNMEZ olurdu — bu depoda tekrar eden hata
          sinifi tam olarak bu. */}
      <a href="/codex" target="_blank" rel="noopener noreferrer" style={{
        display: 'block', marginBottom: 12, fontSize: 10.5, fontWeight: 900,
        letterSpacing: 1, color: C.candle, textDecoration: 'none',
      }}>READ THE FULL CODEX →</a>

      {/* Gövde */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bolum.body.map((p, i) => (
          <p key={i} style={{
            margin: 0, fontSize: 12.5, lineHeight: 1.62, color: C.boneDim,
            fontFamily: FONT.ui,
          }}>{p}</p>
        ))}
      </div>

      {/* ⚠️ RAKAMLAR AYRI BİR BLOKTA ve metinden SONRA: paragrafın içine
          serpilmiş sayılar hem okumayı bozar hem güncellenmesi gerekeni
          gizler. Burada hepsi tek yerde ve hepsi canlı sabitten. */}
      {bolum.facts && bolum.facts.length > 0 && (
        <div style={{
          ...glass(9), marginTop: 14, padding: '10px 12px',
          display: 'flex', flexWrap: 'wrap', gap: '9px 18px', fontFamily: FONT.ui,
        }}>
          {bolum.facts.map((f) => (
            <div key={f.label} style={{ minWidth: 96 }}>
              <div style={{
                fontSize: 8.5, fontWeight: 900, letterSpacing: 1, color: C.boneFaint,
              }}>{f.label.toUpperCase()}</div>
              <div style={{
                fontSize: 12.5, fontWeight: 900, color: C.candle, marginTop: 1,
              }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
