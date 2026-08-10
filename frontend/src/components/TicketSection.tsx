'use client';
// DESTEK TALEBİ — oyuncu tarafı. Ayarlar panelinin içinde durur.
//
// ⚠️ AYRI BİR SEKME DEĞİL, AYARLARIN İÇİNDE (kullanıcının kararı). Destek
// günde bir açılan bir yer değil; rıhtımda kendi düğmesini hak edecek
// kadar sık kullanılmıyor ve orada durması diğer sekmeleri seyreltirdi.
//
// ⚠️ AÇIK TALEP VARSA ÖNCE O GÖRÜNÜR, form altta. Oyuncu genelde
// "cevap geldi mi" diye bakmaya geliyor, ikinci bir talep açmaya değil.

import { useCallback, useEffect, useState } from 'react';
import { TICKET } from '@/game/tickets';
import { fetchTickets, openTicket, replyTicket, type TicketView } from '@/lib/gameSession';
import { getMode } from '@/lib/session';
import { CardSection } from '@/components/ui/cards';
import { PixelButton, BTN } from '@/components/ui/kit';
import { panelUnlocked, isTestMode, TEST_TICKETS } from '@/lib/testMode';
import { C, FONT, glass } from '@/lib/theme';

const girdi = {
  width: '100%', boxSizing: 'border-box' as const, padding: '7px 9px',
  borderRadius: 6, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
  color: C.bone, fontFamily: FONT.ui, fontSize: 12, outline: 'none',
};

/**
 * "3d ago" / "5h ago" / "just now" — kaba ama okunur.
 *
 * ⚠️ NİYE VAR: talep satırında konu ve durum vardı, TARİH YOKTU. Cevap
 * bekleyen oyuncunun ilk sorusu "ne zamandır bekliyorum"; sunucu `createdAt`
 * gönderiyordu ve arayüz onu hiç okumuyordu.
 */
