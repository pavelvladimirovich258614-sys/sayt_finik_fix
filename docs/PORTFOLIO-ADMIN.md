# Портфолио и админка: схема и порядок интеграции

## Принципы
- Без внешних зависимостей: SQLite через встроенный `node:sqlite` (Node 22), пароли через `node:crypto` (scrypt).
- Данные вне релизов: `DATA_DIR` (на VPS `/opt/finikfix/shared/data`): `portfolio.db` (+ `-wal`, `-shm`) и `uploads/`. Обновления сайта их не трогают, ночной бэкап их забирает.
- Публичная часть (чтение) работает сразу. Админка по умолчанию выключена и открывается только при `ADMIN_ENABLED=1` И по HTTPS (за nginx с `X-Forwarded-Proto: https`). По HTTP `/admin` и `/admin/api` отвечают 404 и не существуют для посетителя.

## Файлы
| Файл | Назначение |
|---|---|
| `src/portfolio/store.mjs` | SQLite: схема, работы, фото, админы, сессии |
| `src/portfolio/auth.mjs` | scrypt, сессии, cookie, CSRF, ограничение попыток входа |
| `src/portfolio/images.mjs` | проверка реального типа и размеров, очистка метаданных JPEG |
| `src/portfolio/multipart.mjs` | разбор multipart/form-data с лимитами |
| `src/portfolio/api.mjs` | HTTP-маршруты: публичные `/api/portfolio*`, `/media/*`, админские `/admin*` |
| `src/admin/` | интерфейс админки (HTML, JS, CSS), отдаётся только при разрешённом доступе |
| `scripts/create-admin.mjs` | безопасное создание администратора из консоли сервера (без пароля по умолчанию) |
| `src/client/app.js` | галерея `/portfolio/`, блок работ на главной, фильтры, увеличение |
| `src/templates.mjs`, `scripts/build.mjs` | страница `/portfolio/` (оболочка) и блок на главной |
| `test/portfolio.test.mjs` | тесты авторизации, CSRF, загрузки, прав и публичного API |

## API
Публичное: `GET /api/portfolio?category=&home=1`, `GET /api/portfolio/slides`, `GET /media/<32 hex>.<webp|jpg|png>`.
Админка (только HTTPS + `ADMIN_ENABLED=1`): `POST /admin/api/login`, `POST /admin/api/logout`, `GET /admin/api/me`, `GET|POST /admin/api/works`, `PUT|DELETE /admin/api/works/:id`, `POST /admin/api/works/:id/photos`, `DELETE /admin/api/photos/:id`, `POST /admin/api/reorder`.

## Защита
CSRF-токен сессии в заголовке `X-CSRF-Token` + проверка `Origin`; cookie `ff_sid`: HttpOnly, Secure, SameSite=Strict, срок 12 часов; в БД хранится только хеш токена сессии; вход: не больше 5 неудач за 15 минут на IP и на email; проверка magic bytes, лимиты (8 МБ файл, 10 файлов за запрос, 20 фото на работу, до 10000 px); имена файлов случайные, обход путей невозможен (имя проверяется регулярным выражением); загруженные файлы отдаются с `nosniff` и не исполняются; в JPEG удаляются EXIF/XMP (в том числе геометки).

## Порядок включения на production
1. Домен, HTTPS (certbot), деплой новой версии.
2. На сервере создать администратора: см. `deploy/VPS.md`, раздел «Админка».
3. В `/opt/finikfix/shared/.env` добавить `ADMIN_ENABLED=1`, `sudo systemctl restart finikfix`.
4. В nginx (конфиг с доменом) убрать запрет `/admin` и убедиться, что есть `proxy_set_header X-Forwarded-Proto $scheme`.
