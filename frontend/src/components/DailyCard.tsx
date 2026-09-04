'use client';
// GÜNLÜK İNİŞ KARTI — Warden's Post'un tepesinde, bölüm listesinden önce.
//
// ⚠️ NİYE EN ÜSTTE: günlük hakkı günde bir kez ve 00:00 UTC'de yanıyor.
// Bölüm listesinin altına konsaydı oyuncu onu ancak kaydırırsa görürdü ve
// çoğu gün hakkını hiç kullanmadan kapatırdı.
//
// ⚠️ CÜZDANSIZ GÖRÜNMÜYOR. Günlük iniş sunucu tablosuna yazıyor; demo ise
// sunucuya TEK istek atmıyor (izolasyon bilinçli, para basma açığını
// kapatan şey o). Demoda boş bir kart göstermek, tıklanamayan bir düğme
// göstermek olurdu.

import { useCallback, useEffect, useState } from 'react';
import { fetchDaily, type DailyDurum } from '@/lib/gameSession';
import { Card } from '@/components/ui/cards';
import { PixelButton, BTN } from '@/components/ui/kit';
import { C } from '@/lib/theme';

const kisa = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/** 00:00 UTC'ye kalan süre — hakkın ne zaman yenileneceği */
function kalanSure(): string {
  const n = new Date();
  const yarin = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
  const ms = yarin - n.getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function DailyCard({ onEnter, benim }: {
  /** günlük koşuyu başlat — bölümü SUNUCU seçiyor, id sadece yer tutucu */
  onEnter: () => void;
  /** koşu dönüşünde kartı tazelemek için — değeri değişince yeniden çeker */
  benim?: number;
}) {
  const [d, setD] = useState<DailyDurum | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const cek = useCallback(() => {
    fetchDaily().then((v) => { setD(v); setYukleniyor(false); });
  }, []);
  useEffect(cek, [cek, benim]);

  // ⚠️ Cüzdansızken (demo) ya da sunucu kapalıyken HİÇ ÇİZİLMEZ — boş bir
  // kart oyuncuya kaybettiği bir şey olduğunu düşündürürdü.
  if (yukleniyor || !d) return null;

  const bitti = d.mine.done;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.8, color: C.boneFaint, marginBottom: 7 }}>
        THE SAME GRAVE
      </div>
      <Card>
        <div style={{ padding: '12px 13px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: C.bone }}>{d.stageName}</span>
            <span style={{ fontSize: 11, color: C.boneFaint }}>{d.day} UTC</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: C.candle, fontWeight: 800 }}>
              resets in {kalanSure()}
            </span>
          </div>

          {/* ⚠️ ÜÇ KURALIN ÜÇÜ DE BASMADAN ÖNCE YAZILI. Özellikle "başlatmak
              hakkı yakar" — sonradan öğrenilen bir kural, kaybedilen bir gün
              demek ve haklı bir şikâyet üretir. */}
          <div style={{ fontSize: 11.5, color: C.boneDim, marginTop: 7, lineHeight: 1.65 }}>
            Everyone descends the <b style={{ color: C.bone }}>same map, same seed</b> today.
            The Forge, your gear, guild and charms are <b style={{ color: C.bone }}>all switched
            off</b> — this is skill, not wealth.
            <br />
            <b style={{ color: C.warn }}>One attempt.</b> Starting it uses your run for today,
            even if you leave.
          </div>

          {bitti ? (
            <div style={{
              marginTop: 10, padding: '8px 11px', borderRadius: 7,
              background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
              fontSize: 12, color: C.boneDim,
            }}>
              {d.mine.finished
                ? <>Today’s descent: <b style={{ color: C.candle }}>depth {d.mine.depth}</b>
                  {d.mine.capped && <span style={{ color: C.bad }}> · not counted (capped)</span>}</>
                : 'Today’s attempt is already used.'}
            </div>
          ) : (
            <PixelButton variant={BTN.strong} scale={3} onClick={onEnter}
              style={{ width: '100%', marginTop: 11, fontSize: 12.5, fontWeight: 900, letterSpacing: 1.2 }}>
              DESCEND
            </PixelButton>
          )}

          {/* ── TABLO ── */}
          {d.board.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: C.boneFaint, marginBottom: 5 }}>
                TODAY’S DEEPEST
              </div>
              {d.board.map((r) => (
                <div key={r.rank} style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  fontSize: 11.5, padding: '3px 0',
                  color: r.rank <= 3 ? C.bone : C.boneDim,
                }}>
                  <span style={{ width: 22, textAlign: 'right', color: r.rank <= 3 ? C.candle : C.boneFaint, fontWeight: 900 }}>
                    {r.rank}
                  </span>
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>{kisa(r.wallet)}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 900 }}>d{r.depth}</span>
                </div>
              ))}
            </div>
          )}
          {d.board.length === 0 && (
            <div style={{ marginTop: 11, fontSize: 11, color: C.boneFaint }}>
              Nobody has finished today’s descent yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
