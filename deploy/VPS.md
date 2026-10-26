# Развёртывание FinikFix на VPS (Ubuntu 24.04)

Сервер: `194.34.239.218`. Сайт работает за nginx, приложение слушает только `127.0.0.1:3000`.

## Структура на сервере

```
/opt/finikfix/
  current -> releases/<дата>-<sha>   активный релиз (симлинк)
  releases/                           последние 5 релизов, владелец deploy
  incoming/                           загруженные архивы
  shared/.env                         секреты сервиса (root:finikfix, 640)
  shared/build.env                    SITE_URL, METRIKA_ID, SITE_INN для сборки (без секретов)
  shared/data/                        заявки leads.jsonl (finikfix), не затрагивается обновлениями
  backups/                            ежедневные копии data и .env (14 штук)
```

Сервис `finikfix.service` работает от пользователя `finikfix` без прав root, логи: `journalctl -u finikfix`.
Пользователь `deploy` не имеет административных прав, кроме `sudo systemctl restart finikfix` (`/etc/sudoers.d/finikfix-deploy`).

## Первичная настройка (один раз, от root, консоль провайдера)

```bash
curl -fsSL https://raw.githubusercontent.com/pavelvladimirovich258614-sys/sayt_finik_fix/claude/epic-hypatia-mxxztu/deploy/bootstrap-vps.sh -o /root/bootstrap-vps.sh
less /root/bootstrap-vps.sh
bash /root/bootstrap-vps.sh
```

В конце скрипт печатает отпечаток SSH-ключа сервера и строку для секрета `FINIKFIX_KNOWN_HOSTS`.

## Секреты GitHub (Settings → Secrets and variables → Actions)

| Секрет | Значение |
|---|---|
| `FINIKFIX_SSH_KEY` | содержимое приватного ключа `finikfix_actions` целиком |
| `FINIKFIX_KNOWN_HOSTS` | строка `194.34.239.218 ssh-ed25519 AAAA…`, напечатанная bootstrap-скриптом |

С Windows (PowerShell, установлен GitHub CLI `gh`, выполнен `gh auth login`):

```powershell
Get-Content C:\Users\vin-m\.ssh\finikfix_actions -Raw | gh secret set FINIKFIX_SSH_KEY --repo pavelvladimirovich258614-sys/sayt_finik_fix
"194.34.239.218 ssh-ed25519 AAAA..." | gh secret set FINIKFIX_KNOWN_HOSTS --repo pavelvladimirovich258614-sys/sayt_finik_fix
```

Ожидаемый host key сервера (сверяйте при настройке): `194.34.239.218 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOFzQ+N3gj1Q36bBHMkcuaR8LkasbbarRIPwcW1uxWeF`, отпечаток `SHA256:eqrQdVYY7zi1ooLOv4cIbKev3Ag5Gi0suuDm7+uevCQ`.

Без `gh`: GitHub → репозиторий → Settings → Secrets and variables → Actions → New repository secret.

## Деплой и откат

Actions → **Deploy FinikFix** → Run workflow (ветка `claude/epic-hypatia-mxxztu`), action = `deploy`.
Шаги: сборка и тесты на GitHub → загрузка архива → на сервере сборка, пробный запуск на порту 3999, переключение `current`, перезапуск, проверка. При ошибке на любом шаге предыдущая версия остаётся или возвращается автоматически.

Откат вручную: тот же workflow, action = `rollback` (возврат на предыдущий релиз).
Одновременно выполняется только один деплой (`concurrency` в GitHub и `flock` на сервере).

Автоматический деплой при каждом коммите не включён. Когда решите включить: добавить в `deploy.yml` триггер `push` с веткой `main` (после слияния проверенных изменений).

## Временный режим: только HTTP по IP

В nginx `POST /api/lead` возвращает 503, заявки по HTTP не принимаются (персональные данные). Обработчик в коде не тронут, локально его можно проверить: `curl -X POST http://127.0.0.1:3000/api/lead` на сервере.

## Когда появится домен

1. DNS: A-запись домена (и `www`) на `194.34.239.218`.
2. В `/opt/finikfix/shared/build.env` задать `SITE_URL=https://ваш-домен`, при необходимости `METRIKA_ID`, `SITE_INN`. Токены Telegram — в `shared/.env` (`TG_BOT_TOKEN`, `TG_CHAT_ID`), затем `sudo systemctl restart finikfix`.
3. Заменить `/etc/nginx/sites-available/finikfix` содержимым `deploy/nginx.conf` (с вашим `server_name`) и выпустить сертификат: `certbot --nginx -d домен -d www.домен`. Блок `location = /api/lead { return 503 … }` удалить — так включится приём заявок.
4. Запустить Deploy FinikFix, чтобы пересобрать сайт с canonical и sitemap.
