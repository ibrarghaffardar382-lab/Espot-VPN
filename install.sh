#!/usr/bin/env bash
# =============================================================================
#  Espot VPN — Installer & Config Editor
#
#  First install (usually called by bootstrap.sh):
#    bash install.sh
#
#  Edit config later:
#    bash ~/espot-vpn/install.sh edit
# =============================================================================

set -euo pipefail

GITHUB_USER="ibrarghaffardar382-lab"
GITHUB_REPO="Espot-VPN"
GITHUB_BRANCH="main"
ZIP_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip"

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
die()  { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }
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
    echo -e "${RED}✖${NC}  This field is required."
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

# ── downloader ────────────────────────────────────────────────────────────────
if command -v curl &>/dev/null; then
  _dl() { curl -fsSL --progress-bar -o "$2" "$1"; }
elif command -v wget &>/dev/null; then
  _dl() { wget -q --show-progress -O "$2" "$1"; }
else
  die "curl or wget required.  sudo apt-get install curl"
fi

# ── write .env ────────────────────────────────────────────────────────────────
write_env() {
  mkdir -p "$BACKEND_DIR"
  cat > "$ENV_FILE" << EOF
# =============================================================================
#  Espot VPN — Environment Configuration
#  Generated: $(date '+%Y-%m-%d %H:%M:%S')
#  Edit with:  bash ~/espot-vpn/install.sh edit
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
  source <(grep -v '^\s*#' "$ENV_FILE" | grep -E '^[A-Z_]+=')
  set +o allexport
}

# ── summary ───────────────────────────────────────────────────────────────────
print_summary() {
  local pad="    "
  echo
  echo -e "${BOLD}${CYAN}┌─────────────────────────────────────────────────────────────┐${NC}"
  echo -e "${BOLD}${CYAN}│                 Espot VPN — Configuration                   │${NC}"
  echo -e "${BOLD}${CYAN}└─────────────────────────────────────────────────────────────┘${NC}"
  echo
  echo -e "${pad}${BOLD}DATABASE${NC}"
  echo -e "${pad}  URL              ${CYAN}${DATABASE_URL}${NC}"
  echo
  echo -e "${pad}${BOLD}SERVER${NC}"
  echo -e "${pad}  Port             ${CYAN}${PORT}${NC}"
  echo -e "${pad}  Install dir      ${CYAN}${INSTALL_DIR}${NC}"
  echo -e "${pad}  Env file         ${CYAN}${ENV_FILE}${NC}"
  echo
  echo -e "${pad}${BOLD}ADMIN CREDENTIALS${NC}"
  echo -e "${pad}  Username         ${CYAN}${ADMIN_USERNAME}${NC}"
  echo -e "${pad}  Password         ${CYAN}${ADMIN_PASSWORD}${NC}"
  echo -e "${pad}  Admin URL        ${CYAN}http://${GATEWAY_PUBLIC_HOST}${NC}"
  echo
  echo -e "${pad}${BOLD}SECURITY${NC}"
  echo -e "${pad}  JWT Secret       ${CYAN}${JWT_SECRET:0:20}…${NC}  (${#JWT_SECRET} chars — full value in .env)"
  echo
  echo -e "${pad}${BOLD}GATEWAY  (what the extension connects to)${NC}"
  echo -e "${pad}  Host             ${CYAN}${GATEWAY_PUBLIC_HOST}${NC}"
  echo -e "${pad}  Port             ${CYAN}${GATEWAY_PORT:-"shared with server (${PORT})"}${NC}"
  echo -e "${pad}  Scheme           ${CYAN}${GATEWAY_SCHEME}${NC}"
  echo -e "${pad}  Full address     ${CYAN}${GATEWAY_SCHEME}://${GATEWAY_PUBLIC_HOST}:${GATEWAY_PORT:-$PORT}${NC}"
  echo
}

# ── check deps ────────────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in node npm unzip; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    warn "Missing tools: ${missing[*]}"
    echo
    echo -e "  Install on Ubuntu/Debian:"
    echo -e "    ${CYAN}sudo apt-get update && sudo apt-get install -y unzip${NC}"
    echo -e "    ${CYAN}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${NC}"
    echo -e "    ${CYAN}sudo apt-get install -y nodejs${NC}"
    echo
    die "Install the above tools then re-run."
  fi
  local node_ver node_major
  node_ver="$(node -e 'process.stdout.write(process.versions.node)')"
  node_major="${node_ver%%.*}"
  if (( node_major < 18 )); then
    die "Node.js 18+ required (you have $node_ver). Upgrade and re-run."
  fi
}

