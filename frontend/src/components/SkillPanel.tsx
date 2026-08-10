'use client';
// BECERİ AĞACI — arayüz.
//
// ⚠️ PANELİN ASIL İŞİ SEÇİMİ GÖRÜNÜR KILMAK. Ağacın tamamı doldurulamıyor
// ve çatallar birbirini kilitliyor; oyuncu bunu SEÇMEDEN ÖNCE görmeli.
// Bu yüzden kilitlenen düğüm gizlenmiyor, üstü çizili olarak duruyor ve
// SEBEBİNİ yazıyor — gizlemek "neden yok" sorusunu, göstermek "neden
// alamıyorum"u cevaplar.
//
// ⚠️ DEĞİŞİKLİK ANINDA KAYDEDİLMİYOR. Oyuncu taslak üzerinde oynuyor, en
// altta ne olacağını (özellikle RESPEC BEDELİNİ) görüyor ve öyle
// onaylıyor. Her tıklamada kaydetmek, bir yanlış tıklamayla gold almak
// demek olurdu.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BRANCHES, SKILLS, SKILL_TREE, respecCost, sanitizeSkills, skillBlocker, skillBonus,
  skillById, spentPoints, type SkillNode,
} from '@/game/skills';
import { STAT_NAME } from '@/game/gear';
import type { Progress } from '@/game/progress';
import { fetchSkills, saveSkills, type SkillState } from '@/lib/gameSession';
import { getMode } from '@/lib/session';
import { CardSection, PanelHead, Tag } from '@/components/ui/cards';
import { PixelButton, Icon } from '@/components/ui/kit';
import { statIcon } from '@/lib/icons';
import { C, FONT, glass } from '@/lib/theme';

