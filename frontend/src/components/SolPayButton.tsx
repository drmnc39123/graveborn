'use client';
// SOL İLE ÖDE — dört dükkânın ortak düğmesi.
//
// ⚠️ NİYE TEK BİLEŞEN: dört yerde ayrı ayrı yazılsaydı hata durumları,
// "ray kapalı" davranışı ve kur açıklaması dört kez yazılırdı ve zamanla
// ayrışırdı. Bu depoda "aynı kural iki yerde yazılınca ayrışır" dersi
// defalarca alındı.
//
// ⚠️ GOLD YOLU HER ZAMAN AÇIK. Bu düğme onun YANINDA duruyor, yerine
// geçmiyor: SOL bir kolaylık, gold ise oyunun kendisi. Bu yüzden SOL
// düğmesi hep daha sönük ve fiyatın yanında kur yazıyor.
//
// ⚠️ RAY KAPALIYKEN HİÇ ÇİZİLMİYOR. Yarı çalışan bir ödeme düğmesi
// göstermek, oyuncuyu olmayan bir işleme sokmaktır.

import { useCallback, useEffect, useState } from 'react';
import { panelUnlocked } from '@/lib/testMode';
import { getMode } from '@/lib/session';
import { api } from '@/lib/session';
import { solIleAl, type SolConfig } from '@/lib/solPay';
import { solLabel } from '@/game/solPrice';
import { C, FONT } from '@/lib/theme';

/** Ray durumu bir kez okunur ve modül boyunca paylaşılır */
let cfgSoz: Promise<SolConfig> | null = null;
function solConfig(): Promise<SolConfig> {
  if (!cfgSoz) {
    cfgSoz = api<SolConfig>('/sol/config').catch(() => ({ open: false, treasury: null }));
  }
  return cfgSoz;
}

const HATA_METNI: Record<string, string> = {
  sol_kapali: 'SOL payments are not open yet.',
  sol_rayinda_degil: 'This one is gold only.',
  cuzdan_bulunamadi: 'Could not reach your wallet. Reconnect and try again.',
  cuzdan_odeme_desteklemiyor: 'This wallet cannot send payments. Gold still works.',
  imza_kullanilmis: 'That payment was already used.',
  islem_basarisiz: 'The transfer failed on-chain. Nothing was charged.',
  islem_bulunamadi: 'The network has not confirmed it yet — try again in a moment.',
  tutar_yetersiz: 'The transfer was short of the price.',
  odeyen_farkli: 'That payment came from a different wallet.',
  zincir_okunamadi: 'Could not read the chain. If you were charged, keep the signature.',
  // ⚠️ EN ÖNEMLİ METİN: para gitti ama ürün gelmedi. Oyuncuya ne
  // yapacağını SÖYLEMEK zorundayız, "bir hata oluştu" demek değil.
  urun_verilemedi: 'You were charged but the item could not be granted. Open a ticket with the signature shown in your wallet — we can see the payment.',
  zaten_loncada: 'You are already in a guild.',
  yukseltilemez: 'Nothing to upgrade right now.',
};

export function SolPayButton({ urun, lamports, onDone, onError, ek, disabled }: {
  urun: 'reliquary10' | 'ossuary' | 'guild' | 'guild_up' | 'battlepass';
  /** gösterilecek fiyat — null ise ürün SOL rayında değil, düğme çizilmez */
  lamports: number | null;
  onDone: (sig: string) => Promise<void>;
  onError: (msg: string) => void;
  ek?: Record<string, unknown>;
  disabled?: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let iptal = false;
    if (!panelUnlocked(getMode())) return;
    solConfig().then((c) => { if (!iptal) setAcik(c.open); });
    return () => { iptal = true; };
  }, []);

  const bas = useCallback(async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await solIleAl(urun, onDone, ek);
    } catch (e) {
      const kod = (e as { code?: string; message?: string })?.code
        ?? (e as { message?: string })?.message ?? '';
      // ⚠️ Cüzdanın kendi iptali HATA DEĞİL: oyuncu vazgeçti, ekrana
      // kırmızı bir uyarı basmak onu suçlamak olurdu.
      if (/reject|declin|cancel|User rejected/i.test(String(kod))) return;
      onError(HATA_METNI[kod] ?? 'The payment did not go through.');
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, urun, ek, onDone, onError]);

  // Ray kapalı ya da ürün SOL rayında değilse HİÇ çizme
  if (!acik || lamports === null) return null;

  return (
    <button
      onClick={bas}
      disabled={busy || disabled}
      title="Pay in SOL instead of gold"
      style={{
        all: 'unset', boxSizing: 'border-box',
        cursor: busy || disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 9px', borderRadius: 5, fontFamily: FONT.ui,
        fontSize: 10.5, fontWeight: 900, letterSpacing: 0.6,
        // ⚠️ GOLD DÜĞMESİNDEN SÖNÜK: SOL bir kolaylık, ana yol değil.
        color: busy ? C.boneFaint : C.ice,
        border: `1px solid ${C.ice}40`,
        background: `${C.ice}0e`,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {busy ? 'WAITING…' : `PAY ${solLabel(lamports)}`}
    </button>
  );
}

/**
 * SOL yolunun ne olduğunu söyleyen tek satır.
 *
 * ⚠️ KUR AÇIKLAMASI KALDIRILDI: referans kur kavramı kullanıcı kararıyla
 * kalktı, fiyatlar artık düz. Geriye söylenmesi gereken tek şey kalıyor —
 * bu bir KOLAYLIK, zorunluluk değil. O cümle kalmalı: yanında SOL düğmesi
 * duran bir gold fiyatı, söylenmezse "asıl yol bu mu?" sorusunu doğurur.
 */
export function SolRateNote() {
  const [acik, setAcik] = useState(false);
  useEffect(() => {
    let iptal = false;
    if (!panelUnlocked(getMode())) return;
    solConfig().then((c) => { if (!iptal) setAcik(c.open); });
    return () => { iptal = true; };
  }, []);
  if (!acik) return null;
  return (
    <div style={{ fontSize: 10, color: C.boneFaint, fontFamily: FONT.ui, marginTop: 4 }}>
      Paying in SOL is optional — everything here can be earned with gold.
    </div>
  );
}
