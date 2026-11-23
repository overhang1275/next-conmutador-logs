#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/opt/linea-clara"
STATE_DIR="/var/lib/linea-clara"
SECRETS_DIR="/etc/linea-clara"
BACKUP_ROOT="/var/backups/linea-clara"
SERVICE_USER="lineaclara"
SMDR_SERVICE="linea-clara-smdr.service"
WEB_SERVICE="linea-clara-web.service"
UPDATE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
export PATH="/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
STAGING_DIR=""
BACKUP_DIR="$BACKUP_ROOT/$UPDATE_ID"
PREVIOUS_RELEASE="/opt/linea-clara.previous-$UPDATE_ID"
FAILED_RELEASE="/opt/linea-clara.failed-$UPDATE_ID"
PREVIOUS_MOVED=0
NEW_RELEASE_ACTIVE=0
SERVICES_STOPPED=0
OLD_RELEASE_READY=1

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '\n==> %s\n' "$*"; }

on_exit() {
  local exit_code=$?
  trap - EXIT

  if (( exit_code != 0 )); then
    set +e
    printf '\nFalló la actualización (código %s).\n' "$exit_code" >&2

    if (( NEW_RELEASE_ACTIVE )); then
      info "Deteniendo la versión nueva para restaurar la anterior"
      if systemctl stop "$WEB_SERVICE" >/dev/null 2>&1 \
        && systemctl stop "$SMDR_SERVICE" >/dev/null 2>&1; then
        if [[ -d "$APP_ROOT" ]]; then
          if mv -- "$APP_ROOT" "$FAILED_RELEASE"; then
            printf 'Versión fallida conservada en: %s\n' "$FAILED_RELEASE" >&2
            NEW_RELEASE_ACTIVE=0
          else
            printf 'No pude apartar la versión fallida en %s.\n' "$APP_ROOT" >&2
          fi
        else
          NEW_RELEASE_ACTIVE=0
        fi
      else
        OLD_RELEASE_READY=0
        printf 'No pude detener ambos servicios; dejé los archivos de la versión activa intactos. Los servicios quedan detenidos para evitar arrancar una versión no verificada.\n' >&2
      fi
    fi

    if (( PREVIOUS_MOVED )) && [[ -d "$PREVIOUS_RELEASE" && ! -e "$APP_ROOT" ]]; then
      if mv -- "$PREVIOUS_RELEASE" "$APP_ROOT"; then
        PREVIOUS_MOVED=0
        OLD_RELEASE_READY=1
        printf 'Versión anterior restaurada.\n' >&2
      else
        printf 'No pude restaurar la versión anterior desde %s.\n' "$PREVIOUS_RELEASE" >&2
      fi
    fi

    if (( SERVICES_STOPPED )); then
      if (( OLD_RELEASE_READY )) && [[ -d "$APP_ROOT" ]]; then
        systemctl start "$SMDR_SERVICE" || printf 'No pude iniciar %s durante el rollback.\n' "$SMDR_SERVICE" >&2
        systemctl start "$WEB_SERVICE" || printf 'No pude iniciar %s durante el rollback.\n' "$WEB_SERVICE" >&2
      else
        printf 'Dejé los servicios detenidos para no iniciar la versión fallida. Restaura %s en %s y luego inicia ambos servicios.\n' "$PREVIOUS_RELEASE" "$APP_ROOT" >&2
      fi
    fi

    if [[ -d "$BACKUP_DIR" ]]; then
      printf 'Respaldo de estado y secretos: %s\n' "$BACKUP_DIR" >&2
    fi
    if [[ -d "$PREVIOUS_RELEASE" ]]; then
      printf 'Versión anterior: %s\n' "$PREVIOUS_RELEASE" >&2
    fi
  fi

  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    case "$STAGING_DIR" in
      "/opt/.linea-clara-update-${UPDATE_ID}."*) rm -rf -- "$STAGING_DIR" ;;
      *) printf 'No eliminé la carpeta temporal inesperada: %s\n' "$STAGING_DIR" >&2 ;;
    esac
  fi

  exit "$exit_code"
}
trap on_exit EXIT

