#!/usr/bin/env bash
# =============================================================================
#  Espot VPN — One-line bootstrap
#  Paste this SINGLE command on your VPS:
#
#  bash <(curl -fsSL https://raw.githubusercontent.com/ibrarghaffardar382-lab/Espot-VPN/main/bootstrap.sh)
#
# =============================================================================

set -euo pipefail

# ── CONFIGURE THESE TWO LINES BEFORE PUBLISHING ──────────────────────────────
# URL of your zip file (GitHub Release asset, etc.)
ZIP_URL="https://github.com/ibrarghaffardar382-lab/Espot-VPN/releases/latest/download/espot-vpn-source-fixed.zip"
# URL of install.sh inside the zip (or same repo raw URL)
INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/ibrarghaffardar382-lab/Espot-VPN/main/install.sh"
# ─────────────────────────────────────────────────────────────────────────────

INSTALL_DIR="$HOME/espot-vpn"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     Espot VPN  —  Bootstrap              ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Pick downloader
if command -v curl &>/dev/null; then
  _get() { curl -fsSL "$1"; }
  _dl()  { curl -fsSL --progress-bar -o "$2" "$1"; }
elif command -v wget &>/dev/null; then
  _get() { wget -qO- "$1"; }
  _dl()  { wget -q --show-progress -O "$2" "$1"; }
else
  echo "✖  curl or wget is required. Install one and re-run."
  exit 1
fi

# Download install.sh into the target directory and run it
# The install.sh itself will download and extract the zip.
mkdir -p "$INSTALL_DIR"
echo "  Downloading installer…"
_get "$INSTALL_SCRIPT_URL" > "$INSTALL_DIR/install.sh"
chmod +x "$INSTALL_DIR/install.sh"
echo "  Launching installer…"
echo ""

# Pass the ZIP_URL in so install.sh doesn't need to ask for it
export ESPOT_ZIP_URL="https://github.com/ibrarghaffardar382-lab/Espot-VPN/releases/latest/download/espot-vpn-source-fixed.zip"
exec bash "$INSTALL_DIR/install.sh" "${@}"
