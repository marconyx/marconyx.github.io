#!/usr/bin/env bash
#
# Startet den AI-Proxy dauerhaft im Hintergrund — als macOS-LaunchAgent bzw.
# systemd-User-Service. Danach läuft er ab Login von selbst und die App findet
# ihn automatisch; ein manueller Start entfällt.
#
#   npm run autostart:install
#   npm run autostart:status
#   npm run autostart:uninstall
#
# Der Proxy braucht keinen Key: Endpoint, Modell und Key kommen aus der App.
# Wer den Key lieber serverseitig hält, setzt AI_KEY vor dem Install-Aufruf.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.canyoning.topo-proxy"
PORT="${PORT:-8787}"
NODE_BIN="$(command -v node || true)"

if [ -z "$NODE_BIN" ]; then
  echo "Node wurde nicht gefunden. Bitte Node >= 18 installieren." >&2
  exit 1
fi

ACTION="${1:-}"

# ------------------------------------------------------------------- macOS

PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

macos_install() {
  mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_DIR/.logs"

  # Ein bereits geladener Agent muss weg, sonst greift die neue Definition nicht.
  launchctl unload "$PLIST" 2>/dev/null || true

  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT_DIR/tools/proxy.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
$( [ -n "${AI_KEY:-}" ] && printf '    <key>AI_KEY</key><string>%s</string>\n' "$AI_KEY" )
$( [ -n "${AI_UPSTREAM:-}" ] && printf '    <key>AI_UPSTREAM</key><string>%s</string>\n' "$AI_UPSTREAM" )
$( [ -n "${AI_MODEL:-}" ] && printf '    <key>AI_MODEL</key><string>%s</string>\n' "$AI_MODEL" )
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$PROJECT_DIR/.logs/proxy.log</string>
  <key>StandardErrorPath</key><string>$PROJECT_DIR/.logs/proxy.err.log</string>
</dict>
</plist>
PLIST_EOF

  launchctl load "$PLIST"
  echo "LaunchAgent installiert: $PLIST"
}

macos_uninstall() {
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "LaunchAgent entfernt."
}

# ------------------------------------------------------------------- Linux

UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/$LABEL.service"

linux_install() {
  mkdir -p "$UNIT_DIR"
  {
    echo "[Unit]"
    echo "Description=Canyoning Topo AI-Proxy"
    echo
    echo "[Service]"
    echo "ExecStart=$NODE_BIN $PROJECT_DIR/tools/proxy.mjs"
    echo "WorkingDirectory=$PROJECT_DIR"
    echo "Environment=PORT=$PORT"
    [ -n "${AI_KEY:-}" ] && echo "Environment=AI_KEY=$AI_KEY"
    [ -n "${AI_UPSTREAM:-}" ] && echo "Environment=AI_UPSTREAM=$AI_UPSTREAM"
    [ -n "${AI_MODEL:-}" ] && echo "Environment=AI_MODEL=$AI_MODEL"
    echo "Restart=always"
    echo
    echo "[Install]"
    echo "WantedBy=default.target"
  } > "$UNIT"

  systemctl --user daemon-reload
  systemctl --user enable --now "$LABEL.service"
  echo "systemd-Service installiert: $UNIT"
}

linux_uninstall() {
  systemctl --user disable --now "$LABEL.service" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl --user daemon-reload 2>/dev/null || true
  echo "systemd-Service entfernt."
}

# ------------------------------------------------------------------ Gemeinsam

check_status() {
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
    echo "Proxy läuft auf Port $PORT."
    curl -fsS "http://127.0.0.1:$PORT/api/health"
    echo
  else
    echo "Proxy antwortet auf Port $PORT nicht."
    return 1
  fi
}

case "$ACTION" in
  install)
    case "$(uname -s)" in
      Darwin) macos_install ;;
      Linux)  linux_install ;;
      *) echo "Nicht unterstütztes System. Proxy manuell starten: npm start" >&2; exit 1 ;;
    esac
    echo "Warte auf den Proxy…"
    for _ in $(seq 1 20); do
      sleep 0.5
      if check_status > /dev/null 2>&1; then
        echo
        check_status
        echo "Fertig. App öffnen: http://127.0.0.1:$PORT/"
        exit 0
      fi
    done
    echo "Der Proxy ist noch nicht erreichbar. Logs prüfen: $PROJECT_DIR/.logs/" >&2
    exit 1
    ;;
  uninstall)
    case "$(uname -s)" in
      Darwin) macos_uninstall ;;
      Linux)  linux_uninstall ;;
      *) echo "Nicht unterstütztes System." >&2; exit 1 ;;
    esac
    ;;
  status)
    check_status
    ;;
  *)
    echo "Aufruf: $0 {install|uninstall|status}" >&2
    exit 1
    ;;
esac
