#!/usr/bin/env bash
# ============================================================================
#  TrendHunter Pro · despliegue de un comando (Oracle Cloud Always Free)
# ----------------------------------------------------------------------------
#  Uso:
#     1. Edita `.env` con tus claves (copia de `.env.example`).
#     2. Ejecuta:   bash desplegar.sh
#
#  El script: instala Docker si falta → arranca la app + PostgreSQL +
#  Redis → aplica migraciones → sieba datos de demo → comprueba
#  /api/health y muestra el resumen final.
# ============================================================================
set -euo pipefail

ok()   { echo -e "\033[32m✔\033[0m $1"; }
info() { echo -e "\033[34m→\033[0m $1"; }
mal()  { echo -e "\033[31m✖\033[0m $1"; }

info "TrendHunter Pro · despliegue en un comando"

# ── 1 · Docker ───────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  info "Docker no encontrado: instalando…"
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2
  sudo usermod -aG docker "$USER" || true
  sudo systemctl enable --now docker
  mal "Docker instalado. Reconecta la sesión SSH (para el grupo docker) y ejecuta de nuevo: bash desplegar.sh"
  exit 0
fi
ok "Docker listo ($(docker --version | cut -d' ' -f3))"

# ── 2 · Entorno ──────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  mal "No había .env: he creado una copia de .env.example."
  mal "Edítala (mínimo: AUTH_SECRET, DATABASE_URL, DIRECT_URL, CRON_SECRET) y ejecuta de nuevo: bash desplegar.sh"
  exit 1
fi
if grep -q 'cambia-esto-por-un-secreto-de-32-bytes' .env; then
  mal "AUTH_SECRET sigue siendo el valor de ejemplo. Pon uno real:"
  mal "  AUTH_SECRET=\"\$(openssl rand -base64 32)\""
  exit 1
fi
ok ".env presente"

# ── 3 · Comprobar el destino de los datos ────────────────────
DATABASE_URL_ENV=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)
if printf '%s' "${DATABASE_URL_ENV}" | grep -qi 'supabase'; then
  ok "Base de datos: Supabase (definida en .env)"
  info "El PostgreSQL del compose arrancará igualmente pero no se usará."
else
  ok "Base de datos: PostgreSQL del propio servidor (volumen docker)"
  info "Si prefieres Supabase, pon DATABASE_URL y DIRECT_URL en .env y repite."
fi

# ── 4 · Arrancar ─────────────────────────────────────────────
info "Construyendo y arrancando (primer arranque: 3–5 min)…"
# El proveedor de Prisma es de compilación: la imagen se genera para PostgreSQL.
DATABASE_PROVIDER=postgresql docker compose build --build-arg DATABASE_PROVIDER=postgresql
docker compose up -d
ok "Contenedores en marcha"

# ── 5 · Esquema (automático en arranque.mjs) y datos de demo ────
info "Comprobando datos de demo…"
ESTADO=$(docker compose exec -T app node scripts/db-estado.mjs 2>/dev/null || echo '{}')
USUARIOS=$(echo "$ESTADO" | sed -n 's/.*"usuarios":\([0-9]*\).*/\1/p')
if [ "${USUARIOS:-1}" = "0" ]; then
  docker compose exec -T app npm run db:seed >/dev/null 2>&1
  ok "Datos de demo cargados"
else
  ok "Base de datos ya poblada (semilla omitida: $ESTADO)"
fi

# ── 6 · Comprobación de salud ────────────────────────────────
info "Esperando a que la app responda…"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 http://localhost:3000/api/health >/tmp/health.json 2>/dev/null; then
    break
  fi
  sleep 4
done

if curl -fsS --max-time 5 http://localhost:3000/api/health >/tmp/health.json 2>&1; then
  ok "App viva: $(cat /tmp/health.json)"
else
  mal "La app no responde. Revisa los logs:  docker compose logs -f app"
  exit 1
fi

ok "¡Listo! Abre  http://<IP-de-tu-servidor>:3000"
info "  · Login demo:  demo@trendhunter.pro / demo1234"
info "  · Diagnóstico: /api/diagnostics?clave=\$CRON_SECRET"
info "Siguiente paso: dominio (registro A → IP del servidor) y secretos en GitHub. Ver DESPLEGUE.md."
