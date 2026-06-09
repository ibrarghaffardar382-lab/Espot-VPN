#!/usr/bin/env bash
# =============================================================================
#  Espot VPN — Installer & Config Editor
#
#  First install:
#    bash install.sh
#
#  Edit config later:
#    bash install.sh edit
#
#  Run from anywhere — the script downloads and extracts the source itself.
# =============================================================================

set -euo pipefail

# ─── UPDATE THIS TO YOUR ZIP URL AFTER UPLOADING ────────────────────────────
# Paste your GitHub Release zip URL, Google Drive direct link, etc.
ZIP_URL="${ESPOT_ZIP_URL:-}"
# ─────────────────────────────────────────────────────────────────────────────

ZIP_NAME="espot-vpn.zip"
INSTALL_DIR="$HOME/espot-vpn"
BACKEND_DIR="$INSTALL_DIR/espot-vpn-backend"
EXTENSION_DIR="$INSTALL_DIR/espot-vpn-extension"
ENV_FILE="$BACKEND_DIR/.env"

# ── colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✔${NC}  $*"; }
info() { echo -e "${CYAN}ℹ${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✖${NC}  $*" >&2; }
die()  { err "$*"; exit 1; }
hdr()  { echo -e "\n${BOLD}${CYAN}$*${NC}"; echo -e "${DIM}$(printf '─%.0s' {1..60})${NC}"; }

# ── input helpers ─────────────────────────────────────────────────────────────
ask() {
  local var="$1" prompt="$2" default="${3:-}" secret="${4:-}"
  local value=""
  while true; do
    if [[ -n "$default" ]]; then
      printf "${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$prompt" "$default"
    else
      printf "${BOLD}%s${NC}: " "$prompt"
    fi
    if [[ "$secret" == "secret" ]]; then read -rs value; echo
    else read -r value; fi
    value="${value:-$default}"
    if [[ -n "$value" ]]; then printf -v "$var" '%s' "$value"; return; fi
    err "This field is required."
  done
}

ask_optional() {
  local var="$1" prompt="$2" default="${3:-}"
  if [[ -n "$default" ]]; then
    printf "${BOLD}%s${NC} ${DIM}[%s]${NC}: " "$prompt" "$default"
  else
    printf "${BOLD}%s${NC} ${DIM}(press Enter to skip)${NC}: " "$prompt"
  fi
  read -r value; value="${value:-$default}"
  printf -v "$var" '%s' "$value"
}

gen_secret() {
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null \
    || openssl rand -hex 32 2>/dev/null \
    || head -c 64 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48
}

# ── download & extract ────────────────────────────────────────────────────────
download_and_extract() {
  hdr "  Downloading Espot VPN source"

  # Resolve ZIP_URL — allow passing as env var or prompt
  if [[ -z "$ZIP_URL" ]]; then
    echo -e "  ${DIM}No ZIP_URL set. Enter the download URL for espot-vpn.zip:${NC}"
    ask ZIP_URL "ZIP download URL"
  fi

  # Pick downloader
  local dl_cmd=""
  if command -v curl &>/dev/null; then
    dl_cmd="curl -fsSL --progress-bar -o"
  elif command -v wget &>/dev/null; then
    dl_cmd="wget -q --show-progress -O"
  else
    die "curl or wget is required. Install one and re-run."
  fi

  local tmp_zip
  tmp_zip="$(mktemp -t espot-vpn-XXXXXX.zip)"
  info "Downloading from: $ZIP_URL"
  $dl_cmd "$tmp_zip" "$ZIP_URL" || die "Download failed. Check the URL and try again."
  ok "Downloaded"

  # Verify it's a valid zip
  if ! command -v unzip &>/dev/null; then
    die "unzip is required. Run: apt-get install unzip  (or yum install unzip)"
  fi
  unzip -t "$tmp_zip" &>/dev/null || die "Downloaded file is not a valid zip archive."

  # Extract to a temp dir first so we can find the inner folder regardless of zip structure
  local tmp_dir
  tmp_dir="$(mktemp -d -t espot-vpn-src-XXXXXX)"
  unzip -q "$tmp_zip" -d "$tmp_dir"
  rm -f "$tmp_zip"

  # Find the backend dir inside the extracted tree
  local found_backend
  found_backend="$(find "$tmp_dir" -maxdepth 4 -name "espot-vpn-backend" -type d | head -1)"
  if [[ -z "$found_backend" ]]; then
    die "Could not find espot-vpn-backend inside the zip. Check the archive structure."
  fi
  local src_root
  src_root="$(dirname "$found_backend")"

  # Move to install dir
  if [[ -d "$INSTALL_DIR" ]]; then
    warn "$INSTALL_DIR already exists — backing up to ${INSTALL_DIR}.bak.$(date +%Y%m%d_%H%M%S)"
    mv "$INSTALL_DIR" "${INSTALL_DIR}.bak.$(date +%Y%m%d_%H%M%S)"
  fi
  mv "$src_root" "$INSTALL_DIR"
  rm -rf "$tmp_dir"

  ok "Extracted to $INSTALL_DIR"
}

