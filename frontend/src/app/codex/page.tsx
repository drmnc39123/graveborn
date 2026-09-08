// WHITEPAPER — /codex
//
// ⚠️ AYNI VERI, DAHA DERIN YUZEY. Icerik `game/codex.ts`te; oyun ici panel
// `body`yi, burasi `body` + `deep`i ciziyor ve `webOnly` bolumleri de
// ekliyor. Ikinci bir metin dosyasi tutulsaydi biri guncellenir, digeri
// sessizce yalan soylerdi.
//
// ⚠️ SUNUCU BILESENI: bir whitepaper aranabilir ve paylasilabilir olmali.
// Istemcide uretilen bir metin arama motorlarina ve link onizlemelerine
// gorunmez.
//
// ⚠️ TIKLANABILIR GEZINME ISTEMCI TARAFINDA (`CodexNav`): burasi metni
// sunuyor, o gezinmeyi yonetiyor. Sayfanin okunabilmesi icin JavaScript
// SART DEGIL — betigi kapali bir tarayicida da butun metin duruyor.

import type { Metadata } from 'next';
import Link from 'next/link';
import { CODEX } from '@/game/codex';
import { BRAND, C, FONT } from '@/lib/theme';
import { CodexNav } from './CodexNav';

export const metadata: Metadata = {
  title: `The Codex — ${BRAND.name}`,
  description:
    'How GRAVEBORN works, in full: the run, the economy, what real money can and cannot buy, and what the game will not do.',
  openGraph: {
    type: 'article',
    title: `The Codex — ${BRAND.name}`,
    description:
      'How GRAVEBORN works, in full: the run, the economy, what real money can and cannot buy, and what the game will not do.',
    url: '/codex',
  },
};

export default function CodexSayfasi() {
  return (
    <main style={{
      minHeight: '100dvh', background: '#14100f', color: C.bone,
      fontFamily: FONT.ui,
    }}>
      {/* ── BASLIK ── */}
      <header style={{
        borderBottom: `1px solid ${C.border}`,
        padding: '46px 24px 34px', textAlign: 'center',
        background: 'linear-gradient(180deg, rgba(160,18,38,0.10), transparent)',
      }}>
        <Link href="/" style={{
          fontSize: 11, letterSpacing: 8, color: C.ice, textDecoration: 'none',
        }}>{BRAND.name.toUpperCase()}</Link>
        <h1 style={{
          margin: '14px 0 8px', fontSize: 40, lineHeight: 1.1, color: C.bone, fontWeight: 900,
        }}>The Codex</h1>
        <p style={{
          margin: '0 auto', maxWidth: 620, fontSize: 14, lineHeight: 1.6, color: C.boneDim,
        }}>
          How this game works, in full — the run, the economy, what real money can and cannot
          buy, and the things we have written down so they are harder to walk back.
        </p>
        {/* ⚠️ RAKAMLARIN NEREDEN GELDIGI SOYLENIYOR. Bir belgenin en kolay
            bozulma bicimi, dogru yazilip sonra bayatlamasidir; buradaki
            sayilar oyunun kendi sabitlerinden okunuyor ve bunu okuyanin
            bilmesi belgeye guveninin sebebi. */}
        <p style={{ margin: '14px 0 0', fontSize: 11, color: C.boneFaint }}>
          Every number below is read from the game&apos;s own constants, not typed by hand.
        </p>
      </header>

      <div style={{
        maxWidth: 1080, margin: '0 auto', padding: '0 20px 80px',
        display: 'flex', gap: 34, alignItems: 'flex-start',
      }}>
        <CodexNav bolumler={CODEX.map((s) => ({ id: s.id, kicker: s.kicker }))} />

        <article style={{ flex: 1, minWidth: 0, paddingTop: 34 }}>
          {CODEX.map((s, i) => (
            <section key={s.id} id={s.id} style={{
              // ⚠️ `scroll-margin-top`: capa ile atlayinca baslik yapiskan
              // seridin ALTINDA kalmasin. Olmadan her tiklama basligi
              // gizleyen bir kaydirma yapardi.
              scrollMarginTop: 24,
              paddingBottom: 40, marginBottom: 40,
              borderBottom: i === CODEX.length - 1 ? 'none' : `1px solid ${C.border}`,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 900, letterSpacing: 2.5, color: C.ice,
              }}>{s.kicker}</div>
              <h2 style={{
                margin: '8px 0 16px', fontSize: 26, lineHeight: 1.2, color: C.bone, fontWeight: 900,
              }}>{s.title}</h2>

              {s.body.map((p, k) => (
                <p key={`b${k}`} style={{
                  margin: '0 0 13px', fontSize: 14.5, lineHeight: 1.72, color: C.boneDim,
                }}>{p}</p>
              ))}

              {/* ⚠️ DERIN KATMAN GORSEL OLARAK AYRIK: okuyucu nerede
                  ozetten ayrintiya gectigini gormeli, yoksa uzun metin tek
                  bir duvara doner. */}
              {s.deep && s.deep.length > 0 && (
                <div style={{
                  marginTop: 18, paddingLeft: 16,
                  borderLeft: `2px solid ${C.candle}44`,
                }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 900, letterSpacing: 2, color: C.candle,
                    marginBottom: 9,
                  }}>IN DETAIL</div>
                  {s.deep.map((p, k) => (
                    <p key={`d${k}`} style={{
                      margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.7, color: C.boneFaint,
                    }}>{p}</p>
                  ))}
                </div>
              )}

              {s.facts && s.facts.length > 0 && (
                <div style={{
                  marginTop: 20, padding: '13px 15px', borderRadius: 9,
                  background: 'rgba(0,0,0,0.30)', border: `1px solid ${C.border}`,
                  display: 'flex', flexWrap: 'wrap', gap: '12px 26px',
                }}>
                  {s.facts.map((f) => (
                    <div key={f.label} style={{ minWidth: 110 }}>
                      <div style={{
                        fontSize: 8.5, fontWeight: 900, letterSpacing: 1.2, color: C.boneFaint,
                      }}>{f.label.toUpperCase()}</div>
                      <div style={{
                        fontSize: 14, fontWeight: 900, color: C.candle, marginTop: 2,
                      }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}

          <div style={{ textAlign: 'center', paddingTop: 10 }}>
            <Link href="/" style={{
              display: 'inline-block', padding: '12px 26px', borderRadius: 8,
              border: `1px solid ${C.candle}55`, color: C.candle,
              textDecoration: 'none', fontSize: 14, fontWeight: 900, letterSpacing: 1,
            }}>PLAY GRAVEBORN</Link>
          </div>
        </article>
      </div>
    </main>
  );
}
