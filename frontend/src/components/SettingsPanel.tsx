'use client';
// AYARLAR — ses, görüntü, erişilebilirlik.
//
// ⚠️ BURADA DENGE AYARI YOK ve olmayacak. Her seçenek ya sunum ya konfor;
// bir ayar stat değiştirseydi "en iyi ayar" diye bir şey doğar ve oyuncu
// görsel tercihini bırakıp onu seçmek zorunda kalırdı.
//
// ⚠️ Ekran sarsıntısı ERİŞİLEBİLİRLİK maddesi, süs değil: vestibüler
// rahatsızlığı olan biri için sarsıntı oyunu oynanamaz yapar. Kapalıyken
// hasar geri bildirimi vinyet + hasar sayısıyla sürüyor, yani bilgi
// kaybolmuyor — sadece hareket kalkıyor.

import { useCallback, useEffect, useState } from 'react';
import { TicketSection } from '@/components/TicketSection';
import { applyFxSettings } from '@/game/fx';
import { loadSettings, saveSettings, type Settings } from '@/game/settings';
import { setVolume } from '@/game/sfx';
import { resetHints } from '@/game/tutorial';
import { Card, CardSection, PanelHead } from '@/components/ui/cards';
import { PixelButton, BTN } from '@/components/ui/kit';
import { C } from '@/lib/theme';

/** Ayarları yükle ve motora/ses zincirine uygula — açılışta bir kez çağrılır */
export function applyStoredSettings(): Settings {
  const s = loadSettings();
  setVolume(s.volume);
  applyFxSettings(s);
  return s;
}

function Toggle({ label, hint, on, onChange }: {
  label: string; hint: string; on: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!on)}
      style={{
        all: 'unset', boxSizing: 'border-box', display: 'flex', width: '100%',
        alignItems: 'center', gap: 11, padding: '11px 12px', cursor: 'pointer',
      }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: C.bone }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, color: C.boneFaint, marginTop: 3, lineHeight: 1.45 }}>
          {hint}
        </span>
      </span>
      {/* Anahtar — açık/kapalı tek bakışta okunmalı */}
      <span style={{
        flexShrink: 0, width: 44, height: 24, borderRadius: 12, position: 'relative',
        background: on ? 'rgba(160,18,38,0.45)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${on ? 'rgba(228,101,122,0.6)' : 'rgba(255,255,255,0.14)'}`,
        transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 22 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: on ? '#ffd9df' : C.boneFaint, transition: 'left 0.15s',
        }} />
      </span>
    </button>
  );
}

export function SettingsPanel({ onError }: { onError: (m: string) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { setS(applyStoredSettings()); }, []);

  const patch = useCallback((next: Partial<Settings>) => {
    setS((prev) => {
      if (!prev) return prev;
      const v = { ...prev, ...next };
      saveSettings(v);
      // ⚠️ ANINDA uygula — "kaydet" düğmesi yok. Ses seviyesini kaydırırken
      // duymamak, doğru seviyeyi bulmayı imkânsız kılardı.
      setVolume(v.volume);
      applyFxSettings(v);
      return v;
    });
  }, []);

  if (!s) return null;

  return (
    <>
      <PanelHead
        kicker="SETTINGS" accent={C.boneFaint}
        title="How it plays"
        sub="None of these change a single number in a fight — they change what you see and hear."
      />

      {/* ── SES ── */}
      <Card>
        <div style={{ padding: '13px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: C.bone }}>Volume</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: C.candle }}>
              {Math.round(s.volume * 100)}%
            </span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05} value={s.volume}
            onChange={(e) => patch({ volume: Number(e.target.value) })}
            style={{ width: '100%', marginTop: 9, accentColor: C.blood }}
          />
          <div style={{ fontSize: 11, color: C.boneFaint, marginTop: 5, lineHeight: 1.45 }}>
            {s.volume === 0
              ? 'Silent. Nothing will be heard, including the boss telegraph.'
              : 'Every sound in the game is generated, not recorded — there are no audio files to load.'}
          </div>
        </div>
      </Card>

      {/* ── GÖRÜNTÜ + ERİŞİLEBİLİRLİK ── */}
      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Card>
          <Toggle
            label="Damage numbers"
            hint="The number that pops off every hit. Crowded screens get quieter without it."
            on={s.damageNumbers}
            onChange={(v) => patch({ damageNumbers: v })}
          />
        </Card>
        <Card>
          {/* ⚠️ METİN ÖLÇÜMLE DÜZELTİLDİ. Eskisi "For weaker devices"
              diyordu, yani PERFORMANS vaat ediyordu. ÖLÇÜLDÜ (400 düşmanlık
              derin sahne, 30 kare, çizim çağrısı sayımı): ayar toplam işi
              yalnız **%1,1** azaltıyor — 16.776 → 16.596 çağrı.
              SEBEBİ YAPISAL: `isLowGfx()` sadece `fx.ts` ve `stageGround.ts`
              tarafından okunuyor; düşmanları/mermileri/mücevherleri çizen
              `render.ts` bayrağı HİÇ okumuyor.
              ⚠️ BU BİR EKSİK DEĞİL: asıl performans kazançları zaten
              yapısal olarak alındı (görüş alanı kırpması · yörünge
              parıltısının sprite'a pişirilmesi · `ctx.filter`ın sıcak
              döngüden çıkarılması). Ayar, güvenle kısabileceğinin sınırında.
              ⚠️ "Zayıf cihaz" vaadini GERİ EKLEME — tutulamayan bir söz.
              ⚠️ Ölçüm aletinin sınırı: Node'da sprite yüklenmiyor, yani
              `drawImage` 0 çıkıyor ve düşmanlar yedek daireyle sayılıyor.
              Kırılım gerçek tarayıcıyı DEĞİL, çağrı hacmini gösterir. */}
          <Toggle
            label="Less atmosphere"
            hint="Fewer corpses, sparks and fog. Calms a crowded screen — it does not make the game easier or noticeably faster."
            on={s.lowGraphics}
            onChange={(v) => patch({ lowGraphics: v })}
          />
        </Card>
      </div>

      {/* ⚠️ Tutorial ipuçları bir kez görünüp bir daha çıkmıyor; sıfırlama
          olmadan oyuncu kaçırdığı bir cümleyi bir daha ASLA göremez. */}
      <Card>
        <div style={{ padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: C.bone }}>
              Hints
            </span>
            <span style={{ display: 'block', fontSize: 11, color: C.boneFaint, marginTop: 3, lineHeight: 1.45 }}>
              Each one shows once. Bring them back if you missed something.
            </span>
          </span>
          <PixelButton variant={BTN.action} scale={2} style={{ flexShrink: 0, fontSize: 10.5, letterSpacing: 0.8 }}
            onClick={() => { resetHints(); setFlash('Hints will show again next run.'); }}>
            SHOW AGAIN
          </PixelButton>
        </div>
        {flash && (
          <div style={{ padding: '7px 12px', borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11, color: C.ice }}>{flash}</div>
        )}
      </Card>

      {/* ⚠️ DESTEK AYARLARIN İÇİNDE (kullanıcının kararı). Rıhtımda kendi
          düğmesini hak edecek kadar sık kullanılmıyor; oraya konsaydı
          diğer sekmeleri seyreltirdi. */}
      <TicketSection onError={onError} />

      <CardSection label="WHERE THESE LIVE">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          On this device only. They are not part of your account — a wallet you open on
          your phone starts with its own settings, which is usually what you want.
        </span>
      </CardSection>
    </>
  );
}