# ── write .env ────────────────────────────────────────────────────────────────
write_env() {
  mkdir -p "$BACKEND_DIR"
  cat > "$ENV_FILE" << EOF
# =============================================================================
#  Espot VPN — Environment Configuration
#  Generated: $(date '+%Y-%m-%d %H:%M:%S')
#  Edit with:  bash \$HOME/espot-vpn/install.sh edit
# =============================================================================

DATABASE_URL=${DATABASE_URL}
PORT=${PORT}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
JWT_SECRET=${JWT_SECRET}
GATEWAY_PUBLIC_HOST=${GATEWAY_PUBLIC_HOST}
GATEWAY_PORT=${GATEWAY_PORT}
GATEWAY_SCHEME=${GATEWAY_SCHEME}
EOF
  chmod 600 "$ENV_FILE"
}

load_env() {
  [[ -f "$ENV_FILE" ]] || return
  set -o allexport
  # shellcheck disable=SC1090
  source <(grep -v '^\s*#' "$ENV_FILE" | grep -E '^[A-Z_]+=')
  set +o allexport
}

# ── summary box ───────────────────────────────────────────────────────────────
print_summary() {
  local pad="    "
  echo
  echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────────────────┐${NC}"
  echo -e "${BOLD}${CYAN}│               Espot VPN — Configuration                 │${NC}"
  echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────────────────┘${NC}"
  echo
  echo -e "${pad}${BOLD}DATABASE${NC}"
  echo -e "${pad}  URL            ${CYAN}${DATABASE_URL}${NC}"
  echo
  echo -e "${pad}${BOLD}SERVER${NC}"
  echo -e "${pad}  Port           ${CYAN}${PORT}${NC}"
  echo -e "${pad}  Install dir    ${CYAN}${INSTALL_DIR}${NC}"
  echo -e "${pad}  Env file       ${CYAN}${ENV_FILE}${NC}"
  echo
  echo -e "${pad}${BOLD}ADMIN CREDENTIALS${NC}"
  echo -e "${pad}  Username       ${CYAN}${ADMIN_USERNAME}${NC}"
  echo -e "${pad}  Password       ${CYAN}${ADMIN_PASSWORD}${NC}"
  echo -e "${pad}  Admin URL      ${CYAN}http://${GATEWAY_PUBLIC_HOST}${NC}"
  echo
  echo -e "${pad}${BOLD}SECURITY${NC}"
  echo -e "${pad}  JWT Secret     ${CYAN}${JWT_SECRET:0:16}…${NC}  (${#JWT_SECRET} chars, full value in .env)"
  echo
  echo -e "${pad}${BOLD}GATEWAY  (extension proxy endpoint)${NC}"
  echo -e "${pad}  Host           ${CYAN}${GATEWAY_PUBLIC_HOST}${NC}"
  echo -e "${pad}  Port           ${CYAN}${GATEWAY_PORT:-"shared with server (${PORT})"}${NC}"
  echo -e "${pad}  Scheme         ${CYAN}${GATEWAY_SCHEME}${NC}"
  echo -e "${pad}  Proxy string   ${CYAN}${GATEWAY_SCHEME}://${GATEWAY_PUBLIC_HOST}:${GATEWAY_PORT:-$PORT}${NC}"
  echo
}

