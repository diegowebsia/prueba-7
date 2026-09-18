# ============================================================
# ReviewFlow AI v3.12.0 — Imagen de producción agnóstica
# Node.js 24 puro + Next.js standalone. Sin Vercel.
# Build:  docker build -t reviewflow-ai:3.4.0 .
# Run:    docker run -p 3000:3000 --env-file .env reviewflow-ai:3.4.0
# ============================================================

FROM node:24.8.0-alpine3.22 AS base
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
# Variables públicas quedan embebidas por Next en el bundle del navegador.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_COMPANY_NAME
ARG NEXT_PUBLIC_CIF
ARG NEXT_PUBLIC_ADDRESS
ARG NEXT_PUBLIC_LEGAL_EMAIL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_DOMAIN
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME \
    NEXT_PUBLIC_CIF=$NEXT_PUBLIC_CIF \
    NEXT_PUBLIC_ADDRESS=$NEXT_PUBLIC_ADDRESS \
    NEXT_PUBLIC_LEGAL_EMAIL=$NEXT_PUBLIC_LEGAL_EMAIL \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL \
    NEXT_PUBLIC_DOMAIN=$NEXT_PUBLIC_DOMAIN \
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN
# Next necesita las NEXT_PUBLIC_* en build; las demás pueden ir en runtime.
# Compose las exige; los secretos permanecen exclusivamente en runtime.
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
  CMD wget -qO- --header="Authorization: Bearer ${HEALTHCHECK_SECRET}" 'http://127.0.0.1:3000/api/health?mode=ready' || exit 1

CMD ["node", "server.js"]
