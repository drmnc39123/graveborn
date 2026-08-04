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
import { applyFxSettings } from '@/game/fx';
import { loadSettings, saveSettings, type Settings } from '@/game/settings';
import { setVolume } from '@/game/sfx';
import { Card, CardSection } from '@/components/ui/cards';
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

export function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);

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
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2.5, color: C.blood, marginBottom: 4 }}>
        SETTINGS
      </div>
      <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900, color: C.bone }}>How it plays</h2>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: C.boneDim, lineHeight: 1.55 }}>
        None of these change a single number in a fight — they change what you see and hear.
      </p>

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
            label="Screen shake"
            hint="Turn this off if motion bothers you. Damage feedback stays — the red edge and the numbers do not depend on it."
            on={s.screenShake}
            onChange={(v) => patch({ screenShake: v })}
          />
        </Card>
        <Card>
          <Toggle
            label="Damage numbers"
            hint="The number that pops off every hit. Crowded screens get quieter without it."
            on={s.damageNumbers}
            onChange={(v) => patch({ damageNumbers: v })}
          />
        </Card>
        <Card>
          <Toggle
            label="Low graphics"
            hint="Fewer corpses, sparks and atmosphere. For weaker devices — it does not make the game easier."
            on={s.lowGraphics}
            onChange={(v) => patch({ lowGraphics: v })}
          />
        </Card>
      </div>

      <CardSection label="WHERE THESE LIVE">
        <span style={{ fontSize: 11, color: C.boneFaint, lineHeight: 1.5 }}>
          On this device only. They are not part of your account — a wallet you open on
          your phone starts with its own settings, which is usually what you want.
        </span>
      </CardSection>
    </>
  );
}
