#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

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

printf '%s\n' '[1/5] Updating package lists...'
pkg update -y
printf '%s\n' '[2/5] Installing lightweight dependencies...'
pkg install -y bash ca-certificates curl git python

printf '%s\n' '[3/5] Installing Telegram bot runtime...'
python -m pip install --upgrade --no-cache-dir python-telegram-bot requests

printf '%s\n' '[4/5] Preparing NEXUS directories...'
mkdir -p "$HOME/.nexus/bots" "$HOME/.nexus/tools" "$HOME/.nexus/services" "$HOME/.nexus/logs" "$HOME/.nexus/agents" "$HOME/bin"

if command -v termux-setup-storage >/dev/null 2>&1 && [ ! -e "$HOME/storage/shared" ]; then
  printf '%s\n' '[5/5] Requesting shared-storage permission...'
  termux-setup-storage || printf '%s\n' 'Storage permission was not granted; file tools remain sandboxed.'
else
  printf '%s\n' '[5/5] Shared storage already configured or Termux:API is unavailable.'
fi

if command -v nexus >/dev/null 2>&1; then
  ln -sf "$(command -v nexus)" "$HOME/bin/nexus"
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
