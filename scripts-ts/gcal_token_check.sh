#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gcal_token_check.sh
# Verifica acceso a Google Calendar usando token.json
# Uso   : bash gcal_token_check.sh [ruta/a/token.json]
# Deps  : curl, jq   →  sudo apt install curl jq
# Xubuntu 25+ / bash 5+
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'   # reset

ok()  { echo -e "${GRN}[OK]${NC}    $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
warn(){ echo -e "${YLW}[WARN]${NC}  $*"; }

# ── 0. Dependencias ───────────────────────────────────────────────────────────
for dep in curl jq; do
  if ! command -v "$dep" &>/dev/null; then
    err "Dependencia faltante: $dep"
    err "Instalar con: sudo apt install $dep"
    exit 1
  fi
done

# ── 1. Ruta a token.json ──────────────────────────────────────────────────────
TOKEN_FILE="${1:-token.json}"

if [[ ! -f "$TOKEN_FILE" ]]; then
  err "No se encontró: $TOKEN_FILE"
  err "Uso: bash gcal_token_check.sh [ruta/a/token.json]"
  exit 1
fi

# ── 2. Parsear y validar JSON ─────────────────────────────────────────────────
if ! jq empty "$TOKEN_FILE" 2>/dev/null; then
  err "token.json no es JSON válido"
  exit 1
fi

ACCESS_TOKEN=$(jq -r '.access_token // empty' "$TOKEN_FILE")
EXPIRY_DATE=$(jq -r  '.expiry_date  // empty' "$TOKEN_FILE")   # epoch ms (Node oauth2 format)
EXPIRY_STR=$(jq -r   '.expiry       // empty' "$TOKEN_FILE")   # ISO string (gcloud format)

if [[ -z "$ACCESS_TOKEN" ]]; then
  err "token.json no contiene access_token"
  exit 1
fi

# ── 3. Chequear expiración ────────────────────────────────────────────────────
NOW_MS=$(( $(date +%s) * 1000 ))

if [[ -n "$EXPIRY_DATE" && "$EXPIRY_DATE" =~ ^[0-9]+$ ]]; then
  # Node.js oauth2 format: expiry_date en milisegundos
  if (( NOW_MS > EXPIRY_DATE )); then
    EXPIRED_ISO=$(date -d "@$(( EXPIRY_DATE / 1000 ))" --iso-8601=seconds 2>/dev/null \
                  || date -r  "$(( EXPIRY_DATE / 1000 ))" "+%Y-%m-%dT%H:%M:%S")
    err "Token expirado desde: $EXPIRED_ISO"
    err "Ejecuta el flujo de refresh antes de continuar."
    exit 1
  fi
elif [[ -n "$EXPIRY_STR" ]]; then
  # gcloud format: expiry como ISO string
  EXPIRY_EPOCH=$(date -d "$EXPIRY_STR" +%s 2>/dev/null || echo 0)
  if (( $(date +%s) > EXPIRY_EPOCH )); then
    err "Token expirado desde: $EXPIRY_STR"
    exit 1
  fi
else
  warn "No se encontró expiry_date en token.json — no se puede verificar expiración"
fi

# ── 4. Llamada a la API ───────────────────────────────────────────────────────
CALENDAR_ID="dev.n8n.stax@gmail.com"
CALENDAR_ID_ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${CALENDAR_ID}'))")
URL="https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID_ENC}"

HTTP_RESPONSE=$(curl \
  --silent \
  --write-out "\n__HTTP_STATUS__%{http_code}" \
  --max-time 15 \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  --header "Accept: application/json" \
  "$URL"
)

# Separar body y status code
HTTP_BODY=$(echo "$HTTP_RESPONSE"   | sed '$d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1 | sed 's/__HTTP_STATUS__//')

# ── 5. Procesar respuesta ─────────────────────────────────────────────────────
if [[ "$HTTP_STATUS" -eq 200 ]]; then
  ACCESS_ROLE=$(echo "$HTTP_BODY" | jq -r '.accessRole // "desconocido"')
  SUMMARY=$(echo     "$HTTP_BODY" | jq -r '.summary    // "desconocido"')
  TIMEZONE=$(echo    "$HTTP_BODY" | jq -r '.timeZone   // "desconocido"')

  ok "accessRole : $ACCESS_ROLE"
  ok "summary    : $SUMMARY"
  ok "timeZone   : $TIMEZONE"

elif [[ "$HTTP_STATUS" -eq 401 ]]; then
  ERR_MSG=$(echo "$HTTP_BODY" | jq -r '.error.message // "Unauthorized"')
  err "HTTP 401 — Token inválido o expirado: $ERR_MSG"
  exit 1

elif [[ "$HTTP_STATUS" -eq 403 ]]; then
  ERR_MSG=$(echo "$HTTP_BODY" | jq -r '.error.message // "Forbidden"')
  err "HTTP 403 — Sin permisos para este calendario: $ERR_MSG"
  exit 1

elif [[ "$HTTP_STATUS" -eq 404 ]]; then
  err "HTTP 404 — Calendario no encontrado: $CALENDAR_ID"
  exit 1

else
  ERR_MSG=$(echo "$HTTP_BODY" | jq -r '.error.message // "Error desconocido"' 2>/dev/null || echo "$HTTP_BODY")
  err "HTTP $HTTP_STATUS — $ERR_MSG"
  exit 1
fi
