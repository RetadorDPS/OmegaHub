# ============================================================================
#  TrendHunter Pro · imagen de producción (Next.js + Node 22)
# ----------------------------------------------------------------------------
#  · Instalación reproducible con `npm ci`
#  · Cliente Prisma generado en la fase de build
#  · Usuario sin privilegios y salida standalone
# ============================================================================

# --- Dependencias -----------------------------------------------------------
FROM node:22-bookworm-slim AS dependencias
WORKDIR /app
ENV npm_config_nodedir=/usr/local
COPY package.json package-lock.json ./
# `better-sqlite3` y `bcryptjs` necesitan herramientas de compilación si no hay
# binario precompilado para la plataforma destino.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --no-audit --no-fund \
    && apt-get purge -y make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# --- Build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .

# El cliente de Prisma se genera EN TIEMPO DE COMPILACIÓN para el motor elegido:
# Prisma no permite mezclar un cliente generado para SQLite con el adaptador de
# PostgreSQL. El valor por defecto es PostgreSQL (producción: Supabase o el
# contenedor local). Para una imagen con SQLite:
#     docker build --build-arg DATABASE_PROVIDER=sqlite .
ARG DATABASE_PROVIDER=postgresql
ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}
# El build no necesita la base de datos real: sólo una URL válida por proveedor.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
RUN SKIP_ENV_FILE=1 node scripts/set-db-provider.mjs "${DATABASE_PROVIDER}" && \
    node scripts/prisma-generate.mjs && \
    npx next build

# --- Producción -------------------------------------------------------------
FROM node:22-bookworm-slim AS produccion
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Dependencias de ejecución (incluye Prisma CLI y tsx para seeds/workers).
COPY --from=dependencias /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/next.config.ts ./next.config.ts

# Usuario sin privilegios y carpeta de datos escribible (SQLite local).
RUN useradd --create-home --shell /bin/bash trendhunter \
    && mkdir -p /app/prisma \
    && chown -R trendhunter:trendhunter /app
USER trendhunter

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/arranque.mjs"]
