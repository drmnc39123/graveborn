'use client';
// ARKADAŞLAR — özel mesaj.
//
// ⚠️ ARKADAŞ = KARŞILIKLI TAKİP. Tek yönlü takiple DM açmak, herkesin
// herkese yazabilmesi demekti; karşılıklı takip iki tarafın da onay
// verdiği tek işaret ve fazladan bir "istek kabul et" ekranı
// gerektirmiyor (bkz. `backend/dm.ts`).
//
// ══════════════════════════════════════════════════════════════════════
// 🔴 DM EMANET DEĞİLDİR ve bunu SÖYLEMEK zorundayız.
//
// Bu panelin var olma sebebi gold ticaretini kolaylaştırmak. Aynı sebep,
// en eski oyun dolandırıcılığını da davet ediyor: "önce sen gönder, ben
// hemen atarım." Marketplace'te gold escrow'a kilitleniyor ve alım tek
// işlemde kapanıyor; burada öyle bir şey YOK.
//
// Uyarıyı gizlemek, dolandırılan oyuncuya "bilmiyordum" dedirtir ve
// haklı olur.
// ══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { getMode } from '@/lib/session';
import {
  fetchDmThread, fetchDmThreads, sendDm, type DmMessage, type DmThread,
} from '@/lib/gameSession';
import { PanelHead, Tag } from '@/components/ui/cards';
import { BTN, PixelButton } from '@/components/ui/kit';
import { C, FONT, glass } from '@/lib/theme';

const HATA: Record<string, string> = {
  arkadas_degil: 'You are not friends yet — you both have to be watching each other.',
  cok_hizli: 'Slow down a moment.',
  bos_mesaj: 'Say something first.',
};

