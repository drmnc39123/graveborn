# GRAVEBORN frontend (Next.js) — konteyner.
#
# 🔴 NİYE VERCEL DEĞİL: Vercel artık ücretsiz kişisel kapsam sunmuyor,
# proje açmak için ücretli/deneme bir TAKIM zorunlu. Frontend'in Vercel'e
# ihtiyacı yok — backend'in aksine burada uzun ömürlü süreç kısıtı da yok,
# yani aynı Railway projesinde ikinci servis olarak koşuyor.
#
# ⚠️ BAĞLAM `frontend/` — backend'in aksine bu taraf kendi kendine yetiyor
# (dışarıya hiçbir içe aktarma yok, ölçüldü). Servisin Root Directory'si
# `frontend` olmalı.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# ⚠️ `NEXT_PUBLIC_*` DERLEME ANINDA PAKETE GÖMÜLÜYOR, çalışma anında
# okunmuyor. Ölçüldü: üretim derlemesinden sonra değer 3 ayrı JS parçasının
# İÇİNDE bulunuyor. Bu yüzden ARG olarak alınıyor — Railway servis
# değişkenlerini derlemeye build arg olarak geçiriyor.
# Değer değişirse env'i güncellemek YETMEZ, YENİDEN DERLEMEK şart.
# ⚠️ Hiç verilmezse kod `http://localhost:4100`e düşer ve canlı site
# sessizce oyuncunun KENDİ bilgisayarına istek atar; her panel boş kalır.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# ⚠️ HOSTNAME 0.0.0.0 OLMALI. Varsayılan localhost olsaydı süreç ayakta
# görünür ama barındırıcının yönlendirmesi konteynere ULAŞAMAZDI.
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 8080
CMD ["node", "server.js"]
