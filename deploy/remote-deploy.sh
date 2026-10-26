#!/usr/bin/env bash
# Выполняется на VPS от пользователя deploy (GitHub Actions передаёт его через ssh stdin).
#   bash -s -- deploy <sha>   — выложить релиз из /opt/finikfix/incoming/rel-<sha>.tar.gz
#   bash -s -- rollback       — вернуться на предыдущий релиз
set -euo pipefail

BASE="${FF_BASE:-/opt/finikfix}"
RESTART_CMD="${FF_RESTART_CMD:-sudo -n /usr/bin/systemctl restart finikfix}"
APP_PORT="${FF_APP_PORT:-3000}"
SMOKE_PORT="${FF_SMOKE_PORT:-3999}"
KEEP="${FF_KEEP:-5}"
MODE="${1:-}"
SHA="${2:-}"

log() { echo "[deploy] $*"; }

# Один деплой за раз.
exec 9>"$BASE/.deploy.lock"
flock -n 9 || { echo "Другой деплой уже выполняется" >&2; exit 1; }

health() { # port
  local i
  for i in $(seq 1 20); do
    if curl -fsS -m 3 "http://127.0.0.1:$1/" -o /tmp/ff-health.$$ 2>/dev/null && grep -q "Ремонт" /tmp/ff-health.$$ \
       && curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$1/o-mastere/" \
       && curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$1/assets/style.css" \
       && curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$1/assets/fonts/unbounded-cyr.woff2" \
       && curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$1/assets/img/master.webp"; then
      rm -f /tmp/ff-health.$$; return 0
    fi
    sleep 1
  done
  rm -f /tmp/ff-health.$$; return 1
}

switch_to() { # release dir
  ln -sfn "$1" "$BASE/current.new"
  mv -T "$BASE/current.new" "$BASE/current"
}

restart_and_check() {
  $RESTART_CMD
  health "$APP_PORT"
}

current_real() { if [ -L "$BASE/current" ]; then readlink -f "$BASE/current"; fi; }

if [ "$MODE" = "rollback" ]; then
  CUR="$(current_real)"
  PREV="$(ls -1dt "$BASE"/releases/*/ 2>/dev/null | sed 's:/$::' | grep -vxF "$CUR" | head -n1 || true)"
  [ -n "$PREV" ] || { echo "Нет предыдущего релиза для отката" >&2; exit 1; }
  log "откат: $CUR -> $PREV"
  switch_to "$PREV"
  if restart_and_check; then log "откат выполнен: $(basename "$PREV")"; exit 0; fi
  echo "После отката проверка не прошла" >&2; exit 1
fi

[ "$MODE" = "deploy" ] && [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Использование: deploy <40-симв. sha> | rollback" >&2; exit 2; }
TAR="$BASE/incoming/rel-$SHA.tar.gz"
[ -f "$TAR" ] || { echo "Нет архива $TAR" >&2; exit 1; }

REL="$BASE/releases/$(date +%Y%m%d-%H%M%S)-${SHA:0:7}"
PREV="$(current_real)"
mkdir "$REL"
tar -xzf "$TAR" -C "$REL"
echo "$SHA" > "$REL/.release-sha"
ln -s "$BASE/shared/build.env" "$REL/.env"   # нечувствительные настройки сборки (SITE_URL, METRIKA_ID, SITE_INN)

cleanup_fail() { rm -rf "$REL"; }
log "сборка релиза ${SHA:0:7}"
if ! (cd "$REL" && node scripts/build.mjs); then cleanup_fail; echo "Сборка не удалась" >&2; exit 1; fi

log "предварительная проверка на порту $SMOKE_PORT"
SMOKE_DATA="$(mktemp -d)"
(cd "$REL" && HOST=127.0.0.1 PORT="$SMOKE_PORT" DATA_DIR="$SMOKE_DATA" exec node server.mjs >/dev/null 2>&1) 9>&- &
SPID=$!
if ! health "$SMOKE_PORT"; then
  kill "$SPID" 2>/dev/null || true; rm -rf "$SMOKE_DATA"; cleanup_fail
  echo "Предварительная проверка не прошла, текущая версия не тронута" >&2; exit 1
fi
kill "$SPID" 2>/dev/null || true; wait "$SPID" 2>/dev/null || true; rm -rf "$SMOKE_DATA"

log "переключение на новый релиз"
switch_to "$REL"
if ! restart_and_check; then
  echo "Проверка после запуска не прошла, откатываю" >&2
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    switch_to "$PREV"
    if restart_and_check; then echo "Откат выполнен, работает предыдущая версия" >&2; else echo "ВНИМАНИЕ: и после отката проверка не прошла" >&2; fi
  fi
  rm -rf "$REL"
  exit 1
fi

log "релиз $(basename "$REL") активен"
# Чистка: оставляем $KEEP последних релизов (текущий и предыдущий не трогаем) и свежие архивы.
CUR="$(current_real)"
ls -1dt "$BASE"/releases/*/ 2>/dev/null | sed 's:/$::' | tail -n +$((KEEP + 1)) | grep -vxF "$CUR" | grep -vxF "$PREV" | while read -r d; do rm -rf "$d"; done || true
ls -1t "$BASE"/incoming/rel-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f
log "готово"
