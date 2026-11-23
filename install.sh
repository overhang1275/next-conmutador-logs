#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/opt/linea-clara"
STATE_DIR="/var/lib/linea-clara"
SECRETS_DIR="/etc/linea-clara"
SERVICE_USER="lineaclara"
NODE_MAJOR="24"
PNPM_VERSION="11.25.0"
REPO_URL="${1:-${LINEA_CLARA_REPO:-}}"
BRANCH="${2:-${LINEA_CLARA_BRANCH:-main}}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '\n==> %s\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || die "Ejecuta como root: sudo bash -c '\$(curl -fsSL URL)' -- https://github.com/usuario/repositorio.git"
[[ -n "$REPO_URL" ]] || die "Falta la URL pública del repositorio. Uso: bash install.sh https://github.com/usuario/repositorio.git [rama]"
[[ "$REPO_URL" == https://github.com/* ]] || die "Por seguridad, la URL del código debe usar https://github.com/."
[[ ! -e "$APP_ROOT" ]] || die "$APP_ROOT ya existe; no se sobrescribió nada."

[[ -r /etc/os-release ]] || die "No pude identificar la distribución Linux."
. /etc/os-release
case "${ID:-} ${ID_LIKE:-}" in
  *debian*|*ubuntu*) ;;
  *) die "Este instalador requiere Debian o Ubuntu." ;;
esac

if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
  die "La instalación necesita una terminal para solicitar la contraseña del dashboard."
fi

printf 'IP del PBX: '
IFS= read -r PBX_IP </dev/tty || die "No pude leer la IP del PBX."
[[ "$PBX_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "La IP debe tener formato IPv4."
IFS=. read -r a b c d <<<"$PBX_IP"
for octet in "$a" "$b" "$c" "$d"; do
  (( 10#$octet <= 255 )) || die "La IP no es válida."
done

printf 'Puerto SMDR TCP [2300]: '
IFS= read -r PBX_PORT </dev/tty || die "No pude leer el puerto SMDR."
PBX_PORT="${PBX_PORT:-2300}"
[[ "$PBX_PORT" =~ ^[0-9]{1,5}$ ]] && (( 10#$PBX_PORT > 0 && 10#$PBX_PORT <= 65535 )) || die "El puerto debe estar entre 1 y 65535."

while :; do
  printf 'Contraseña del usuario admin del dashboard (mínimo 16 caracteres): '
  IFS= read -r -s DASHBOARD_PASSWORD </dev/tty || die "No pude leer la contraseña."
  printf '\nConfirma la contraseña: '
  IFS= read -r -s DASHBOARD_PASSWORD_CONFIRM </dev/tty || die "No pude confirmar la contraseña."
  printf '\n'
  (( ${#DASHBOARD_PASSWORD} >= 16 )) || { printf 'Usa al menos 16 caracteres.\n' >&2; continue; }
  [[ "$DASHBOARD_PASSWORD" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'Usa solo letras, números, punto, guion o guion bajo.\n' >&2; continue; }
  [[ "$DASHBOARD_PASSWORD" == "$DASHBOARD_PASSWORD_CONFIRM" ]] || { printf 'Las contraseñas no coinciden.\n' >&2; continue; }
  break
done
unset DASHBOARD_PASSWORD_CONFIRM

info "Instalando dependencias de sistema y Node.js ${NODE_MAJOR}"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git build-essential pkg-config libssl-dev openssl
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt-get install -y nodejs
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= NODE_MAJOR )) || die "Se requiere Node.js ${NODE_MAJOR} o posterior."
npm install --global "pnpm@${PNPM_VERSION}"

info "Instalando Rust estable"
export PATH="/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
command -v cargo >/dev/null 2>&1 || die "No quedó disponible Cargo."

info "Descargando el proyecto desde GitHub"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_ROOT"
[[ -f "$APP_ROOT/Cargo.toml" && -f "$APP_ROOT/web/package.json" ]] || die "El repositorio debe contener Cargo.toml y web/package.json en la raíz."

info "Creando el usuario y los directorios de datos"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE_DIR" --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$STATE_DIR/data"
install -d -o root -g "$SERVICE_USER" -m 0750 "$SECRETS_DIR"

API_TOKEN="$(openssl rand -hex 32)"
AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
install -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0600 /dev/null "$STATE_DIR/config.toml"
cat >"$STATE_DIR/config.toml" <<EOF
pbx_ip = "$PBX_IP"
pbx_port = $PBX_PORT
smdr_password = ""
database_path = "$STATE_DIR/data/calls.sqlite3"
menu_did = ""
menu_areas = []
api_token = "$API_TOKEN"
EOF

install -o root -g "$SERVICE_USER" -m 0640 /dev/null "$SECRETS_DIR/web.env"
cat >"$SECRETS_DIR/web.env" <<EOF
AUTH_SECRET=$AUTH_SECRET
AUTH_TRUST_HOST=true
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD
RUST_API_URL=http://127.0.0.1:8787
RUST_API_TOKEN=$API_TOKEN
EOF
unset API_TOKEN AUTH_SECRET DASHBOARD_PASSWORD

info "Compilando el colector Rust y el dashboard"
cargo build --release --locked --manifest-path "$APP_ROOT/Cargo.toml"
cd "$APP_ROOT/web"
pnpm install --frozen-lockfile
NEXT_TELEMETRY_DISABLED=1 pnpm build

PNPM_BIN="$(command -v pnpm)"
[[ -x "$PNPM_BIN" ]] || die "No encontré el ejecutable de pnpm."

info "Configurando servicios systemd"
cat >/etc/systemd/system/linea-clara-smdr.service <<EOF
[Unit]
Description=Línea Clara SMDR collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$STATE_DIR
ExecStart=$APP_ROOT/target/release/ns500-smdr
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$STATE_DIR

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/linea-clara-web.service <<EOF
[Unit]
Description=Línea Clara web dashboard
After=network-online.target linea-clara-smdr.service
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_ROOT/web
EnvironmentFile=$SECRETS_DIR/web.env
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=$PNPM_BIN exec next start --hostname 0.0.0.0 --port 3001
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_ROOT/web/.next

[Install]
WantedBy=multi-user.target
EOF

chown -R root:root "$APP_ROOT"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_ROOT/web/.next"
chmod 0640 "$STATE_DIR/config.toml" "$SECRETS_DIR/web.env"
chown "$SERVICE_USER:$SERVICE_USER" "$STATE_DIR/config.toml"
systemctl daemon-reload
systemctl enable --now linea-clara-smdr.service linea-clara-web.service

printf '\nInstalación terminada.\n'
printf 'Dashboard: http://IP-DEL-SERVIDOR:3001\n'
printf 'Usuario: admin (la contraseña fue la que acabas de definir)\n'
printf 'En Configuración del PBX, captura la contraseña SMDR.\n'
printf 'Servicios: systemctl status linea-clara-smdr linea-clara-web\n'
printf 'Logs: journalctl -u linea-clara-smdr -u linea-clara-web -f\n'
printf 'El puerto 3001 debe permitirse solo desde la LAN de confianza.\n'
