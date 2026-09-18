# ============================================================
# ReviewFlow AI v3.4.0 — Imagen de producción agnóstica
# Node.js 20 puro + Next.js standalone. Sin Vercel.
# Build:  docker build -t reviewflow-ai:3.4.0 .
# Run:    docker run -p 3000:3000 --env-file .env reviewflow-ai:3.4.0
# ============================================================

FROM node:20-alpine AS base
WORKDIR /app

# ---------- Deps ----------
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---------- Build ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next necesita las NEXT_PUBLIC_* en build; las demás pueden ir en runtime.
# Si no existen, el build usa placeholders y la app arranca en modo demo.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN npm run build

# ---------- Runner ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone: servidor Node puro autocontenido
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
