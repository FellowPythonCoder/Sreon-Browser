#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-start}"

usage() {
  printf '%s\n' \
    'Sreon Search' \
    '' \
    'bash sreon.sh          Start search and open it on your Mac' \
    'bash sreon.sh stop     Stop search without deleting its settings' \
    'bash sreon.sh status   Show the container status' \
    'bash sreon.sh logs     Show application and setup logs' \
    '' \
    'Requires Docker Desktop on macOS, or Docker with Compose on Linux.' \
    'Set SREON_NO_OPEN=1 to skip opening your browser.' \
    'Set PORT in .env or your environment to change the local port.'
}

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 2
fi
case "$ACTION" in
  help|-h|--help) usage; exit 0 ;;
  start|stop|status|logs) ;;
  *) usage >&2; exit 2 ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
    export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
  else
    printf '%s\n' 'Docker is required for live search.' 'Install Docker Desktop for your Mac: https://www.docker.com/products/docker-desktop/' 'Open it once to complete setup, then run this command again.' >&2
    exit 1
  fi
fi
if ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' 'Docker Compose is missing. Install or update Docker Desktop, then try again.' >&2
  exit 1
fi

compose() {
  docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" "$@"
}

if ! docker info >/dev/null 2>&1; then
  if [ "$ACTION" = start ] && [ "$(uname -s)" = Darwin ]; then
    printf '%s\n' 'Opening Docker Desktop…'
    if ! open -a Docker; then
      printf '%s\n' 'Open Docker Desktop manually and complete its setup, then try again.' >&2
      exit 1
    fi
    attempt=0
    until docker info >/dev/null 2>&1; do
      attempt=$((attempt + 1))
      if [ "$attempt" -ge 60 ]; then
        printf '%s\n' 'Docker did not become ready. Check Docker Desktop and run this command again.' >&2
        exit 1
      fi
      sleep 2
    done
  else
    printf '%s\n' 'Docker is not running. Start Docker Desktop or your Docker engine first.' >&2
    exit 1
  fi
fi

case "$ACTION" in
  stop) compose down; exit 0 ;;
  status) compose ps -a; exit 0 ;;
  logs) compose logs --tail 100 sreon configure; exit 0 ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'curl is required to check search readiness. It is included with macOS.' >&2
  exit 1
fi
printf '%s\n' 'Starting Sreon Search. The first run downloads its search backend.'
if ! compose up --build -d; then
  printf '%s\n' 'Sreon could not start. Check the Docker message above. If the port is busy, set PORT=3001 and try again.' >&2
  exit 1
fi
if ! binding="$(compose port sreon 3000)"; then
  printf '%s\n' 'Could not find the search port. Run: bash sreon.sh status' >&2
  exit 1
fi
port="${binding##*:}"
case "$port" in
  ''|*[!0-9]*) printf '%s\n' 'Docker returned an invalid search port.' >&2; exit 1 ;;
esac
url="http://localhost:$port"
printf '%s\n' 'Waiting for the search service…'
attempt=0
until curl --fail --silent --max-time 3 "$url/api/health" | grep -Eq '"connected"[[:space:]]*:[[:space:]]*true'; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 45 ]; then
    printf '%s\n' "The interface is at $url, but the search backend is not ready." 'Run: bash sreon.sh status' 'Run: bash sreon.sh logs' 'You can try starting again. No search results are fabricated.' >&2
    exit 1
  fi
  sleep 2
done
printf '\nSreon Search is ready: %s\nStop it with: bash sreon.sh stop\n' "$url"
if [ "${SREON_NO_OPEN:-0}" != 1 ] && [ "$(uname -s)" = Darwin ]; then
  open "$url" || printf 'Open %s in your browser.\n' "$url"
fi