# ── check deps ────────────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in node npm unzip; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    err "Missing required tools: ${missing[*]}"
    echo
    echo -e "  Install on Ubuntu/Debian:"
    echo -e "    ${CYAN}sudo apt-get update && sudo apt-get install -y unzip${NC}"
    echo -e "    ${CYAN}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${NC}"
    echo -e "    ${CYAN}sudo apt-get install -y nodejs${NC}"
    echo
    die "Please install the above tools and re-run."
  fi
  local node_ver
  node_ver="$(node -e 'process.stdout.write(process.versions.node)')"
  local node_major="${node_ver%%.*}"
  if (( node_major < 20 )); then
    die "Node.js 20+ required (you have $node_ver). Upgrade and re-run."
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
#  INSTALL
# ═════════════════════════════════════════════════════════════════════════════
run_install() {
  clear
  echo -e "${BOLD}${CYAN}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║         Espot VPN  —  Installer          ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${DIM}This wizard downloads, installs, and configures Espot VPN.${NC}"
  echo -e "  ${DIM}Press Enter to accept a [default]. Passwords are hidden as you type.${NC}"
  echo

  check_deps
  download_and_extract

  # ── Database ────────────────────────────────────────────────────────────────
  hdr "  1 / 5  Database"
  info "PostgreSQL connection string — format:"
  info "  postgresql://USER:PASSWORD@HOST:5432/DBNAME"
  echo
  ask DATABASE_URL "DATABASE_URL"

  # ── Server ──────────────────────────────────────────────────────────────────
  hdr "  2 / 5  Server port"
  ask PORT "HTTP port" "5000"

  # ── Admin creds ──────────────────────────────────────────────────────────────
  hdr "  3 / 5  Admin portal credentials"
  info "Used to log in to the web dashboard."
  echo
  ask ADMIN_USERNAME "Admin username" "admin"
  ask ADMIN_PASSWORD "Admin password" "" secret

  # ── JWT secret ───────────────────────────────────────────────────────────────
  hdr "  4 / 5  Security"
  local auto_secret
  auto_secret="$(gen_secret)"
  info "Auto-generated JWT secret — press Enter to use it, or type your own."
  echo -e "  ${DIM}${auto_secret:0:24}…${NC}"
  echo
  printf "${BOLD}JWT secret${NC} ${DIM}[auto-generated]${NC}: "
  read -rs custom_secret; echo
  JWT_SECRET="${custom_secret:-$auto_secret}"
  ok "JWT secret set (${#JWT_SECRET} chars)"

  # ── Gateway ──────────────────────────────────────────────────────────────────
  hdr "  5 / 5  Proxy gateway"
  info "The public hostname your users' browsers will proxy through."
  warn "Must be your real server hostname — NOT localhost."
  info "Example: my-vpn.onrender.com  or  123.45.67.89"
  echo
  ask GATEWAY_PUBLIC_HOST "Public hostname (no http://)"
  ask_optional GATEWAY_PORT "Proxy port (blank = share server port $PORT)" ""
  ask GATEWAY_SCHEME "Scheme (http or https)" "http"

  # ── Write .env ───────────────────────────────────────────────────────────────
  hdr "  Writing .env"
  write_env
  ok "Config saved to $ENV_FILE"

  # ── npm install ───────────────────────────────────────────────────────────────
  hdr "  Installing Node.js dependencies"
  (cd "$BACKEND_DIR" && npm install --silent)
  ok "Dependencies installed"

  # ── DB schema ─────────────────────────────────────────────────────────────────
  hdr "  Setting up database schema"
  info "Running drizzle-kit push (applying schema to your database)…"
  if (cd "$BACKEND_DIR" && npm run db:push 2>&1); then
    ok "Database schema applied"
  else
    warn "db:push had errors — your DATABASE_URL may be wrong, or schema already exists."
    warn "Fix DATABASE_URL then run:  cd $BACKEND_DIR && npm run db:push"
  fi

  # ── Create start script ───────────────────────────────────────────────────────
  cat > "$INSTALL_DIR/start.sh" << 'STARTSH'
#!/usr/bin/env bash
cd "$(dirname "$0")/espot-vpn-backend"
exec npm start
STARTSH
  chmod +x "$INSTALL_DIR/start.sh"

  # ── Done ─────────────────────────────────────────────────────────────────────
  clear
  echo -e "${BOLD}${GREEN}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║        ✔  Install Complete!              ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"

  print_summary

  echo -e "  ${BOLD}Next steps:${NC}"
  echo
  echo -e "  ${DIM}Start the server:${NC}"
  echo -e "    ${CYAN}cd $BACKEND_DIR && npm start${NC}"
  echo
  echo -e "  ${DIM}Or use the shortcut:${NC}"
  echo -e "    ${CYAN}bash $INSTALL_DIR/start.sh${NC}"
  echo
  echo -e "  ${DIM}Admin dashboard:${NC}"
  echo -e "    ${CYAN}http://${GATEWAY_PUBLIC_HOST}${NC}  (login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD})"
  echo
  echo -e "  ${DIM}Load the Chrome extension:${NC}"
  echo -e "    Chrome → Extensions → Load unpacked → ${CYAN}${EXTENSION_DIR}${NC}"
  echo
  echo -e "  ${DIM}Edit config anytime:${NC}"
  echo -e "    ${CYAN}bash $INSTALL_DIR/install.sh edit${NC}"
  echo
}

