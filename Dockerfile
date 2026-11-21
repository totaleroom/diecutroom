# Stage 1: Build Vite + Three.js + Workbox PWA static bundle
FROM node:22-alpine AS builder

WORKDIR /app

# Install all build & dev dependencies cleanly even if NODE_ENV=production is preset
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
ARG VITE_WHATSAPP_ADMIN=6282125086328
ENV VITE_WHATSAPP_ADMIN=$VITE_WHATSAPP_ADMIN
RUN npm run build

# Stage 2: Ultra-slim production runtime (~160 MB total image, <110 MB runtime RAM)
FROM node:22-alpine AS runner

WORKDIR /app

# Production server (server.ts) only imports express, dotenv, and Node 22 built-ins (node:sqlite)
COPY package.json ./
RUN npm install --omit=dev --no-save --no-audit --no-fund express@^4.21.2 dotenv@^17.2.3 \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/scripts/admin-reset.ts ./scripts/admin-reset.ts
COPY --from=builder /app/public/fonts ./public/fonts

# Persist SQLite database and session secret inside /app/data volume
RUN mkdir -p /app/data && chmod 700 /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/data/diecut.db
ENV NODE_OPTIONS=--max-old-space-size=192

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.ts"]