export function SkillPanel({ progress, onChange, onError }: {
  progress: Progress;
  onChange: (p: Progress) => void;
  onError: (msg: string) => void;
}) {
  const [state, setState] = useState<SkillState | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  /** taslak — kaydedilene kadar sunucuya gitmiyor */
  const [taslak, setTaslak] = useState<string[]>([]);

  const yukle = useCallback(() => {
    fetchSkills().then((s) => { setState(s); setTaslak(s.nodes); }).catch(() => setErr(true));
  }, []);
  useEffect(() => { if (getMode() === 'wallet') yukle(); }, [yukle]);

  const kayitli = useMemo(() => new Set(state?.nodes ?? []), [state]);
  const secili = useMemo(() => new Set(taslak), [taslak]);
  const harcanan = spentPoints(taslak);
  const kalan = (state?.points ?? 0) - harcanan;

  // ⚠️ RESPEC BEDELİ KAYITLI DAĞILIMDAN hesaplanıyor, taslaktan değil —
  // sunucudaki kuralın aynısı. Taslaktan hesaplasaydık oyuncu ekranda
  // ödeyeceğinden başka bir sayı görürdü.
  const cikarilan = (state?.nodes ?? []).filter((id) => !secili.has(id));
  const bedel = cikarilan.length > 0 ? respecCost(state?.nodes ?? []) : 0;
  const degisti = taslak.length !== (state?.nodes.length ?? 0)
    || taslak.some((id) => !kayitli.has(id));

  if (getMode() !== 'wallet') {
    return (
      <PanelHead kicker="WHAT YOU BECAME" title="Points are earned, never bought" accent={C.ice}
        sub="Skill points come from the depths you have actually reached, and the server is the one that counts them. Connect a wallet to open the tree." />
    );
  }
  if (err) return <Note>Could not read your paths.</Note>;
  if (!state) return <Note>Walking the paths…</Note>;

  const cevir = (n: SkillNode) => {
    if (secili.has(n.id)) {
      // Bir düğümü bırakınca ONA BAĞLI olanlar da düşmeli — yoksa taslak
      // sunucunun reddedeceği bir hâle gelir ve oyuncu farkı kaydettikten
      // sonra görür.
      setTaslak((t) => sanitizeSkills(t.filter((id) => id !== n.id), state.points));
      return;
    }
    setTaslak((t) => sanitizeSkills([...t, n.id], state.points));
  };

  const kaydet = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await saveSkills(taslak);
      setState({ nodes: r.nodes, points: r.points, spent: r.spent, respec: r.respec });
      setTaslak(r.nodes);
      onChange(r.progress);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'The paths refused you.');
      yukle();
    } finally { setBusy(false); }
  };

  const toplam = skillBonus(taslak);

  return (
    <>
      <PanelHead kicker="WHAT YOU BECAME" title="Choose what you give up" accent={C.ice}
        sub="Points come from the depths you have reached — they are never bought. The tree is far larger than any run can fill, and each fork closes the other."
        right={<Tag tone={kalan > 0 ? 'gold' : 'dim'}>{kalan} / {state.points} PTS</Tag>} />

      {/* ⚠️ "AĞAÇ ASLA DOLMAZ" cümlesi panelde YAZILI olmalı. Oyuncu bunu
          bilmezse eksik bir ağaç görüp "daha grind yapmalıyım" sanır; oysa
          eksiklik tasarımın kendisi. */}
      <div style={{ ...glass(10), padding: '10px 12px', marginBottom: 12, fontFamily: FONT.ui }}>
        <div style={{ fontSize: 11.5, color: C.boneDim, lineHeight: 1.55 }}>
          The whole tree costs {SKILL_TREE.reduce((s, n) => s + n.cost, 0)} points.
          You will never have more than {SKILLS.maxPoints}. This is not something
          you finish — it is something you decide.
        </div>
      </div>

      {BRANCHES.map((b) => {
        const dugumler = SKILL_TREE.filter((n) => n.branch === b.id);
        return (
          <CardSection key={b.id} label={`${b.name} — ${b.blurb}`} tone={b.color}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {dugumler.map((n) => {
                const acik = secili.has(n.id);
                const engel = acik ? null : skillBlocker(n, taslak, state.points);
                const kilitli = !!engel && /Locked out/.test(engel);
                return (
                  <button key={n.id}
                    onClick={() => { if (acik || !engel) cevir(n); }}
                    title={engel ?? n.desc}
                    style={{
                      all: 'unset', boxSizing: 'border-box', width: '100%',
                      cursor: acik || !engel ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', gap: 9,
                      padding: '8px 11px', borderRadius: 8, fontFamily: FONT.ui,
                      border: `1px solid ${acik ? `${b.color}88` : 'rgba(255,255,255,0.09)'}`,
                      background: acik
                        ? `linear-gradient(180deg, ${b.color}26, rgba(0,0,0,0.30))`
                        : 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.26))',
                      opacity: engel ? 0.5 : 1,
                    }}>
                    <span style={{
                      width: 3, alignSelf: 'stretch', borderRadius: 2,
                      background: acik ? b.color : 'rgba(255,255,255,0.12)',
                    }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 900,
                          color: acik ? b.color : C.bone,
                          // ⚠️ Kilitlenen düğüm ÜSTÜ ÇİZİLİ: "alamıyorum"
                          // ile "henüz alamıyorum" farkı bir bakışta okunmalı.
                          textDecoration: kilitli ? 'line-through' : 'none',
                        }}>
                          {n.name}
                        </span>
                        {n.capstone && <Tag tone="gold">CAPSTONE</Tag>}
                      </span>
                      <span style={{ display: 'block', fontSize: 10.5, color: C.boneFaint, lineHeight: 1.4 }}>
                        {engel ?? n.desc}
                      </span>
                    </span>
                    <span style={{
                      flexShrink: 0, fontSize: 11, fontWeight: 900,
                      color: acik ? b.color : C.boneFaint,
                    }}>
                      {n.cost}p
                    </span>
                  </button>
                );
              })}
            </div>
          </CardSection>
        );
      })}

      {/* ── TOPLAM ── */}
      {Object.keys(toplam).length > 0 && (
        <CardSection label="What this build gives you" tone={C.candle}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.entries(toplam).map(([k, v]) => {
              // ⚠️ RENK anlamı, İŞARET ham değeri gösterir — ekipmandaki
              // `affixText` kuralının aynısı. cooldown'da eksi olan İYİ;
              // işareti anlamdan türetseydik "−%4 cooldown" kırmızı yazılıp
              // metin "daha az bekleme" diye okunur, renk ile cümle çelişirdi.
              const iyi = k === 'cooldown' ? v < 0 : v > 0;
              const duz = k === 'armor' || k === 'amount' || k === 'revival' || k === 'recovery';
              const m = Math.abs(v);
              const art = k === 'cooldown' ? (v < 0 ? '−' : '+') : (iyi ? '+' : '−');
              return (
                <span key={k} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 800,
                  color: iyi ? C.candleSoft : '#e4657a',
                  background: iyi ? 'rgba(239,167,46,0.12)' : 'rgba(160,18,38,0.14)',
                  border: `1px solid ${iyi ? `${C.candle}44` : `${C.bad}55`}`,
                }}>
                  {/* ⚠️ Aynı stat Forge'da, tılsımda ve burada AYNI ikonla
                      çıkıyor — eşleme `lib/icons.ts`te tek yerde. Panel başına
                      ayrı eşleme yazmak, ikonun amacını (tanıma) tersine çevirirdi. */}
                  <Icon name={statIcon(k)} title={k} />
                  {art}{duz ? Math.round(m * 100) / 100 : `${Math.round(m * 100)}%`}{' '}
                  {STAT_NAME[k as 'might'] ?? k}
                </span>
              );
            })}
          </div>
        </CardSection>
      )}

      {/* ── KAYDET ── */}
      {degisti && (
        <div style={{ marginTop: 13 }}>
          {/* ⚠️ BEDEL DÜĞMEDEN ÖNCE VE AÇIKÇA. Respec geri alınamayan bir
              gold harcaması; oyuncu bunu tıkladıktan sonra değil ÖNCE
              bilmeli — bağış kutusundaki kuralın aynısı. */}
          {bedel > 0 && (
            <div style={{
              marginBottom: 8, padding: '9px 11px', borderRadius: 8,
              background: 'rgba(160,18,38,0.14)', border: `1px solid ${C.bad}55`,
              fontSize: 11.5, color: '#e4657a', lineHeight: 1.5, fontFamily: FONT.ui,
            }}>
              You are unlearning {cikarilan.length} {cikarilan.length > 1 ? 'paths' : 'path'}.
              That costs <b>{bedel.toLocaleString('en-US')} gold</b> — you keep the
              points, you pay to rearrange them.
              {progress.gold < bedel && <> You are {(bedel - progress.gold).toLocaleString('en-US')} short.</>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <PixelButton variant="01A" scale={2}
              disabled={busy || (bedel > 0 && progress.gold < bedel)}
              onClick={kaydet}>
              {bedel > 0 ? `CONFIRM · ${bedel.toLocaleString('en-US')} G` : 'CONFIRM'}
            </PixelButton>
            <PixelButton variant="02A" scale={2} disabled={busy}
              onClick={() => setTaslak(state.nodes)}>
              DISCARD
            </PixelButton>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: C.boneFaint, lineHeight: 1.55 }}>
        Taking a new path is free. Giving one up costs gold — the points stay
        yours either way.
      </div>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      ...glass(9), padding: '16px 14px', fontSize: 12, color: C.boneFaint,
      textAlign: 'center', lineHeight: 1.6, fontFamily: FONT.ui,
    }}>
      {children}
    </div>
  );
}
