#!/usr/bin/env bash
# Первичная настройка VPS для FinikFix (Ubuntu 24.04). Запускать ОДИН РАЗ от root через консоль провайдера.
#
#   curl -fsSL https://raw.githubusercontent.com/pavelvladimirovich258614-sys/sayt_finik_fix/claude/epic-hypatia-mxxztu/deploy/bootstrap-vps.sh -o /root/bootstrap-vps.sh
#   less /root/bootstrap-vps.sh        # просмотреть
#   bash /root/bootstrap-vps.sh
#
# Скрипт идемпотентен и ничего не перезаписывает: не трогает чужие сайты, .env, данные заявок,
# SSH-настройки и пользователей. Если находит чужое на порту 80 или чужие сайты nginx — останавливается.
set -euo pipefail

BRANCH="${FF_BRANCH:-claude/epic-hypatia-mxxztu}"
REPO="pavelvladimirovich258614-sys/sayt_finik_fix"
SERVER_IP="${FF_SERVER_IP:-194.34.239.218}"
BASE=/opt/finikfix
NODE_MAJOR=22

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nОШИБКА: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "запустите от root"
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "ожидалась Ubuntu, найдено: ${PRETTY_NAME:-?}"
id deploy >/dev/null 2>&1 || die "пользователь deploy не найден"

say "Аудит сервера"
echo "ОС: $PRETTY_NAME"; free -h | sed -n 1,2p; df -h / | sed -n 1,2p
echo "Node.js: $(command -v node >/dev/null && node -v || echo 'нет')"
echo "Слушающие порты:"; ss -ltnp | sed -n '1,30p'
echo "Содержимое /opt:"; ls -la /opt
echo "Сайты nginx:"; ls -la /etc/nginx/sites-enabled 2>/dev/null || echo "(nginx ещё не установлен)"
echo "Сервисы (не системные):"; systemctl list-units --type=service --state=running --no-legend | grep -vE 'systemd|dbus|ssh|cron|rsyslog|getty|polkit|udev|multipathd|unattended|snap|networkd|resolved|chrony|ModemManager|packagekit|udisks|irqbalance|qemu|serial|apparmor|fwupd|upower|accounts|rtkit' || true

if ss -ltn '( sport = :80 )' | grep -q LISTEN && ! ss -ltnp '( sport = :80 )' | grep -q nginx; then
  die "порт 80 занят не nginx — остановлено, чтобы не сломать чужой сервис"
fi
if [ -d "$BASE" ] && [ -n "$(ls -A "$BASE" 2>/dev/null)" ] && [ ! -f "$BASE/.finikfix-managed" ]; then
  die "$BASE уже существует и не создан этим скриптом — остановлено"
fi
if [ -d /etc/nginx/sites-enabled ]; then
  OTHER="$(ls -1 /etc/nginx/sites-enabled | grep -vxE 'default|finikfix' || true)"
  [ -z "$OTHER" ] || die "в nginx уже есть другие сайты ($OTHER) — остановлено, настройте вручную"
fi

say "Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git curl ca-certificates gnupg

if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  echo "Node.js уже подходит: $(node -v)"
else
  say "Node.js $NODE_MAJOR (репозиторий NodeSource, пакет подписан)"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
node -v; command -v node

say "Файлы настройки из репозитория ($BRANCH)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$TMP" --strip-components=1
for f in finikfix.service nginx-ip.conf finikfix-backup.sh; do [ -s "$TMP/deploy/$f" ] || die "нет файла deploy/$f в репозитории"; done

say "Пользователь и каталоги"
id finikfix >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --no-create-home --shell /usr/sbin/nologin finikfix
install -d -m 0755 "$BASE"
touch "$BASE/.finikfix-managed"
install -d -m 0755 -o deploy -g deploy "$BASE/releases" "$BASE/incoming"
install -d -m 0755 "$BASE/shared"
install -d -m 0750 -o finikfix -g finikfix "$BASE/shared/data"
install -d -m 0700 "$BASE/backups"

if [ ! -f "$BASE/shared/.env" ]; then
  # Секреты и настройки сервиса. Значения без комментариев (требование systemd EnvironmentFile).
  cat > "$BASE/shared/.env" <<EOF
PORT=3000
HOST=127.0.0.1
TRUST_PROXY=1
DATA_DIR=$BASE/shared/data
EOF
fi
chown root:finikfix "$BASE/shared/.env"; chmod 0640 "$BASE/shared/.env"
if [ ! -f "$BASE/shared/build.env" ]; then
  # Нечувствительные значения для сборки (читает пользователь deploy). Заполняются после подключения домена.
  printf '# SITE_URL=https://example.ru\n# METRIKA_ID=\n# SITE_INN=\n' > "$BASE/shared/build.env"
fi
chmod 0644 "$BASE/shared/build.env"

say "systemd: finikfix.service"
install -m 0644 "$TMP/deploy/finikfix.service" /etc/systemd/system/finikfix.service
systemctl daemon-reload
systemctl enable finikfix   # старт — при первом деплое, когда появится $BASE/current

say "sudo для deploy: только перезапуск finikfix"
cat > /etc/sudoers.d/finikfix-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart finikfix, /usr/bin/systemctl is-active finikfix, /usr/bin/journalctl -u finikfix -n 80 --no-pager
EOF
chmod 0440 /etc/sudoers.d/finikfix-deploy
visudo -cf /etc/sudoers.d/finikfix-deploy

say "nginx (режим по IP, приём заявок по HTTP закрыт)"
install -m 0644 "$TMP/deploy/nginx-ip.conf" /etc/nginx/sites-available/finikfix
ln -sfn /etc/nginx/sites-available/finikfix /etc/nginx/sites-enabled/finikfix
if [ -L /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default   # только симлинк стандартной заглушки nginx; сам файл остаётся
  echo "Отключена стандартная заглушка nginx (файл sites-available/default сохранён)"
fi
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

say "Ежедневная копия данных и настроек"
install -m 0755 "$TMP/deploy/finikfix-backup.sh" /etc/cron.daily/finikfix-backup

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  say "ufw активен: открываю 22, 80, 443"
  ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
else
  echo "ufw не активен — правил брандмауэра не менял."
fi

say "ГОТОВО. Отпечаток SSH-ключа сервера (сверьте с ранее проверенным: должен содержать +uevCQ)"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
echo
echo "Строка для GitHub-секрета FINIKFIX_KNOWN_HOSTS (скопируйте целиком, одной строкой):"
echo "$SERVER_IP $(awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub)"
echo
echo "Дальше: добавьте секреты FINIKFIX_SSH_KEY и FINIKFIX_KNOWN_HOSTS в GitHub и запустите workflow «Deploy FinikFix»."