function yas(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const dk = Math.floor(ms / 60_000);
  if (dk < 2) return 'just now';
  if (dk < 60) return `${dk}m ago`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa}h ago`;
  return `${Math.floor(sa / 24)}d ago`;
}

export function TicketSection({ onError }: { onError: (m: string) => void }) {
  const [list, setList] = useState<TicketView[] | null>(null);
  const [konu, setKonu] = useState('');
  const [govde, setGovde] = useState('');
  const [acik, setAcik] = useState<string | null>(null);
  const [cevap, setCevap] = useState('');
  const [busy, setBusy] = useState(false);

  const yukle = useCallback(() => {
    fetchTickets().then(setList).catch(() => setList([]));
  }, []);
  // ⚠️ TEST MODUNDA SAHTE LİSTE. Bir önceki denemede paneli açıp veriyi
  // vermemiştim: `list` null kaldı ve panel sonsuza kadar "Reading your
  // tickets…" yazdı. Kilidi açmak yetmiyor, verisini de vermek gerekiyor.
  useEffect(() => {
    if (isTestMode()) { setList(TEST_TICKETS as unknown as TicketView[]); return; }
    if (getMode() === 'wallet') yukle();
  }, [yukle]);

  if (!panelUnlocked(getMode())) {
    return (
      <CardSection label="Support" tone={C.ice}>
        <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.55 }}>
          Tickets are tied to a wallet — connect one and we can answer you.
        </div>
      </CardSection>
    );
  }

  const sar = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); yukle(); }
    catch (e) { onError(e instanceof Error ? e.message : 'Could not send it.'); }
    finally { setBusy(false); }
  };

  const acikSayisi = (list ?? []).filter((t) => t.status !== 'closed').length;

  return (
    <CardSection label="Support" tone={C.ice}>
      {list === null ? (
        <div style={{ fontSize: 11.5, color: C.boneFaint }}>Reading your tickets…</div>
      ) : (
        <>
          {list.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
              {list.map((t) => {
                const secili = acik === t.id;
                const bekliyor = t.status === 'answered';
                return (
                  <div key={t.id} style={{
                    borderRadius: 8, fontFamily: FONT.ui,
                    border: `1px solid ${bekliyor ? `${C.candle}66` : 'rgba(255,255,255,0.10)'}`,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.26))',
                  }}>
                    <button onClick={() => { setAcik(secili ? null : t.id); setCevap(''); }}
                      style={{
                        all: 'unset', cursor: 'pointer', display: 'flex', width: '100%',
                        boxSizing: 'border-box', alignItems: 'center', gap: 8, padding: '8px 11px',
                      }}>
                      {/* ⚠️ "Cevap geldi" en görünür bilgi olmalı — oyuncu
                          buraya çoğunlukla onu görmeye geliyor. */}
                      <span style={{
                        width: 7, height: 7, borderRadius: 4, flexShrink: 0,
                        background: bekliyor ? C.candle
                          : t.status === 'closed' ? 'rgba(125,117,101,0.6)' : C.ice,
                      }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 900,
                        color: C.bone, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' }}>
                        {t.subject}
                      </span>
                      {/* ⚠️ Tarih durumun SOLUNDA ve soluk: asıl bilgi hâlâ
                          "cevap geldi mi", yaş ikincil. */}
                      <span style={{ fontSize: 10, color: C.boneFaint, flexShrink: 0 }}>
                        {yas(t.createdAt)}
                      </span>
                      <span style={{ fontSize: 10, color: bekliyor ? C.candle : C.boneFaint }}>
                        {bekliyor ? 'ANSWERED' : t.status.toUpperCase()}
                      </span>
                    </button>

                    {secili && (
                      <div style={{ padding: '0 11px 10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6,
                          maxHeight: 190, overflowY: 'auto', marginBottom: 8 }}>
                          {t.messages.map((m, i) => (
                            <div key={i} style={{
                              alignSelf: m.fromAdmin ? 'flex-start' : 'flex-end',
                              maxWidth: '88%', padding: '6px 9px', borderRadius: 7,
                              fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                              color: m.fromAdmin ? C.bone : C.boneDim,
                              background: m.fromAdmin
                                ? 'rgba(239,167,46,0.14)' : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${m.fromAdmin ? `${C.candle}44` : 'rgba(255,255,255,0.09)'}`,
                            }}>
                              {m.fromAdmin && (
                                <span style={{ display: 'block', fontSize: 9, fontWeight: 900,
                                  letterSpacing: 1.2, color: C.candle, marginBottom: 2 }}>
                                  GRAVEBORN
                                </span>
                              )}
                              {m.body}
                            </div>
                          ))}
                        </div>
                        {t.status === 'closed' ? (
                          <div style={{ fontSize: 11, color: C.boneFaint }}>
                            This ticket is closed. Open a new one if it happens again.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input value={cevap} onChange={(e) => setCevap(e.target.value)}
                              maxLength={TICKET.bodyMax} placeholder="Add something…"
                              onKeyDown={(e) => e.stopPropagation()}
                              style={girdi} />
                            {/* ⚠️ scale 2 = 32px yükseklik, girdiyle aynı hizada durur. */}
                            <PixelButton variant={BTN.action} scale={2}
                              disabled={busy || cevap.trim().length < 2}
                              onClick={() => sar(async () => {
                                await replyTicket(t.id, cevap);
                                setCevap('');
                              })}
                              style={{ flexShrink: 0, fontSize: 11, letterSpacing: 0.6 }}>
                              SEND
                            </PixelButton>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── YENİ TALEP ── */}
          {acikSayisi >= TICKET.maxOpen ? (
            <div style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
              You have {acikSayisi} tickets open. We will get to them — close one
              before starting another.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input value={konu} onChange={(e) => setKonu(e.target.value)}
                maxLength={TICKET.subjectMax} placeholder="What is it about?"
                onKeyDown={(e) => e.stopPropagation()} style={girdi} />
              <textarea value={govde} onChange={(e) => setGovde(e.target.value)}
                maxLength={TICKET.bodyMax} rows={3}
                placeholder="What happened? The more exact, the faster we can check it."
                onKeyDown={(e) => e.stopPropagation()}
                style={{ ...girdi, resize: 'vertical', lineHeight: 1.5 }} />
              <PixelButton variant={BTN.strong} scale={3}
                disabled={busy || konu.trim().length < 3 || govde.trim().length < 10}
                onClick={() => sar(async () => {
                  await openTicket(konu, govde);
                  setKonu(''); setGovde('');
                })}
                style={{ width: '100%', fontSize: 12, letterSpacing: 1 }}>
                SEND A TICKET
              </PixelButton>
              {/* ⚠️ Cüzdanın zaten bize geldiği YAZILI olmalı: oyuncu
                  "kim olduğumu nereden bileceksiniz" diye sormasın. */}
              <div style={{ fontSize: 10.5, color: C.boneFaint, lineHeight: 1.5 }}>
                Your wallet comes with the ticket, so you do not need to write it.
              </div>
            </div>
          )}
        </>
      )}
    </CardSection>
  );
}
