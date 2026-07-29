# GRAVEBORN — *Rise Again*

Survivors-like (bullet heaven) tarayıcı oyunu, Solana üzerinde. Ölü kalamayan bir survivor'sın: her run bir diriliş, her ölüm bir sonraki dirilişi güçlendirir.

**Token:** `$GRAVE` (pump.fun) · **Erişim:** hold-to-play

---

## Ekonomi tek bakışta

Çift para birimi, **emisyon YOK** — token oynayarak basılmaz, oyuncular arasında el değiştirir.

```
RUN (20 dk) ──► GOLD + MATERIAL
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  POWERUP AĞACI           MARKETPLACE
  (GOLD sink)         material/GOLD sat → $GRAVE kazan
                              │ %5 fee
                     ┌────────┴────────┐
                  %2.5 BURN      %2.5 TREASURY
```

- **GOLD** — soft para, zincir dışı, sınırsız. Oyunun %90'ı token'a dokunmadan oynanır.
- **$GRAVE** — hold-to-play kapısı, marketplace para birimi, spin, prestige. Talep oyuncu sayısına bağlı; arz sadece oyuncular arası transferle döner.

Referans model: **Kintara** (tarayıcı tabanlı Solana MMO — çift ekonomi + hold-to-play + marketplace fee geliri).

## Dokümanlar

| Doküman | İçerik |
|---|---|
| [docs/RESEARCH.md](docs/RESEARCH.md) | Vampire Survivors anatomisi, 2026 tür piyasası, Kintara ekonomi çözümlemesi, IP sınırları |
| [docs/DEV-PLAN.md](docs/DEV-PLAN.md) | Mimari, faz sırası, hold-to-play eşik matematiği, güvenlik katmanları |

## Stack

- **Frontend:** Next.js 14 + TypeScript, canvas oyun motoru → Vercel
- **Backend:** Node + Express + PostgreSQL (Prisma) + Redis → Railway *(Faz 2)*
- **Zincir:** Solana · pump.fun

## Geliştirme

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

## Kod kuralları

- **Tüm stiller INLINE.** Tailwind arbitrary değerleri Phantom in-app browser'da çalışmıyor.
- **Palet tek kaynak:** `frontend/src/lib/theme.ts`. **MOR YOK** — hiçbir yerde.
- **Ekonomi sunucu-otoriteli.** Client ödül miktarı bildirmez; sunucu run süresi × bölüm tavanından hesaplar.
- **`.env` asla commit edilmez.** Treasury secret key, DB şifresi dahil.
