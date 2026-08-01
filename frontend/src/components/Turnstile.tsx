'use client';
// CLOUDFLARE TURNSTILE — bot kontrolü.
//
// ORTAMA BAĞLI: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` tanımlı değilse bileşen
// hiçbir şey çizmez ve kapı açık kalır. Geliştirmede ve anahtarlar
// girilmeden önce oyun oynanabilir olmalı; yoksa herkes kapıda kalır.
//
// Anahtar Cloudflare panelinden alınır (Turnstile → Add site). Sunucu tarafı
// doğrulama backend'de `TURNSTILE_SECRET` ile yapılır — istemcinin "geçtim"
// demesi tek başına hiçbir şey ifade etmez.

import { useEffect, useRef } from 'react';
import { C, FONT } from '@/lib/theme';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export function turnstileEnabled() { return SITE_KEY.length > 0; }

interface TurnstileApi {
  render(el: HTMLElement, opts: {
    sitekey: string;
    theme?: 'light' | 'dark' | 'auto';
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
  }): string;
  remove(id: string): void;
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let widgetId: string | null = null;
    let cancelled = false;

    const mount = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!api || !box.current || cancelled) return false;
      widgetId = api.render(box.current, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (t) => cb.current(t),
        // Süresi dolan ya da hata veren doğrulama, geçerli sayılmamalı
        'expired-callback': () => cb.current(null),
        'error-callback': () => cb.current(null),
      });
      return true;
    };

    if (!mount()) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = () => { mount(); };
      document.head.appendChild(s);
    }

    return () => {
      cancelled = true;
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api && widgetId) { try { api.remove(widgetId); } catch { /* zaten gitti */ } }
    };
  }, []);

  if (!SITE_KEY) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
      <div ref={box} />
      <div style={{ fontFamily: FONT.ui, fontSize: 9.5, color: C.boneFaint }}>
        protected by Cloudflare
      </div>
    </div>
  );
}