[[ "$(id -u)" -eq 0 ]] || die "Ejecuta este actualizador como root."
(( $# <= 1 )) || die "Uso: bash update.sh [rama]"
[[ -d "$APP_ROOT" && ! -L "$APP_ROOT" ]] || die "No existe la instalación esperada en $APP_ROOT."
[[ -d "$APP_ROOT/.git" ]] || die "$APP_ROOT no contiene un repositorio Git."
[[ -r "$STATE_DIR/config.toml" ]] || die "No puedo leer $STATE_DIR/config.toml."
[[ -d "$STATE_DIR/data" ]] || die "No existe el directorio de datos $STATE_DIR/data."
[[ -r "$SECRETS_DIR/web.env" ]] || die "No puedo leer $SECRETS_DIR/web.env."
[[ ! -L "$STATE_DIR" && ! -L "$STATE_DIR/data" && ! -L "$STATE_DIR/config.toml" ]] || die "El directorio de estado o config.toml es un enlace simbólico; no puedo garantizar un respaldo autónomo."
[[ ! -L "$SECRETS_DIR" && ! -L "$SECRETS_DIR/web.env" ]] || die "El directorio de secretos o web.env es un enlace simbólico; no puedo garantizar un respaldo autónomo."
id "$SERVICE_USER" >/dev/null 2>&1 || die "No existe la cuenta de servicio $SERVICE_USER."

for command_name in git cargo pnpm curl systemctl mktemp install cp mv chown chmod sed date seq rm id realpath flock runuser sleep; do
  command -v "$command_name" >/dev/null 2>&1 || die "Falta el comando requerido: $command_name."
done
exec 9>/run/lock/linea-clara-update.lock
flock -n 9 || die "Ya hay otra actualización de Línea Clara en ejecución."

systemctl cat "$SMDR_SERVICE" >/dev/null 2>&1 || die "No está instalado el servicio $SMDR_SERVICE."
systemctl cat "$WEB_SERVICE" >/dev/null 2>&1 || die "No está instalado el servicio $WEB_SERVICE."
systemctl is-active --quiet "$SMDR_SERVICE" || die "El servicio $SMDR_SERVICE no está activo; no comencé la actualización."
systemctl is-active --quiet "$WEB_SERVICE" || die "El servicio $WEB_SERVICE no está activo; no comencé la actualización."
[[ -z "$(git -C "$APP_ROOT" status --porcelain)" ]] || die "El checkout instalado tiene cambios locales; consérvalos o revísalos antes de actualizar."

REPO_URL="$(git -C "$APP_ROOT" remote get-url origin 2>/dev/null)" || die "No pude leer el remoto origin de la instalación."
[[ "$REPO_URL" == https://github.com/* ]] || die "El remoto origin debe ser una URL HTTPS de GitHub."
CURRENT_BRANCH="$(git -C "$APP_ROOT" branch --show-current 2>/dev/null)"
BRANCH="${1:-$CURRENT_BRANCH}"
[[ -n "$BRANCH" ]] || die "La instalación no tiene una rama activa; indica una rama como argumento."
git check-ref-format --branch "$BRANCH" >/dev/null 2>&1 || die "La rama indicada no es válida: $BRANCH."

STATE_ROOT="$(realpath -e -- "$STATE_DIR")"

read_runtime_config() {
  API_TOKEN="$(sed -n 's/^api_token = "\([^"]*\)"$/\1/p' "$STATE_DIR/config.toml")"
  [[ -n "$API_TOKEN" ]] || die "No pude leer api_token de config.toml; no se imprimió ningún secreto."
  DATABASE_PATH_RAW="$(sed -n 's/^database_path = "\(.*\)"$/\1/p' "$STATE_DIR/config.toml")"
  [[ -n "$DATABASE_PATH_RAW" ]] || die "No pude leer database_path de config.toml."
  if [[ "$DATABASE_PATH_RAW" == /* ]]; then
    DATABASE_PATH_CANDIDATE="$DATABASE_PATH_RAW"
  else
    DATABASE_PATH_CANDIDATE="$STATE_DIR/$DATABASE_PATH_RAW"
  fi
  DATABASE_PATH="$(realpath -e -- "$DATABASE_PATH_CANDIDATE")" || die "No pude resolver la ruta configurada para SQLite."
  [[ -f "$DATABASE_PATH" ]] || die "La ruta configurada para SQLite no es un archivo regular."
}
read_runtime_config

install -d -o root -g root -m 0700 "$BACKUP_ROOT"
[[ ! -e "$BACKUP_DIR" ]] || die "Ya existe la carpeta de respaldo $BACKUP_DIR."
[[ ! -e "$PREVIOUS_RELEASE" && ! -e "$FAILED_RELEASE" ]] || die "Ya existe una carpeta de versión con el identificador $UPDATE_ID."

info "Preparando una versión nueva sin detener la instalación actual"
printf 'Repositorio: %s\nRama: %s\n' "$REPO_URL" "$BRANCH"
STAGING_DIR="$(mktemp -d "/opt/.linea-clara-update-${UPDATE_ID}.XXXXXX")"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$STAGING_DIR"
[[ -f "$STAGING_DIR/Cargo.toml" && -f "$STAGING_DIR/web/package.json" ]] || die "El repositorio descargado no contiene Cargo.toml y web/package.json."

info "Compilando Rust y Next.js en la carpeta temporal"
cargo build --release --locked --manifest-path "$STAGING_DIR/Cargo.toml"
(
  cd "$STAGING_DIR/web"
  pnpm install --frozen-lockfile
  NEXT_TELEMETRY_DISABLED=1 pnpm build
)
[[ -d "$STAGING_DIR/web/.next" ]] || die "No se generó la compilación de Next.js."
chown -R root:root "$STAGING_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$STAGING_DIR/web/.next"
chmod 0755 "$STAGING_DIR"
[[ -x "$STAGING_DIR/target/release/ns500-smdr" ]] || die "No se generó el ejecutable SMDR esperado."
[[ -r "$STAGING_DIR/web/.next/BUILD_ID" ]] || die "No se generó BUILD_ID de Next.js."
runuser -u "$SERVICE_USER" -- test -x "$STAGING_DIR/target/release/ns500-smdr" || die "La cuenta $SERVICE_USER no puede ejecutar el colector compilado."
runuser -u "$SERVICE_USER" -- test -r "$STAGING_DIR/web/.next/BUILD_ID" || die "La cuenta $SERVICE_USER no puede leer la compilación de Next.js."
NEW_COMMIT="$(git -C "$STAGING_DIR" rev-parse --short HEAD)"

info "Respaldando estado y secretos con los servicios detenidos"
install -d -o root -g root -m 0700 "$BACKUP_DIR"
SERVICES_STOPPED=1
systemctl stop "$WEB_SERVICE"
systemctl stop "$SMDR_SERVICE"
# The dashboard can change database_path while the candidate is building. Read
# the authoritative path and token again after writes have stopped.
read_runtime_config
cp -a -- "$STATE_DIR" "$BACKUP_DIR/state"
cp -a -- "$SECRETS_DIR" "$BACKUP_DIR/secrets"
case "$DATABASE_PATH" in
  "$STATE_ROOT"/*) ;;
  *)
    install -d -o root -g root -m 0700 "$BACKUP_DIR/external-database"
    cp -a -- "$DATABASE_PATH" "$BACKUP_DIR/external-database/calls.sqlite3"
    for suffix in -wal -shm -journal; do
      if [[ -e "${DATABASE_PATH}${suffix}" ]]; then
        cp -a -- "${DATABASE_PATH}${suffix}" "$BACKUP_DIR/external-database/calls.sqlite3${suffix}"
      fi
    done
    printf '%s\n' "$DATABASE_PATH" >"$BACKUP_DIR/external-database/original-path.txt"
    ;;
esac
OLD_COMMIT="$(git -C "$APP_ROOT" rev-parse --short HEAD 2>/dev/null || printf 'desconocido')"
printf 'Anterior: %s\nNueva: %s\nRama: %s\n' "$OLD_COMMIT" "$NEW_COMMIT" "$BRANCH" >"$BACKUP_DIR/releases.txt"

info "Activando la versión compilada"
mv -- "$APP_ROOT" "$PREVIOUS_RELEASE"
PREVIOUS_MOVED=1
OLD_RELEASE_READY=0
mv -- "$STAGING_DIR" "$APP_ROOT"
STAGING_DIR=""
NEW_RELEASE_ACTIVE=1
systemctl start "$SMDR_SERVICE"
systemctl start "$WEB_SERVICE"

info "Comprobando servicios, API Rust y página de inicio de sesión"
api_healthy() {
  local status
  status="$(curl -q --silent --fail --noproxy '*' --connect-timeout 2 --max-time 3 \
    --output /dev/null --write-out '%{http_code}' --config - <<CURL_CONFIG
header = "Authorization: Bearer $API_TOKEN"
url = "http://127.0.0.1:8787/api/v1/menu-config"
CURL_CONFIG
  )" || return 1
  [[ "$status" == 200 ]]
}

web_healthy() {
  local status
  status="$(curl -q --silent --fail --noproxy '*' --connect-timeout 2 --max-time 3 \
    --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3001/login)" || return 1
  [[ "$status" == 200 ]]
}

healthy=0
for attempt in $(seq 1 30); do
  if systemctl is-active --quiet "$SMDR_SERVICE" \
    && systemctl is-active --quiet "$WEB_SERVICE" \
    && api_healthy \
    && web_healthy; then
    healthy=1
    break
  fi
  sleep 2
done
unset API_TOKEN
(( healthy == 1 )) || die "La nueva versión no pasó las comprobaciones; se iniciará el rollback."

SERVICES_STOPPED=0
info "Actualización terminada"
printf 'Versión activa: %s\n' "$NEW_COMMIT"
printf 'Versión anterior conservada en: %s\n' "$PREVIOUS_RELEASE"
printf 'Respaldo de estado y secretos: %s\n' "$BACKUP_DIR"
printf 'Servicios: systemctl status %s %s\n' "$SMDR_SERVICE" "$WEB_SERVICE"