# ═════════════════════════════════════════════════════════════════════════════
#  EDIT
# ═════════════════════════════════════════════════════════════════════════════
run_edit() {
  clear
  echo -e "${BOLD}${CYAN}"
  echo "  ╔══════════════════════════════════════════╗"
  echo "  ║      Espot VPN  —  Config Editor         ║"
  echo "  ╚══════════════════════════════════════════╝"
  echo -e "${NC}"

  [[ -f "$ENV_FILE" ]] || die ".env not found. Run installer first:  bash install.sh"
  load_env

  echo -e "  ${DIM}Current values shown in [brackets]. Press Enter to keep them.${NC}"
  echo

  hdr "  Database"
  ask DATABASE_URL "DATABASE_URL" "${DATABASE_URL:-}"

  hdr "  Server"
  ask PORT "HTTP port" "${PORT:-5000}"

  hdr "  Admin credentials"
  ask ADMIN_USERNAME "Admin username" "${ADMIN_USERNAME:-admin}"
  printf "${BOLD}Admin password${NC} ${DIM}[keep current]${NC}: "
  read -rs new_pass; echo
  ADMIN_PASSWORD="${new_pass:-${ADMIN_PASSWORD:-}}"
  [[ -n "$new_pass" ]] && ok "Password updated" || info "Password unchanged"

  hdr "  Security"
  warn "Changing the JWT secret will log out ALL active sessions."
  echo
  printf "${BOLD}JWT secret${NC} ${DIM}[keep current]${NC}: "
  read -rs new_secret; echo
  JWT_SECRET="${new_secret:-${JWT_SECRET:-}}"
  [[ -n "$new_secret" ]] && ok "JWT secret updated" || info "JWT secret unchanged"

  hdr "  Proxy gateway"
  ask GATEWAY_PUBLIC_HOST "Public hostname" "${GATEWAY_PUBLIC_HOST:-}"
  ask_optional GATEWAY_PORT "Proxy port (blank = share server port)" "${GATEWAY_PORT:-}"
  ask GATEWAY_SCHEME "Scheme (http / https)" "${GATEWAY_SCHEME:-http}"

  hdr "  Review changes"
  print_summary

  printf "${BOLD}Save changes? [Y/n]${NC}: "
  read -r confirm
  if [[ "${confirm:-y}" =~ ^[Yy]$ ]]; then
    cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
    write_env
    echo
    ok ".env saved. Previous config backed up as ${ENV_FILE}.bak.*"
    echo
    info "Restart the server to apply:"
    echo -e "  ${CYAN}cd $BACKEND_DIR && npm start${NC}"
    echo
    warn "If GATEWAY_PUBLIC_HOST changed — users must disconnect and reconnect the extension."
    warn "If ADMIN_PASSWORD changed — update it in the DB seed or directly via the admin UI."
  else
    info "No changes saved."
  fi
  echo
}

# ═════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═════════════════════════════════════════════════════════════════════════════
case "${1:-install}" in
  edit|config|configure) run_edit  ;;
  install|*)             run_install ;;
esac
