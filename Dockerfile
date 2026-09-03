# GRAVEBORN backend — derleme AÇIKÇA tarif ediliyor, otomatik algılamaya
# bırakılmıyor.
#
# 🔴 NİYE DOCKERFILE: depo bir monorepo ve KÖKTE `package.json` YOK
# (paketler `backend/` ve `frontend/` altında). Railway'in otomatik
# algılaması (Railpack) kökte bir paket bulamayınca ne derleyeceğini
# bilemiyor ve "prepare" adımında düşüyor — ölçüldü, ilk deploy tam
# buradan başarısız oldu.
#
# ⚠️ YAPI BAĞLAMI DEPONUN KÖKÜ OLMALI, `backend/` DEĞİL. Backend oyun
# mantığını frontend'den içe aktarıyor (`@game/* → ../frontend/src/game/*`)
# — ekonomi kuralı tek yerde dursun diye bilinçli. `backend/` tek başına
# kopyalanırsa sunucu `Cannot find package '@game/heroes'` ile açılışta
# ölür. `preflight.mjs` bunu okunur bir cümleye çeviriyor.
#
# Bu dosya barındırıcıdan bağımsız: Railway, Render, Fly ve düz bir VPS'te
# aynı şekilde koşar.

FROM node:22-bookworm-slim

# ⚠️ Prisma sorgu motoru OpenSSL'e bağlı; slim imajda kurulu gelmiyor ve
# eksikse hata çalışma anında, veritabanına ilk dokunuşta çıkıyor.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Önce yalnız manifest — kaynak değişince bağımlılık katmanı yeniden
# kurulmasın (Docker katman önbelleği).
# ⚠️ `frontend/node_modules` GEREKMİYOR: `@game/*` saf TypeScript, dışarıdan
# hiçbir şey içe aktarmıyor ve `tsx` onları doğrudan çeviriyor.
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

# ⚠️ Tüm depo kopyalanıyor — `frontend/src/game` backend için ZORUNLU.
COPY . .

# ⚠️ `prisma generate` KOPYADAN SONRA: şema `backend/prisma/schema.prisma`
# ve kopyalanmadan önce ortada yok.
RUN cd backend && npx prisma generate

# ⚠️ `npm ci`den SONRA ayarlanıyor. Önce ayarlansaydı npm devDependencies'i
# atlardı; `prisma` ve `tsx` bilerek `dependencies` altında (bkz. DEPLOY.md)
# ama bu sıra yine de kazadan koruyor.
ENV NODE_ENV=production

# preflight → prisma migrate deploy → sunucu
CMD ["sh", "-c", "cd backend && npm run start:prod"]