# ── download & place source ───────────────────────────────────────────────────
download_and_extract() {
  hdr "  Downloading Espot VPN source"

  # If bootstrap.sh already extracted, reuse it
  if [[ -n "${ESPOT_EXTRACTED_ROOT:-}" && -d "${ESPOT_EXTRACTED_ROOT}" ]]; then
    info "Using already-extracted source from bootstrap…"
    local src_root="$ESPOT_EXTRACTED_ROOT"
  else
    info "Downloading from: $ZIP_URL"
    local tmp_zip tmp_dir
    tmp_zip="$(mktemp -t espot-XXXXXX.zip)"
    tmp_dir="$(mktemp -d -t espot-src-XXXXXX)"
    _dl "$ZIP_URL" "$tmp_zip" || die "Download failed. Is the repo public? URL: $ZIP_URL"
    unzip -t "$tmp_zip" &>/dev/null || die "Downloaded file is not a valid zip."
    unzip -q "$tmp_zip" -d "$tmp_dir"
    rm -f "$tmp_zip"
    # GitHub names the extracted folder  REPO-BRANCH
    local src_root="$tmp_dir/${GITHUB_REPO}-${GITHUB_BRANCH}"
    if [[ ! -d "$src_root" ]]; then
      src_root="$(find "$tmp_dir" -maxdepth 1 -mindepth 1 -type d | head -1)"
    fi
    [[ -d "$src_root" ]] || die "Could not locate extracted source folder."
  fi

  # Verify it contains the expected backend folder
  local found_backend
  found_backend="$(find "$src_root" -maxdepth 3 -name "espot-vpn-backend" -type d | head -1)"
  [[ -n "$found_backend" ]] || die "espot-vpn-backend not found inside the source. Check the repo structure."

  local real_src
  real_src="$(dirname "$found_backend")"

  # Back up old install if it exists
  if [[ -d "$INSTALL_DIR" ]]; then
    local bak="${INSTALL_DIR}.bak.$(date +%Y%m%d_%H%M%S)"
    warn "Existing install found — backing up to $bak"
    mv "$INSTALL_DIR" "$bak"
  fi

  cp -r "$real_src" "$INSTALL_DIR"

  # Always put a fresh copy of install.sh inside the install dir
  cp "${BASH_SOURCE[0]}" "$INSTALL_DIR/install.sh"
  chmod +x "$INSTALL_DIR/install.sh"

  ok "Source placed at $INSTALL_DIR"
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

  # ── 1. Database ──────────────────────────────────────────────────────────────
  hdr "  1 / 5  Database"
  info "Paste your PostgreSQL connection string."
  info "Format: postgresql://USER:PASSWORD@HOST:5432/DBNAME"
  echo
  ask DATABASE_URL "DATABASE_URL"

  # ── 2. Server port ───────────────────────────────────────────────────────────
  hdr "  2 / 5  Server port"
  ask PORT "HTTP port" "5000"

  # ── 3. Admin credentials ─────────────────────────────────────────────────────
  hdr "  3 / 5  Admin portal credentials"
  info "Used to log in to the web dashboard at http://YOUR_HOST"
  echo
  ask ADMIN_USERNAME "Admin username" "admin"
  ask ADMIN_PASSWORD "Admin password" "" secret

  # ── 4. JWT secret ────────────────────────────────────────────────────────────
  hdr "  4 / 5  Security"
  local auto_secret
  auto_secret="$(gen_secret)"
  info "Auto-generated JWT secret — press Enter to use it, or type your own."
  echo -e "  ${DIM}${auto_secret:0:28}…${NC}"
  echo
  printf "${BOLD}JWT secret${NC} ${DIM}[auto-generated]${NC}: "
  read -rs custom_secret; echo
  JWT_SECRET="${custom_secret:-$auto_secret}"
  ok "JWT secret set (${#JWT_SECRET} chars)"

  # ── 5. Gateway ───────────────────────────────────────────────────────────────
  hdr "  5 / 5  Proxy gateway"
  info "The public hostname your users' browsers will proxy through."
  warn "Must be your real server hostname — NOT localhost."
  info "Examples: 123.45.67.89  or  my-vpn.example.com"
  echo
  ask GATEWAY_PUBLIC_HOST "Public hostname / IP (no http://)"
  ask_optional GATEWAY_PORT "Proxy port (press Enter = same as server port $PORT)" ""
  ask GATEWAY_SCHEME "Scheme (http or https)" "http"

  # ── Write .env ───────────────────────────────────────────────────────────────
  hdr "  Writing configuration"
  write_env
  ok "Config saved → $ENV_FILE"

  # ── npm install ───────────────────────────────────────────────────────────────
  hdr "  Installing Node.js dependencies"
  (cd "$BACKEND_DIR" && npm install --silent)
  ok "Dependencies installed"

  # ── DB schema ─────────────────────────────────────────────────────────────────
  hdr "  Setting up database schema"
  info "Running drizzle-kit push…"
  if (cd "$BACKEND_DIR" && npm run db:push 2>&1); then
    ok "Database schema applied"
  else
    warn "db:push reported errors — DATABASE_URL may be wrong, or schema already exists."
    warn "To retry:  cd $BACKEND_DIR && npm run db:push"
  fi

  # ── start.sh shortcut ─────────────────────────────────────────────────────────
  cat > "$INSTALL_DIR/start.sh" << STARTSH
#!/usr/bin/env bash
cd "\$(dirname "\$0")/espot-vpn-backend"
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

  echo -e "  ${BOLD}Start the server:${NC}"
  echo -e "    ${CYAN}bash ~/espot-vpn/start.sh${NC}"
  echo
  echo -e "  ${BOLD}Admin dashboard:${NC}"
  echo -e "    ${CYAN}http://${GATEWAY_PUBLIC_HOST}:${PORT}${NC}"
  echo -e "    Login: ${CYAN}${ADMIN_USERNAME}${NC} / ${CYAN}${ADMIN_PASSWORD}${NC}"
  echo
  echo -e "  ${BOLD}Load Chrome extension:${NC}"
  echo -e "    Chrome → Extensions → Load unpacked → ${CYAN}${EXTENSION_DIR}${NC}"
  echo
  echo -e "  ${BOLD}Edit config later:${NC}"
  echo -e "    ${CYAN}bash ~/espot-vpn/install.sh edit${NC}"
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

  [[ -f "$ENV_FILE" ]] || die ".env not found. Run the installer first:  bash ~/espot-vpn/install.sh"
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
  ask GATEWAY_PUBLIC_HOST "Public hostname / IP" "${GATEWAY_PUBLIC_HOST:-}"
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
    ok ".env saved. Backup written as ${ENV_FILE}.bak.*"
    echo
    info "Restart the server to apply changes:"
    echo -e "  ${CYAN}bash ~/espot-vpn/start.sh${NC}"
    echo
    warn "If GATEWAY_PUBLIC_HOST changed — users must disconnect and reconnect the extension."
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
