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
import { joinChat, type ChatHandle, type ChatMessage, type Kanal } from '@/lib/chat';
import { getMode } from '@/lib/session';
import { PixelButton, BTN } from '@/components/ui/kit';
import { C, FONT, thinGlass } from '@/lib/theme';

export function ChatPanel() {
  const handleRef = useRef<ChatHandle | null>(null);
  // ⚠️ DURUM REACT STATE'İNDE, ref'te DEĞİL. İlk sürüm handle'ı ref'te tutup
  // zorla yeniden çizdiriyordu; React'in çift-montajında bayat handle okunup
  // arayüz "bağlı değil" gösteriyordu — soket gayet açıkken. Ölçüldü.
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [bagli, setBagli] = useState(false);
  const [acik, setAcik] = useState(true);
  const [metin, setMetin] = useState('');
  const [kanal, setKanal] = useState<Kanal>('world');
  /** Lonca etiketi — `null` = loncasız, sekme kilitli */
  const [lonca, setLonca] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ⚠️ Demo modunda sohbet YOK: bağlantı cüzdan jetonu istiyor ve demo
    // oyuncusunun jetonu yok. Sahte bir sohbet göstermek, olmayan bir
    // topluluğu varmış gibi göstermek olurdu.
    if (getMode() !== 'wallet') return;
    const h = joinChat(setMsgs, setBagli, setLonca);
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
  }, [msgs.length, kanal]);

  /**
   * ⚠️ DEMO'DA `null` DÖNÜYORDU ve sohbet ekrandan TAMAMEN kayboluyordu.
   * Gerekçesi doğruydu — sahte mesaj göstermek olmayan bir topluluğu varmış
   * gibi göstermek olurdu — ama gereğinden ileri gidiyordu: VERİYİ değil
   * ÖZELLİĞİ saklıyordu. Demo oyuncusu oyunun sohbeti olduğunu hiç
   * öğrenmiyordu; kullanıcı da "chat paneli nereye gitti" diye sordu.
   *
   * Artık kutu duruyor, içi dürüstçe kilitli — market panelinin
   * "Demo gold cannot be sold" kutusuyla aynı desen. Sahte mesaj YOK,
   * bağlantı YOK (efekt hâlâ erken çıkıyor), sadece kapı görünür.
   */
  const kilitli = getMode() !== 'wallet';

  /**
   * Seçili kanalın mesajları.
   * ⚠️ `c` alanı OLMAYAN mesaj dünya sayılıyor: eski sunucu sürümü bu alanı
   * göndermiyordu ve zorunlu tutmak, sürüm atlarken sohbeti boşaltırdı.
   */
  const gorunen = msgs.filter((m) => (m.c ?? 'world') === kanal);

  const gonder = () => {
    if (kilitli) return;
    const t = metin.trim();
    if (!t) return;
    // ⚠️ Loncasızken lonca kanalına yazılamaz — sekme zaten kilitli ama
    // durum ayrık kalmasın: sunucu da bu mesajı düşürür.
    handleRef.current?.say(t, lonca ? kanal : 'world');
    setMetin('');
  };

  return (
    <div style={{
      position: 'absolute', left: 12, bottom: 12, zIndex: 6,
      width: 300, maxWidth: 'calc(100vw - 24px)',
      // ⚠️ İNCE CAM: sohbet kutusu köyün ÜSTÜNDE duruyor, arkasındaki
      // dünyayı kapatmamalı. Bulanıklık yüksek tutuluyor ki şeffaflık
      // okunaklılığı bozmasın (bkz. lib/theme.thinGlass).
      ...thinGlass(10), fontFamily: FONT.ui,
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
          background: kilitli ? C.boneFaint : bagli ? C.ok : C.boneFaint,
        }} />
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.6, color: C.ice }}>
          THE SQUARE
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.boneFaint }}>
          {acik ? '▾' : '▴'}
        </span>
      </button>

      {/* ⚠️ SEKMELER, AYRI PENCERE DEĞİL. İki ayrı sohbet kutusu köyün
          köşesini kaplardı; sekme, aynı yerde iki kanal demek. */}
      {acik && !kilitli && (
        <div style={{ display: 'flex', gap: 4, padding: '0 10px 7px' }}>
          {(['world', 'guild'] as const).map((k) => {
            const kilit = k === 'guild' && !lonca;
            const secili = kanal === k;
            return (
              <button
                key={k}
                onClick={() => { if (!kilit) setKanal(k); }}
                title={kilit ? 'Join a guild to unlock this channel' : undefined}
                style={{
                  all: 'unset', cursor: kilit ? 'not-allowed' : 'pointer',
                  padding: '3px 9px', borderRadius: 5, fontSize: 9.5,
                  fontWeight: 900, letterSpacing: 1.1,
                  color: kilit ? C.boneFaint : secili ? C.void : C.boneDim,
                  background: secili && !kilit ? C.ice : 'rgba(0,0,0,0.28)',
                  border: `1px solid ${secili && !kilit ? C.ice : C.border}`,
                  opacity: kilit ? 0.55 : 1,
                }}>
                {/* ⚠️ Kilit DÜRÜSTÇE gösteriliyor (Exchange deseni): boş bir
                    lonca kanalı açmak, olmayan bir topluluğu varmış gibi
                    göstermek olurdu. */}
                {k === 'world' ? 'WORLD' : lonca ? `[${lonca}]` : 'GUILD 🔒'}
              </button>
            );
          })}
        </div>
      )}

      {acik && kilitli && (
        <div style={{
          padding: '0 10px 10px', fontSize: 11, color: C.boneDim, lineHeight: 1.5,
        }}>
          Everyone who plays talks here. <b style={{ color: C.bone }}>Connect a
          wallet</b> to join them — the demo listens to no one and no one hears it.
        </div>
      )}

      {acik && !kilitli && (
        <>
          <div ref={listRef} style={{
            maxHeight: 168, overflowY: 'auto', padding: '0 10px 6px',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            {gorunen.length === 0 ? (
              <div style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5, padding: '4px 0' }}>
                {!bagli
                  ? 'Reaching the square…'
                  : kanal === 'guild'
                    ? 'Your guild has been silent.'
                    : 'Nobody has spoken yet. The village is quiet.'}
              </div>
            ) : gorunen.map((m, i) => (
              <div key={`${m.at}-${i}`} style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                {/* ⚠️ Lonca etiketi sohbette görünmezse lonca da görünmez.
                    İnsanlar bir topluluğa ancak onun VARLIĞINI gördükleri
                    için katılır — etiket, loncanın reklamıdır. */}
                {m.g && <span style={{ color: C.ice, fontWeight: 900 }}>[{m.g}] </span>}
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
              placeholder={
                !bagli ? 'not connected'
                  : kanal === 'guild' ? 'Say something to your guild…'
                    : 'Say something…'
              }
              disabled={!bagli}
              maxLength={180}
              style={{
                flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.35)',
                color: C.bone, fontFamily: FONT.ui, fontSize: 11.5, outline: 'none',
              }}
            />
            <PixelButton variant={BTN.action} scale={2} onClick={gonder}
              disabled={!bagli || !metin.trim()}
              style={{ flexShrink: 0, fontSize: 11, letterSpacing: 0.6 }}>
              SAY
            </PixelButton>
          </div>
        </>
      )}
    </div>
  );
}
