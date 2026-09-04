'use client';
// Global hata yakalayıcıları kuran görünmez bileşen.
//
// ⚠️ KÖK DÜZENDE duruyor, `/play`de değil: en kritik hatalar oyuncunun
// GİREMEDİĞİ anda oluşuyor (ana sayfa, cüzdan girişi, hata sınırı
// ekranı). Yalnız oyun sayfasında kurulsaydı tam da onları kaçırırdık.
//
// ⚠️ Hiçbir şey çizmiyor ve hiçbir şeyi beklemiyor — bildirim yolu
// oyuncunun akışına dokunmamalı (bkz. lib/errorReport.ts).

import { useEffect } from 'react';
import { installErrorReporting } from '@/lib/errorReport';

export function ErrorReporter() {
  useEffect(() => installErrorReporting(), []);
  return null;
}