export function FriendsPanel({ onError }: { onError: (msg: string) => void }) {
  const [threads, setThreads] = useState<DmThread[] | null>(null);
  const [acik, setAcik] = useState<string | null>(null);
  const [mesajlar, setMesajlar] = useState<DmMessage[]>([]);
  const [metin, setMetin] = useState('');
  const [busy, setBusy] = useState(false);
  const dip = useRef<HTMLDivElement>(null);

  const yukle = useCallback(() => {
    fetchDmThreads().then((r) => setThreads(r.threads)).catch(() => setThreads([]));
  }, []);
  useEffect(() => { if (panelUnlocked(getMode())) yukle(); }, [yukle]);

  const ac = useCallback(async (wallet: string) => {
    setAcik(wallet);
    setMesajlar([]);
    try {
      setMesajlar((await fetchDmThread(wallet)).messages);
      // ⚠️ Liste YENİDEN çekiliyor: konuşmayı açmak okunmamışı sıfırlıyor
      // ve rozet ekranda kırmızı kalmamalı.
      yukle();
    } catch (e) {
      onError(HATA[(e as { code?: string })?.code ?? ''] ?? 'Could not open that.');
    }
  }, [onError, yukle]);

  // ⚠️ Yeni mesajda en alta kaydır — konuşma yukarıdan aşağı okunuyor.
  useEffect(() => { dip.current?.scrollIntoView({ block: 'end' }); }, [mesajlar]);

  const gonder = useCallback(async () => {
    if (busy || !acik || metin.trim().length === 0) return;
    setBusy(true);
    try {
      const m = await sendDm(acik, metin.trim());
      // ⚠️ Yerel olarak ekleniyor: tam listeyi yeniden çekmek, yazdığın
      // mesajın ekranda belirmesini bir gidiş-dönüş geciktirirdi.
      setMesajlar((v) => [...v, m.message]);
      setMetin('');
    } catch (e) {
      onError(HATA[(e as { code?: string })?.code ?? ''] ?? 'That did not send.');
    } finally { setBusy(false); }
  }, [busy, acik, metin, onError]);

  if (!panelUnlocked(getMode())) {
    return (
      <PanelHead kicker="FRIENDS" title="People you both keep an eye on" accent={C.ice}
        sub="Messages live in the village ledger, not on your device. Connect a wallet to write to anyone." />
    );
  }

  const secili = threads?.find((t) => t.wallet === acik) ?? null;

  return (
    <>
      <PanelHead kicker="FRIENDS" title="People you both keep an eye on" accent={C.ice}
        sub="Anyone who is on your watch list and has you on theirs. Add people from the square or the ladder." />

      {/* 🔴 UYARI KALDIRILAMAZ — bkz. dosya başlığı */}
      <div style={{
        ...glass(9), padding: '9px 11px', marginBottom: 12,
        border: `1px solid ${C.badText}33`, background: 'rgba(228,101,122,0.07)',
        fontSize: 11, color: C.boneDim, lineHeight: 1.5, fontFamily: FONT.ui,
      }}>
        <strong style={{ color: C.badText }}>Messages are not an escrow.</strong>{' '}
        If you agree a trade here, do it through the Marketplace — there the gold is locked
        up front and the swap closes in one step. Anyone who asks you to send first is
        telling you something about themselves.
      </div>

      {threads === null && (
        <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
          textAlign: 'center', fontFamily: FONT.ui }}>Reading the ledger…</div>
      )}

      {threads !== null && threads.length === 0 && (
        /* ⚠️ BOŞ EKRAN "BOZUK" DEMEKTİR: ne yapılacağı yazılmalı. */
        <div style={{ ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
          textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui }}>
          Nobody yet. A friend is somebody you watch who also watches you —
          add people from the square with the <strong style={{ color: C.boneDim }}>+</strong> beside
          their name, or from the ladder, and ask them to add you back.
        </div>
      )}

      {threads !== null && threads.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Liste */}
          <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex',
            flexDirection: 'column', gap: 4 }}>
            {threads.map((t) => {
              const on = t.wallet === acik;
              return (
                <button key={t.wallet} onClick={() => void ac(t.wallet)} style={{
                  all: 'unset', cursor: 'pointer', padding: '7px 9px', borderRadius: 6,
                  fontFamily: FONT.ui, minWidth: 0,
                  background: on ? 'rgba(138,151,163,0.20)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${on ? `${C.ice}55` : 'rgba(255,255,255,0.08)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* ⚠️ Çevrimiçi noktası: listenin işe yaradığı an tam
                        olarak birinin çevrimiçi olduğu an. */}
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: t.online ? C.ok : 'rgba(255,255,255,0.18)',
                    }} />
                    <span style={{ fontSize: 11.5, fontWeight: 900, color: C.bone,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </span>
                    {t.unread > 0 && <span style={{ marginLeft: 'auto' }}>
                      <Tag tone="blood">{t.unread}</Tag>
                    </span>}
                  </div>
                  {t.lastBody && (
                    <div style={{ fontSize: 10, color: C.boneFaint, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.lastBody}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Konuşma */}
          <div style={{ flex: '2 1 240px', minWidth: 0 }}>
            {!secili ? (
              <div style={{ ...glass(9), padding: '16px 14px', fontSize: 11.5,
                color: C.boneFaint, textAlign: 'center', fontFamily: FONT.ui }}>
                Pick someone.
              </div>
            ) : (
              <>
                <div style={{
                  ...glass(9), padding: '9px 10px', maxHeight: 210, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 5, fontFamily: FONT.ui,
                }}>
                  {mesajlar.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.boneFaint, textAlign: 'center' }}>
                      Nothing said yet.
                    </div>
                  ) : mesajlar.map((m) => (
                    <div key={m.id} style={{
                      alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '85%',
                      padding: '5px 9px', borderRadius: 7, fontSize: 11.5, lineHeight: 1.45,
                      wordBreak: 'break-word',
                      color: m.mine ? C.bone : C.boneDim,
                      background: m.mine ? 'rgba(239,167,46,0.14)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${m.mine ? `${C.candle}33` : 'rgba(255,255,255,0.09)'}`,
                    }}>{m.body}</div>
                  ))}
                  <div ref={dip} />
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                  <input
                    value={metin}
                    onChange={(e) => setMetin(e.target.value)}
                    // ⚠️ TUŞLAR KÖYE SIZMAMALI: sohbete "wasd" yazan
                    // oyuncunun karakteri de hareket ederdi.
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void gonder(); }}
                    maxLength={400}
                    placeholder={`Write to ${secili.name}…`}
                    style={{
                      flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 6,
                      border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
                      color: C.bone, fontFamily: FONT.ui, fontSize: 12, outline: 'none',
                    }} />
                  <PixelButton variant={BTN.strong} scale={2}
                    disabled={busy || metin.trim().length === 0} onClick={gonder}>
                    SEND
                  </PixelButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
