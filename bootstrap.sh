#!/usr/bin/env bash
# =============================================================================
#  Espot VPN — One-line bootstrap
#
#  Run this single command on your VPS:
#    bash <(curl -fsSL https://raw.githubusercontent.com/ibrarghaffardar382-lab/Espot-VPN/main/bootstrap.sh)
#
#  Edit config later:
#    bash ~/espot-vpn/install.sh edit
# =============================================================================

set -euo pipefail

GITHUB_USER="ibrarghaffardar382-lab"
GITHUB_REPO="Espot-VPN"
GITHUB_BRANCH="main"

# GitHub auto-generates a branch zip — no Release needed
ZIP_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip"
RAW_BASE="https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}"

INSTALL_DIR="$HOME/espot-vpn"
TMP_DIR="$(mktemp -d -t espot-bootstrap-XXXXXX)"

# ── colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC}  $*"; }
info() { echo -e "${CYAN}ℹ${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
die()  { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }

clear
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     Espot VPN  —  Bootstrap              ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── check curl / wget ─────────────────────────────────────────────────────────
if command -v curl &>/dev/null; then
  _get() { curl -fsSL "$1"; }
  _dl()  { curl -fsSL --progress-bar -o "$2" "$1"; }
elif command -v wget &>/dev/null; then
  _get() { wget -qO- "$1"; }
  _dl()  { wget -q --show-progress -O "$2" "$1"; }
else
  die "curl or wget is required.  sudo apt-get install curl"
fi

# ── check unzip ───────────────────────────────────────────────────────────────
if ! command -v unzip &>/dev/null; then
  info "Installing unzip…"
  sudo apt-get install -y unzip -qq 2>/dev/null \
    || sudo yum install -y unzip -q 2>/dev/null \
    || die "Cannot install unzip. Run: sudo apt-get install unzip"
fi

# ── download repo zip ─────────────────────────────────────────────────────────
info "Downloading source from GitHub…"
info "URL: $ZIP_URL"
_dl "$ZIP_URL" "$TMP_DIR/repo.zip" || die "Download failed — is the repo public? Check: $ZIP_URL"
ok "Downloaded"

# ── extract ───────────────────────────────────────────────────────────────────
info "Extracting…"
unzip -q "$TMP_DIR/repo.zip" -d "$TMP_DIR/extracted"

# GitHub names the folder  REPO-BRANCH  e.g. Espot-VPN-main
EXTRACTED_ROOT="$TMP_DIR/extracted/${GITHUB_REPO}-${GITHUB_BRANCH}"
if [[ ! -d "$EXTRACTED_ROOT" ]]; then
  # fallback: find whatever folder was created
  EXTRACTED_ROOT="$(find "$TMP_DIR/extracted" -maxdepth 1 -mindepth 1 -type d | head -1)"
fi
[[ -d "$EXTRACTED_ROOT" ]] || die "Could not find extracted folder. Archive may be corrupt."
ok "Extracted to $EXTRACTED_ROOT"

# ── place install.sh ──────────────────────────────────────────────────────────
# Use the install.sh from inside the extracted repo if present,
# otherwise download it fresh from raw.githubusercontent.com
INSTALL_SH_SRC="$EXTRACTED_ROOT/install.sh"
if [[ ! -f "$INSTALL_SH_SRC" ]]; then
  info "Downloading install.sh from repo…"
  _get "${RAW_BASE}/install.sh" > "$TMP_DIR/install.sh" \
    || die "Could not download install.sh from $RAW_BASE/install.sh"
  INSTALL_SH_SRC="$TMP_DIR/install.sh"
fi

# Copy install.sh to a temp location and run it — it will move the source
chmod +x "$INSTALL_SH_SRC"

# Pass the already-extracted source path so install.sh skips re-downloading
export ESPOT_EXTRACTED_ROOT="$EXTRACTED_ROOT"
export ESPOT_ZIP_URL="$ZIP_URL"

exec bash "$INSTALL_SH_SRC" "${@}"
