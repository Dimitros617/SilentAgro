# syntax=docker/dockerfile:1.7

# ---------- závislosti ----------
FROM node:22-alpine AS deps
WORKDIR /app
# libc6-compat kvůli nativním bindingům, openssl kvůli Prisma query enginu:
# na Alpine se jinak nenačte libssl a klient spadne až za běhu.
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- sestavení ----------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build nemá přístup k databázi. Všechny stránky, které ji čtou, mají `force-dynamic`,
# takže se nic nepředgenerovává a DATABASE_URL tu není potřeba.
RUN npx prisma generate && npm run build && npm run worker:build

# ---------- migrace a seed ----------
# Jednorázový kontejner. Má devDependencies včetně `prisma` CLI a `tsx`, které
# runtime image záměrně nenese. Po dokončení běží aplikace, mail worker a databáze.
FROM builder AS migrator
WORKDIR /app
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- běh ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# tini jako PID 1 sklízí zombie procesy a předá SIGTERM dál. Bez něj Node signály
# neobslouží a `docker stop` skončí až vypršením desetivteřinového limitu.
RUN apk add --no-cache openssl tini

# Standalone výstup nese jen server a moduly, které opravdu potřebuje.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/dist/mail-worker.cjs ./mail-worker.cjs

# Adresář pro svazek s fotkami se zakládá už v image a patří uživateli `node`.
# Bez toho by ho Docker vytvořil jako root:root a uid 1000 by do něj nezapsal.
RUN mkdir -p /app/public/uploads && chown -R node:node /app/public/uploads

USER node
EXPOSE 3000

# `fetch` je v Node 22 globální, žádný přepínač není potřeba.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
