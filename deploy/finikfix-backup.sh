#!/bin/sh
# Ежедневная копия данных FinikFix (ставится в /etc/cron.daily/finikfix-backup скриптом bootstrap-vps.sh).
# Заявки, загруженные фото, согласованная копия базы SQLite и настройки; хранится 14 последних архивов.
set -e
BASE="${FF_BASE:-/opt/finikfix}"
B="$BASE/backups"; D="$BASE/shared/data"
NODE="${FF_NODE:-/usr/bin/node}"
umask 077
mkdir -p "$B"
TMP="$(mktemp -d "$B/.tmp.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/stage"
# всё, кроме живых файлов базы (их нельзя копировать на лету)
tar -C "$BASE" --exclude='shared/data/portfolio.db*' -cf - shared/data shared/.env shared/build.env 2>/dev/null | tar -C "$TMP/stage" -xf -
# согласованная копия SQLite средствами самой базы
if [ -f "$D/portfolio.db" ]; then
  "$NODE" --no-warnings -e 'const { DatabaseSync } = require("node:sqlite"); const d = new DatabaseSync(process.argv[1]); d.exec("VACUUM INTO \x27" + process.argv[2].replace(/\x27/g, "") + "\x27"); d.close();' "$D/portfolio.db" "$TMP/stage/shared/data/portfolio.db" || {
    echo "VACUUM INTO не удался, копирую файлы базы как есть" >&2
    cp -a "$D"/portfolio.db* "$TMP/stage/shared/data/" 2>/dev/null || true
  }
fi
tar -czf "$B/finikfix-$(date +%Y%m%d).tar.gz" -C "$TMP/stage" .
ls -1t "$B"/finikfix-*.tar.gz | tail -n +15 | xargs -r rm -f
