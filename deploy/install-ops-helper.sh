#!/usr/bin/env bash
# РАЗОВАЯ установка помощника обслуживания. Запускать от root в консоли сервера:
#   curl -fsSL https://raw.githubusercontent.com/pavelvladimirovich258614-sys/sayt_finik_fix/claude/epic-hypatia-mxxztu/deploy/install-ops-helper.sh -o /root/install-ops-helper.sh
#   less /root/install-ops-helper.sh      # просмотреть
#   bash /root/install-ops-helper.sh
# Что делает: кладёт /usr/local/sbin/finikfix-ops (root:root 0755, deploy не может его изменить) и разрешает пользователю deploy
# запускать ТОЛЬКО его через sudo. Ничего другого (nginx, .env, данные) не меняет.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "запустите от root" >&2; exit 1; }
id deploy >/dev/null 2>&1 || { echo "нет пользователя deploy" >&2; exit 1; }
URL="https://raw.githubusercontent.com/pavelvladimirovich258614-sys/sayt_finik_fix/claude/epic-hypatia-mxxztu/deploy/finikfix-ops"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
curl -fsSL "$URL" -o "$TMP"
bash -n "$TMP"
echo "sha256 помощника: $(sha256sum "$TMP" | cut -d' ' -f1)"
install -m 0755 -o root -g root "$TMP" /usr/local/sbin/finikfix-ops
cat > /etc/sudoers.d/finikfix-ops <<'S'
deploy ALL=(root) NOPASSWD: /usr/local/sbin/finikfix-ops
S
chmod 0440 /etc/sudoers.d/finikfix-ops
visudo -cf /etc/sudoers.d/finikfix-ops
install -d -m 0700 /opt/finikfix/backups
command -v python3 >/dev/null || apt-get install -y python3
echo "ГОТОВО. Проверка: sudo -u deploy sudo -n /usr/local/sbin/finikfix-ops status"
