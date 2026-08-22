#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

CURRENT_STEP="initialization"
trap 'status=$?; printf "\nNEXUS Termux setup failed during: %s (exit %s). Resolve the message above and rerun this installer.\n" "$CURRENT_STEP" "$status" >&2; exit "$status"' ERR
step() { CURRENT_STEP="$1"; printf '\n[%s] %s\n' "$2" "$1"; }

PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
HOME=${HOME:-/data/data/com.termux/files/home}
ARCH=$(uname -m)
case "$ARCH" in
  aarch64|arm64) ARCH_LABEL="arm64" ;;
  x86_64|amd64) ARCH_LABEL="x64" ;;
  armv7l|armv8l) ARCH_LABEL="arm" ;;
  *) ARCH_LABEL="$ARCH" ;;
esac

printf '%s\n' '======================================================='
printf '%s\n' 'NEXUS — TERMUX FOUNDATION'
printf '%s\n' '======================================================='
printf 'Detected: Termux/%s (%s)\n' "${TERMUX_VERSION:-unknown}" "$ARCH_LABEL"

if [ ! -d "$PREFIX" ] || ! command -v pkg >/dev/null 2>&1; then
  printf '%s\n' 'Error: this installer must run inside native Termux.' >&2
  exit 1
fi

step 'Updating package lists' '1/6'
pkg update -y
step 'Installing runtime dependencies' '2/6'
pkg install -y bash ca-certificates curl git python clang make nodejs-lts || pkg install -y nodejs
command -v node >/dev/null 2>&1 || { printf '%s\n' 'Node.js could not be installed. Run `pkg install nodejs` and retry.' >&2; exit 1; }

step 'Installing Python support' '3/6'
python -m pip install --upgrade --no-cache-dir python-telegram-bot requests

step 'Preparing NEXUS directories' '4/6'
mkdir -p "$HOME/.nexus/bots" "$HOME/.nexus/tools" "$HOME/.nexus/services" "$HOME/.nexus/logs" "$HOME/.nexus/agents" "$HOME/bin"

if command -v termux-setup-storage >/dev/null 2>&1 && [ ! -e "$HOME/storage/shared" ]; then
  step 'Requesting shared-storage permission' '5/6'
  termux-setup-storage || printf '%s\n' 'Storage permission was not granted; file tools remain sandboxed.'
else
  printf '%s\n' '[5/6] Shared storage already configured or Termux:API is unavailable.'
fi

if command -v nexus >/dev/null 2>&1; then
  ln -sf "$(command -v nexus)" "$HOME/bin/nexus"
fi

case ":$PATH:" in
  *":$HOME/bin:"*) ;;
  *) printf '\n%s\n' '# NEXUS Termux' >> "$HOME/.bashrc"; printf '%s\n' 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.bashrc" ;;
esac

printf '%s\n' '======================================================='
printf '%s\n' 'NEXUS Termux foundation installed.'
printf '%s\n' "Architecture: $ARCH_LABEL"
printf '%s\n' 'Reload with: source ~/.bashrc'
printf '%s\n' 'Use: nexus bot template-list'
printf '%s\n' '======================================================='
