'use client';
// KÖY SOHBETİ — arayüz.
//
// ⚠️ PANEL DEĞİL, KÖŞEDE DURAN BİR KUTU. Sohbeti bir panele koymak
// (Forge/Tavern gibi) onu "gidip bakılan bir yer" yapardı; oysa işe yaraması
// için oyuncu gezerken KENDİLİĞİNDEN görünmesi lazım. İnsanların orada
// olduğunu görmeyen oyuncu, sohbet olduğunu da bilmez.
//
// ⚠️ KATLANABİLİR ve varsayılan KAPALI değil AÇIK: kapalı başlarsa çoğu
// oyuncu hiç açmaz ve sosyal katman ölü doğar.

import { useEffect, useRef, useState } from 'react';
import { joinChat, type ChatHandle, type ChatMessage } from '@/lib/chat';
import { getMode } from '@/lib/session';
import { C, FONT, glass } from '@/lib/theme';

export function ChatPanel() {
  const handleRef = useRef<ChatHandle | null>(null);
  // ⚠️ DURUM REACT STATE'İNDE, ref'te DEĞİL. İlk sürüm handle'ı ref'te tutup
  // zorla yeniden çizdiriyordu; React'in çift-montajında bayat handle okunup
  // arayüz "bağlı değil" gösteriyordu — soket gayet açıkken. Ölçüldü.
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [bagli, setBagli] = useState(false);
  const [acik, setAcik] = useState(true);
  const [metin, setMetin] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ⚠️ Demo modunda sohbet YOK: bağlantı cüzdan jetonu istiyor ve demo
    // oyuncusunun jetonu yok. Sahte bir sohbet göstermek, olmayan bir
    // topluluğu varmış gibi göstermek olurdu.
    if (getMode() !== 'wallet') return;
    const h = joinChat(setMsgs, setBagli);
    handleRef.current = h;
    return () => {
      // ⚠️ setBagli(false) BURADA YOK. Cleanup, StrictMode'da yeni bağlantı
      // kurulduktan SONRA çalışabiliyor; burada false yazmak yeni soketin
      // "açıldım" bildirimini ezerdi. Kapanan tutamak zaten susturuluyor.
      h.close();
      handleRef.current = null;
    };
  }, []);

  // Yeni mesaj gelince en alta kaydır — ama SADECE zaten en alttaysa.
  // Yukarı kaydırıp okuyan oyuncuyu zorla aşağı atmak sinir bozucu olurdu.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const enAltta = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (enAltta) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  if (getMode() !== 'wallet') return null;

  const gonder = () => {
    const t = metin.trim();
    if (!t) return;
    handleRef.current?.say(t);
    setMetin('');
  };

  return (
    <div style={{
      position: 'absolute', left: 12, bottom: 12, zIndex: 6,
      width: 300, maxWidth: 'calc(100vw - 24px)',
      ...glass(10), fontFamily: FONT.ui,
      // ⚠️ Tıklamalar sohbete gelsin ama KUTU DIŞINDA köye geçsin —
      // yoksa sohbetin bulunduğu köşede karakter hareket ettirilemez.
      pointerEvents: 'auto',
    }}>
      <button
        onClick={() => setAcik((v) => !v)}
        style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: 7, width: '100%', boxSizing: 'border-box', padding: '7px 10px',
        }}>
        <span style={{
          width: 7, height: 7, borderRadius: 4,
          background: bagli ? C.ok : C.boneFaint,
        }} />
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.6, color: C.ice }}>
          THE SQUARE
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.boneFaint }}>
          {acik ? '▾' : '▴'}
        </span>
      </button>

      {acik && (
        <>
          <div ref={listRef} style={{
            maxHeight: 168, overflowY: 'auto', padding: '0 10px 6px',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            {msgs.length === 0 ? (
              <div style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5, padding: '4px 0' }}>
                {bagli
                  ? 'Nobody has spoken yet. The village is quiet.'
                  : 'Reaching the square…'}
              </div>
            ) : msgs.map((m, i) => (
              <div key={`${m.at}-${i}`} style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                <span style={{ color: C.candle, fontWeight: 900 }}>{m.n}</span>
                <span style={{ color: C.boneFaint }}>: </span>
                <span style={{ color: C.bone, wordBreak: 'break-word' }}>{m.m}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 10px 9px' }}>
            <input
              value={metin}
              onChange={(e) => setMetin(e.target.value)}
              onKeyDown={(e) => {
                // ⚠️ TUŞLAR KÖYE SIZMAMALI. Sohbete "wasd" yazan oyuncunun
                // karakteri de hareket ederdi; hub tuş dinleyicisi window'da.
                e.stopPropagation();
                if (e.key === 'Enter') gonder();
              }}
              placeholder={bagli ? 'Say something…' : 'not connected'}
              disabled={!bagli}
              maxLength={180}
              style={{
                flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
                color: C.bone, fontFamily: FONT.ui, fontSize: 11.5, outline: 'none',
              }}
            />
            <button onClick={gonder} disabled={!bagli || !metin.trim()}
              style={{
                all: 'unset', cursor: bagli && metin.trim() ? 'pointer' : 'default',
                padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 900,
                color: bagli && metin.trim() ? '#1a0508' : C.boneFaint,
                background: bagli && metin.trim()
                  ? `linear-gradient(180deg, ${C.candleSoft}, ${C.candle})`
                  : 'rgba(227,216,192,0.07)',
              }}>
              SAY
            </button>
          </div>
        </>
      )}
    </div>
  );
}
