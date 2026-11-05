#!/usr/bin/env bash
# РАЗОВАЯ установка помощника обслуживания FinikFix. Запускать от root в консоли сервера. Рекомендуемый способ (с проверкой самого установщика):
#   curl --proto '=https' --tlsv1.2 -fsSL https://raw.githubusercontent.com/pavelvladimirovich258614-sys/sayt_finik_fix/claude/epic-hypatia-mxxztu/deploy/install-ops-helper.sh -o /root/install-ops-helper.sh
#   echo "<SHA256 установщика из сообщения Claude>  /root/install-ops-helper.sh" | sha256sum -c - && less /root/install-ops-helper.sh && bash /root/install-ops-helper.sh
# Скрипт скачивает ДВА файла и ставит их, только если SHA-256 каждого совпадает с зашитым ниже (защита от подмены). Контрольные суммы
# проверяются тестом CI: они обязаны совпадать с файлами в репозитории. Меняет только: /usr/local/sbin/finikfix-ops,
# /usr/local/lib/finikfix/nginx_lead_block.py, /etc/sudoers.d/finikfix-ops. Конфигурацию nginx, .env и данные не трогает.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "запустите от root" >&2; exit 1; }
id deploy >/dev/null 2>&1 || { echo "нет пользователя deploy" >&2; exit 1; }
BASE_URL="https://raw.githubusercontent.com/pavelvladimirovich258614-sys/sayt_finik_fix/claude/epic-hypatia-mxxztu/deploy"
SHA_OPS="57a99c241268eca35e06f1e5ca42851db6486750747cbaa6286bdb7c19848ab5"
SHA_BLK="6e6af8d9097d5ec8c630719db59d535a12689748b672bc1f3b06832fbf883612"
command -v python3 >/dev/null || { apt-get update -y && apt-get install -y python3; }
command -v visudo >/dev/null || { echo "нет visudo" >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
fetch() { curl --proto '=https' --tlsv1.2 -fsSL "$BASE_URL/$1" -o "$TMP/$1"; }
check() { local got; got="$(sha256sum "$TMP/$1" | cut -d' ' -f1)"; [ "$got" = "$2" ] || { echo "КОНТРОЛЬНАЯ СУММА $1 НЕ СОВПАЛА (ожидалась $2, получена $got). Установка отменена." >&2; exit 1; }; echo "ok sha256 $1"; }
fetch finikfix-ops; fetch nginx_lead_block.py
check finikfix-ops "$SHA_OPS"; check nginx_lead_block.py "$SHA_BLK"
bash -n "$TMP/finikfix-ops"; python3 -m py_compile "$TMP/nginx_lead_block.py"
printf 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/finikfix-ops\n' > "$TMP/sudoers"
visudo -cf "$TMP/sudoers" >/dev/null
install -d -m 0755 -o root -g root /usr/local/lib/finikfix
install -m 0755 -o root -g root "$TMP/finikfix-ops" /usr/local/sbin/finikfix-ops
install -m 0755 -o root -g root "$TMP/nginx_lead_block.py" /usr/local/lib/finikfix/nginx_lead_block.py
install -m 0440 -o root -g root "$TMP/sudoers" /etc/sudoers.d/finikfix-ops
install -d -m 0700 /opt/finikfix/backups
echo "ГОТОВО. Проверка: sudo -u deploy sudo -n /usr/local/sbin/finikfix-ops status"
